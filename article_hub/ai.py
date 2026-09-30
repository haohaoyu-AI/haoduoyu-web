"""直连模型 API：点一下就能让模型干活，不用起 Codex。

默认复用本机 Codex 配置里那个提供方（`~/.codex/config.toml` 的 model_providers 段），
也可以用 `data\\模型设置.json` 单独指定（换模型、换 key 都不影响 Codex）。
密钥只在本机进程里用，不打印、不写进日志。
"""

from __future__ import annotations

import json
import os
import re
import socket
from contextvars import ContextVar
from contextlib import contextmanager
import tomllib
import urllib.error
import urllib.request
from pathlib import Path

from . import config

SETTINGS_FILE = config.DATA / "模型设置.json"
CODEX_CONFIG = Path.home() / ".codex" / "config.toml"
DEFAULT_MODEL = "deepseek-v4-pro"
DEFAULT_BASE_URL = "https://api.deepseek.com"
MAX_RESPONSE_BYTES = 8 * 1024 * 1024
_RESPONSE_READ_CHUNK_BYTES = 64 * 1024
NETWORK_MODEL_CONFIG_ENV = "ARTICLE_HUB_NETWORK_MODEL_CONFIG"
NETWORK_MODEL_CONFIG_PROJECT = "project"
_request_profile = ContextVar('article_hub_ai_profile', default=None)


def network_model_config_is_project_only() -> bool:
    """Whether this console must use only its project-owned model profiles."""
    return os.environ.get(NETWORK_MODEL_CONFIG_ENV) == NETWORK_MODEL_CONFIG_PROJECT


@contextmanager
def using_profile(profile):
    token = _request_profile.set(profile)
    try:
        yield
    finally:
        _request_profile.reset(token)


class AiError(RuntimeError):
    """模型接口用不了（没配好、网络不通、返回异常）。"""

    def __init__(self, message, *, category='', http_status=None, error_code='',
                 provider='', model=''):
        super().__init__(str(message))
        self.category = str(category or '')
        self.http_status = http_status if type(http_status) is int else None
        self.error_code = str(error_code or '')
        self.provider = str(provider or '')
        self.model = str(model or '')


class _ResponseTooLarge(Exception):
    """Internal signal raised after reading only the configured limit + one byte."""


def _read_response_body(response) -> bytes:
    """Read a response incrementally, never consuming more than limit + one byte."""
    body = bytearray()
    while True:
        remaining = MAX_RESPONSE_BYTES + 1 - len(body)
        if remaining <= 0:
            raise _ResponseTooLarge()
        chunk = response.read(min(_RESPONSE_READ_CHUNK_BYTES, remaining))
        if not chunk:
            return bytes(body)
        body.extend(chunk)
        if len(body) > MAX_RESPONSE_BYTES:
            raise _ResponseTooLarge()


def _error_identity(info, model=None):
    return (str(info.get('name') or info.get('提供方') or ''),
            str(model or info.get('模型') or ''))


def _safe_error_detail(value, secret=''):
    """Keep useful provider diagnostics without echoing credentials."""
    text = str(value or '')
    if secret:
        text = text.replace(str(secret), '[已隐藏]')
    text = re.sub(r'(?i)bearer\s+[A-Za-z0-9._~+/-]+=*', 'Bearer [已隐藏]', text)
    text = re.sub(r'(?i)(api[_ -]?key|authorization|token)\s*[:=]\s*[^\s,;]+',
                  r'\1=[已隐藏]', text)
    return text[:240]


def _error_code(value):
    code = str(value or '')
    return code if re.fullmatch(r'[A-Za-z0-9_.-]{1,100}', code) else ''


def _from_codex_config() -> dict:
    """从 Codex 的 config.toml 里读 base_url / key / 模型。"""
    if not CODEX_CONFIG.exists():
        return {}
    try:
        data = tomllib.loads(CODEX_CONFIG.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    provider = data.get("model_providers", {}).get(data.get("model_provider"), {})
    return {
        "base_url": provider.get("base_url", ""),
        "api_key": provider.get("experimental_bearer_token") or os.environ.get(provider.get("env_key", ""), ""),
        "模型": data.get("model", ""),
        "wire_api": provider.get("wire_api", "chat"),
    }


def legacy_settings() -> dict:
    """本机可用的模型设置：先看 data\\模型设置.json，再看 Codex 配置。"""
    merged = {"base_url": DEFAULT_BASE_URL, "api_key": "", "模型": DEFAULT_MODEL, "wire_api": "chat"}
    for source in (_from_codex_config(), _local_settings()):
        for key, value in source.items():
            if value:
                merged[key] = value
    if not merged["base_url"].startswith("http"):
        merged["base_url"] = DEFAULT_BASE_URL
    return merged


def settings() -> dict:
    if _request_profile.get() is not None:
        return dict(_request_profile.get())
    provider = os.environ.get('ARTICLE_HUB_PROVIDER')
    if provider:
        from .model_settings import resolve
        return resolve(provider, os.environ.get('ARTICLE_HUB_MODEL', ''))
    if network_model_config_is_project_only():
        from .model_settings import project_settings
        return project_settings()
    return legacy_settings()


def _local_settings() -> dict:
    if not SETTINGS_FILE.exists():
        return {}
    try:
        raw = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    if not isinstance(raw, dict):
        return {}
    return {key: str(value) for key, value in raw.items() if value}


def ready() -> tuple[bool, str]:
    """能不能直接用；不能的话给一句人话。"""
    info = settings()
    if not info["api_key"]:
        if network_model_config_is_project_only():
            return False, "开发区尚未配置专用模型服务，请在本地控制台的模型设置中配置；设置保存在 data/模型服务.json。"
        return False, ("没有找到模型密钥。可以在 data\\模型设置.json 里写 "
                       '{"base_url": "...", "api_key": "...", "模型": "deepseek-v4-pro"}')
    return True, f"用 {info['模型']}（{info['base_url']}）"


def chat(messages: list[dict], *, model: str | None = None, temperature: float = 0.7,
         max_tokens: int = 6000, timeout: int = 240, thinking: bool | None = None) -> str:
    """调一次对话接口，返回正文。

    注意：这些是推理模型，正文之前会先花 token 思考，max_tokens 给小了会得到空正文。
    """
    info = settings()
    provider_name, actual_model = _error_identity(info, model)
    if not info["api_key"]:
        message = ("开发区尚未配置专用模型服务，请在本地控制台的模型设置中配置。"
                   if network_model_config_is_project_only()
                   else "没有配置模型密钥，先看 data\\模型设置.json 或 Codex 配置。")
        raise AiError(message, category='authentication', provider=provider_name, model=actual_model)
    responses = info.get("wire_api") == "responses"
    if responses:
        payload = {"model": model or info["模型"], "input": messages,
                   "max_output_tokens": max_tokens, "store": False}
    else:
        payload = {"model": model or info["模型"], "messages": messages,
                   "temperature": temperature, "max_tokens": max_tokens}
    endpoint = "/responses" if responses else "/chat/completions"
    selected_model = (model or info['模型']).lower().rsplit('/', 1)[-1]
    if thinking is not None:
        if not responses and selected_model.startswith(('doubao-seed-', 'deepseek-')):
            # DeepSeek (including Ark's DeepSeek models) otherwise spends the
            # small search/filter budget on reasoning and can return no JSON.
            payload['thinking'] = {'type': 'enabled' if thinking else 'disabled'}
        elif responses and selected_model.startswith('deepseek-'):
            payload['reasoning'] = {'effort': 'high' if thinking else 'none'}
    request = urllib.request.Request(
        info["base_url"].rstrip("/") + endpoint,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Authorization": "Bearer " + info["api_key"],
                 "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            try:
                response_body = _read_response_body(response)
            except _ResponseTooLarge as exc:
                raise AiError(
                    f"模型接口响应超过 {MAX_RESPONSE_BYTES} 字节上限，已停止读取。",
                    category='response_too_large', provider=provider_name, model=actual_model,
                ) from exc
            except (TimeoutError, socket.timeout) as exc:
                raise AiError(
                    f"读取模型接口响应超时。提供方 {provider_name or '未标明'}，实际型号 {actual_model or '未标明'}。",
                    category='timeout', provider=provider_name, model=actual_model,
                ) from exc
            except Exception as exc:
                raise AiError(
                    f"读取模型接口响应失败。提供方 {provider_name or '未标明'}，实际型号 {actual_model or '未标明'}。",
                    category='network', provider=provider_name, model=actual_model,
                ) from exc
            raw = response_body.decode("utf-8")
            try:
                data = json.loads(raw)
            except ValueError as exc:
                raise AiError("模型地址返回了网页或非 JSON 内容；请检查接口地址和接口格式是否匹配。",
                              category='response_format', provider=provider_name,
                              model=actual_model) from exc
    except AiError:
        raise
    except _ResponseTooLarge as exc:
        raise AiError(
            f"模型接口响应超过 {MAX_RESPONSE_BYTES} 字节上限，已停止读取。",
            category='response_too_large', provider=provider_name, model=actual_model,
        ) from exc
    except urllib.error.HTTPError as exc:
        try:
            detail = _read_response_body(exc).decode("utf-8", "replace")
        except _ResponseTooLarge as read_exc:
            raise AiError(
                f"模型接口错误响应超过 {MAX_RESPONSE_BYTES} 字节上限，已停止读取。",
                category='response_too_large', http_status=exc.code,
                provider=provider_name, model=actual_model,
            ) from read_exc
        except (TimeoutError, socket.timeout) as read_exc:
            raise AiError(
                f"读取模型接口错误响应超时。提供方 {provider_name or '未标明'}，实际型号 {actual_model or '未标明'}。",
                category='timeout', http_status=exc.code,
                provider=provider_name, model=actual_model,
            ) from read_exc
        except Exception as read_exc:
            raise AiError(
                f"读取模型接口错误响应失败。提供方 {provider_name or '未标明'}，实际型号 {actual_model or '未标明'}。",
                category='network', http_status=exc.code,
                provider=provider_name, model=actual_model,
            ) from read_exc
        finally:
            try:
                exc.close()
            except Exception:
                pass
        try:
            payload_error = json.loads(detail).get('error', {})
        except (ValueError, AttributeError):
            payload_error = {}
        if not isinstance(payload_error, dict):
            payload_error = {}
        code = _error_code(payload_error.get('code') or payload_error.get('type'))
        detail_text = _safe_error_detail(payload_error.get('message') or detail,
                                         info.get('api_key', ''))
        lowered = (code + ' ' + detail_text).lower()
        if code == 'ModelNotOpen':
            category = 'model_not_enabled'
            message = (f"模型 {actual_model} 尚未开通（ModelNotOpen）。"
                       "读取型号成功不代表已获调用权限；请在当前服务控制台开通该模型服务，"
                       "或手动选择已开通的型号后重试。无需重新填写密钥。")
        elif exc.code == 404 or 'notfound' in lowered or 'not found' in lowered:
            category = 'model_or_endpoint_unavailable'
            message = (f"接口返回 HTTP {exc.code}"
                       + (f"（{code}）" if code else '')
                       + f"：型号或接入点不存在，或当前账户无访问权限。提供方 {provider_name or '未标明'}，"
                       + f"实际型号 {actual_model or '未标明'}。请核对该型号对应的接口地址、协议与账户权限。")
        elif exc.code == 401:
            category = 'authentication'
            message = (f"接口返回 HTTP 401：鉴权失败。提供方 {provider_name or '未标明'}，"
                       f"实际型号 {actual_model or '未标明'}。请核对该服务对应的密钥。")
        elif exc.code == 403:
            category = 'permission'
            message = (f"接口返回 HTTP 403：当前账户没有调用权限。提供方 {provider_name or '未标明'}，"
                       f"实际型号 {actual_model or '未标明'}。请检查服务账户授权。")
        elif exc.code == 429:
            category = 'rate_limit'
            message = (f"接口返回 HTTP 429：服务限流或额度不足。提供方 {provider_name or '未标明'}，"
                       f"实际型号 {actual_model or '未标明'}。")
        elif ('image' in lowered or 'vision' in lowered or '图片' in detail_text or '图像' in detail_text) \
                and any(word in lowered for word in ('unsupported', 'not support', '不支持', 'invalid image')):
            category = 'image_input_unsupported'
            message = (f"接口返回 HTTP {exc.code}：当前接口或型号不支持图片输入。提供方 "
                       f"{provider_name or '未标明'}，实际型号 {actual_model or '未标明'}。")
        else:
            category = 'api_error'
            message = f"接口返回 HTTP {exc.code}" + (f"（{code}）" if code else '')
            if detail_text:
                message += f"：{detail_text}"
        raise AiError(message, category=category, http_status=exc.code,
                      error_code=code, provider=provider_name,
                      model=actual_model) from exc
    except Exception as exc:
        reason = getattr(exc, 'reason', exc)
        if isinstance(reason, (TimeoutError, socket.timeout)):
            category = 'timeout'
            message = (f"模型接口读取超时。提供方 {provider_name or '未标明'}，"
                       f"实际型号 {actual_model or '未标明'}。")
        else:
            category = 'network'
            safe_reason = _safe_error_detail(reason, info.get('api_key', ''))
            message = f"连不上模型接口：{safe_reason}"
        raise AiError(message, category=category, provider=provider_name,
                      model=actual_model) from exc
    if not isinstance(data, dict):
        raise AiError("接口返回格式异常，预期 JSON 对象。", category='response_format',
                      provider=provider_name, model=actual_model)
    if responses:
        if data.get("error") or data.get("status") == "failed":
            raise AiError("模型接口执行失败：" + _safe_error_detail(data.get("error") or "未知错误", info.get('api_key', '')),
                          category='api_error', provider=provider_name, model=actual_model)
        if data.get("status") == "incomplete":
            raise AiError("模型输出未完成；请增大 max_tokens 后重试。",
                          category='response_format', provider=provider_name, model=actual_model)
        text = "\n".join(part.get("text", "") for item in data.get("output", [])
                         if item.get("type") == "message"
                         for part in item.get("content", []) if part.get("type") == "output_text").strip()
        if not text:
            raise AiError("模型未返回正文；请检查输出，或增大 max_tokens 后重试。",
                          category='response_format', provider=provider_name, model=actual_model)
        return text
    choices = data.get("choices") or []
    if not choices:
        raise AiError("接口没返回预期的候选内容。", category='response_format',
                      provider=provider_name, model=actual_model)
    message = choices[0].get("message") or {}
    text = (message.get("content") or "").strip()
    if not text:
        raise AiError("模型只输出了思考、没给出正文；把 max_tokens 调大一点再试。",
                      category='response_format', provider=provider_name, model=actual_model)
    return text
