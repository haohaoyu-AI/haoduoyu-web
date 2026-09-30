"""Exact-origin policy for the local console and an optional HTTPS proxy origin."""

from __future__ import annotations

import ipaddress
import os
import re
from dataclasses import dataclass
from urllib.parse import urlsplit


EXTERNAL_ORIGIN_ENV = "ARTICLE_HUB_ALLOWED_ORIGIN"
_DNS_LABEL = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")


@dataclass(frozen=True)
class AccessSource:
    origin: str
    authority: str
    secure: bool
    external: bool


def _host_authority(host: str, port: int | None) -> tuple[str, str]:
    if not host or any(ord(char) <= 32 or char in "\\%" for char in host):
        raise ValueError("主机名无效")
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        normalized = host.casefold()
        if normalized.endswith(".") or len(normalized) > 253:
            raise ValueError("主机名必须使用规范形式")
        labels = normalized.split(".")
        if not labels or any(not _DNS_LABEL.fullmatch(label) for label in labels):
            raise ValueError("主机名格式无效")
        host_part = normalized
    else:
        host_part = f"[{address.compressed}]" if address.version == 6 else str(address)
    authority = host_part if port is None else f"{host_part}:{port}"
    return host_part, authority


def parse_external_origin(value: str) -> AccessSource:
    """Accept one canonical HTTPS origin, without path, wildcard, or credentials."""
    if not isinstance(value, str) or not value or len(value) > 512:
        raise ValueError("外部访问源必须是一个 HTTPS 源，例如 https://content.example.invalid:8443")
    if any(ord(char) <= 32 or ord(char) == 127 for char in value):
        raise ValueError("外部访问源不能包含空白或控制字符")
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError as exc:
        raise ValueError("外部访问源的主机或端口无效") from exc
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username is not None
            or parsed.password is not None or parsed.path or parsed.query or parsed.fragment):
        raise ValueError("外部访问源必须是无路径、无凭据的 HTTPS 源")
    effective_port = 443 if port is None else port
    if not 1 <= effective_port <= 65535:
        raise ValueError("外部访问源端口无效")
    host_part, _ = _host_authority(parsed.hostname, None)
    bare_host = host_part[1:-1] if host_part.startswith("[") else host_part
    try:
        address = ipaddress.ip_address(bare_host)
    except ValueError:
        address = None
    if (bare_host == "localhost" or bare_host.endswith(".localhost")
            or (address is not None and address.is_loopback)):
        raise ValueError("外部访问源不能指向 localhost 或回环地址")
    authority = host_part if effective_port == 443 else f"{host_part}:{effective_port}"
    canonical = f"https://{authority}"
    if value != canonical:
        raise ValueError("外部访问源必须使用规范格式；默认 HTTPS 端口 443 可省略")
    return AccessSource(canonical, authority, True, True)


def configured_external_source() -> AccessSource | None:
    value = os.environ.get(EXTERNAL_ORIGIN_ENV)
    if value is None:
        return None
    return parse_external_origin(value)


def _request_origin(value: str) -> AccessSource | None:
    if not isinstance(value, str) or not value or any(
            ord(char) <= 32 or ord(char) == 127 for char in value):
        return None
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError:
        return None
    if (parsed.scheme not in {"http", "https"} or not parsed.hostname
            or parsed.username is not None or parsed.password is not None
            or parsed.path or parsed.query or parsed.fragment):
        return None
    default_port = 80 if parsed.scheme == "http" else 443
    host_part, _ = _host_authority(parsed.hostname, None)
    authority = host_part if port in (None, default_port) else f"{host_part}:{port}"
    return AccessSource(f"{parsed.scheme}://{authority}", authority,
                        parsed.scheme == "https", False)


def _request_authority(value: str) -> str | None:
    if not isinstance(value, str) or not value or any(
            ord(char) <= 32 or ord(char) == 127 for char in value):
        return None
    try:
        parsed = urlsplit("//" + value)
        port = parsed.port
    except ValueError:
        return None
    if (not parsed.hostname or parsed.username is not None or parsed.password is not None
            or parsed.path or parsed.query or parsed.fragment):
        return None
    host_part, _ = _host_authority(parsed.hostname, None)
    return host_part if port is None else f"{host_part}:{port}"


def _header_values(headers, name: str) -> list[str]:
    get_all = getattr(headers, "get_all", None)
    values = get_all(name) if callable(get_all) else None
    if values is not None:
        return [str(value) for value in values]
    value = headers.get(name) if headers is not None else None
    return [] if value is None else [str(value)]


def match_request_source(headers, port: int, *, test_https_origin: str | None = None) -> AccessSource | None:
    """Match a single Host and Origin pair; proxy forwarding headers are ignored."""
    if type(port) is not int or not 1 <= port <= 65535:
        return None
    hosts = _header_values(headers, "Host")
    origins = _header_values(headers, "Origin")
    if len(hosts) != 1 or len(origins) != 1:
        return None
    origin = _request_origin(origins[0].strip())
    host = _request_authority(hosts[0].strip())
    if origin is None or host is None:
        return None

    local_authority = f"127.0.0.1:{port}"
    local = AccessSource(f"http://{local_authority}", local_authority, False, False)
    candidates = [local]
    if test_https_origin is not None:
        try:
            from .console_network import parse_loopback_https_origin

            test_source = parse_loopback_https_origin(test_https_origin)
        except ValueError:
            return None
        if test_source.authority != local_authority:
            return None
        candidates.append(test_source)
    try:
        external = configured_external_source()
    except ValueError:
        return None
    if external is not None:
        candidates.append(external)
    for source in candidates:
        if (origin.origin.casefold() == source.origin.casefold()
                and host.casefold() == source.authority.casefold()):
            return source
    return None


def request_uses_secure_origin(headers, port: int, *, test_https_origin: str | None = None) -> bool:
    source = match_request_source(headers, port, test_https_origin=test_https_origin)
    return bool(source and source.secure)
