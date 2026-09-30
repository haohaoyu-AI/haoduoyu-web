"""Single-user, development-local console authentication."""

from __future__ import annotations

import getpass
import hashlib
import hmac
import json
import os
import secrets
import threading
import time
from dataclasses import dataclass
from pathlib import Path

from . import config


AUTH_CONFIG = Path(config.DATA) / "console-auth.json"
COOKIE_NAME = "haoduoyu_dev_session"
SESSION_TTL_SECONDS = 8 * 60 * 60
KDF_NAME = "pbkdf2_sha256"
KDF_ITERATIONS = 600_000
MIN_KDF_ITERATIONS = 300_000
MAX_KDF_ITERATIONS = 1_500_000
MAX_PASSWORD_CHARS = 1024
MAX_CONFIG_BYTES = 4096
FAILURE_WINDOW_SECONDS = 10 * 60
FAILURE_LIMIT = 5
MAX_ACTIVE_SESSIONS = 32


@dataclass(frozen=True)
class CredentialRecord:
    username: str
    salt: bytes
    digest: bytes
    iterations: int


@dataclass(frozen=True)
class AuthSession:
    username: str
    csrf_token: str
    expires_at: float
    credential_fingerprint: str


@dataclass(frozen=True)
class LoginResult:
    status: str
    session_token: str = ""
    session: AuthSession | None = None


class AuthManager:
    """Credentials live on disk; opaque sessions and rate limits live in memory."""

    def __init__(self, config_path: Path | None = None, root: Path | None = None,
                 clock=time.monotonic):
        self.config_path = Path(config_path or AUTH_CONFIG)
        self.root = Path(root or config.ROOT)
        self.clock = clock
        self._sessions: dict[str, AuthSession] = {}
        self._failures: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def _safe_config_path(self) -> Path | None:
        try:
            root = self.root.resolve(strict=True)
            target = self.config_path
            if target.is_symlink() or bool(getattr(os.path, "isjunction", lambda _: False)(target)):
                return None
            parent = target.parent.resolve(strict=False)
            if not parent.is_relative_to(root):
                return None
            if target.exists() and (target.is_symlink()
                    or bool(getattr(os.path, "isjunction", lambda _: False)(target))):
                return None
            return parent / target.name
        except (OSError, ValueError):
            return None

    @staticmethod
    def _password_record(username: str, password: str) -> dict:
        if not isinstance(username, str) or not username.strip() or len(username) > 64:
            raise ValueError("用户名须为 1 到 64 个字符")
        if any(ord(char) < 32 for char in username):
            raise ValueError("用户名不能包含控制字符")
        if not isinstance(password, str) or not 12 <= len(password) <= MAX_PASSWORD_CHARS:
            raise ValueError("密码长度须为 12 到 1024 个字符")
        try:
            password_bytes = password.encode("utf-8")
        except UnicodeError as exc:
            raise ValueError("密码格式无效") from exc
        salt = secrets.token_bytes(16)
        digest = hashlib.pbkdf2_hmac("sha256", password_bytes, salt,
                                     KDF_ITERATIONS)
        return {
            "schema": 1,
            "username": username,
            "kdf": KDF_NAME,
            "iterations": KDF_ITERATIONS,
            "salt": salt.hex(),
            "digest": digest.hex(),
        }

    def save_credentials(self, username: str, password: str) -> None:
        target = self._safe_config_path()
        if target is None:
            raise ValueError("登录配置路径不在开发工作区内或包含链接")
        target.parent.mkdir(parents=True, exist_ok=True)
        record = self._password_record(username, password)
        payload = (json.dumps(record, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
        if len(payload) > MAX_CONFIG_BYTES:
            raise ValueError("登录配置大小超出限制")
        temporary = target.parent / f".{target.name}.{secrets.token_hex(8)}.tmp"
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with os.fdopen(descriptor, "wb") as stream:
                stream.write(payload)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, target)
        except Exception:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass
            raise

    def load_credentials(self) -> CredentialRecord | None:
        target = self._safe_config_path()
        if target is None:
            return None
        try:
            if not target.is_file() or target.stat().st_size > MAX_CONFIG_BYTES:
                return None
            raw = json.loads(target.read_text(encoding="utf-8"))
            if (not isinstance(raw, dict) or type(raw.get("schema")) is not int
                    or raw.get("schema") != 1 or raw.get("kdf") != KDF_NAME):
                return None
            username = raw.get("username")
            iterations = raw.get("iterations")
            if (not isinstance(username, str) or not username.strip() or len(username) > 64
                    or any(ord(char) < 32 for char in username)
                    or type(iterations) is not int
                    or not MIN_KDF_ITERATIONS <= iterations <= MAX_KDF_ITERATIONS):
                return None
            salt_text, digest_text = raw.get("salt"), raw.get("digest")
            if not isinstance(salt_text, str) or not isinstance(digest_text, str):
                return None
            salt, digest = bytes.fromhex(salt_text), bytes.fromhex(digest_text)
            if len(salt) != 16 or len(digest) != 32:
                return None
            return CredentialRecord(username, salt, digest, iterations)
        except (OSError, UnicodeError, ValueError, TypeError, json.JSONDecodeError):
            return None

    def _reserve_login_attempt(self, peer: str, now: float) -> bool:
        with self._lock:
            recent = [when for when in self._failures.get(peer, [])
                      if now - when < FAILURE_WINDOW_SECONDS]
            if len(recent) >= FAILURE_LIMIT:
                self._failures[peer] = recent
                return False
            recent.append(now)
            self._failures[peer] = recent
            return True

    @staticmethod
    def _credential_fingerprint(record: CredentialRecord) -> str:
        material = (record.username.encode("utf-8") + b"\0" + record.salt + b"\0"
                    + record.digest + record.iterations.to_bytes(8, "big"))
        return hashlib.sha256(material).hexdigest()

    def login(self, username: str, password: str, peer: str) -> LoginResult:
        record = self.load_credentials()
        if record is None:
            return LoginResult("unavailable")
        peer = str(peer or "unknown")[:128]
        now = self.clock()
        if not self._reserve_login_attempt(peer, now):
            return LoginResult("rate_limited")
        if not isinstance(username, str) or not isinstance(password, str) or len(password) > MAX_PASSWORD_CHARS:
            matched = False
        else:
            try:
                calculated = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"),
                                                 record.salt, record.iterations)
                matched = (hmac.compare_digest(username.encode("utf-8"),
                                                record.username.encode("utf-8"))
                           and hmac.compare_digest(calculated, record.digest))
            except UnicodeError:
                matched = False
        if not matched:
            return LoginResult("invalid")
        with self._lock:
            self._failures.pop(peer, None)
            expired = [token for token, session in self._sessions.items()
                       if session.expires_at <= now]
            for token in expired:
                self._sessions.pop(token, None)
            while len(self._sessions) >= MAX_ACTIVE_SESSIONS:
                self._sessions.pop(next(iter(self._sessions)))
            token = secrets.token_urlsafe(32)
            session = AuthSession(username=record.username,
                                  csrf_token=secrets.token_urlsafe(32),
                                  expires_at=now + SESSION_TTL_SECONDS,
                                  credential_fingerprint=self._credential_fingerprint(record))
            self._sessions[token] = session
        return LoginResult("ok", token, session)

    def get_session(self, token: str | None) -> AuthSession | None:
        if not isinstance(token, str) or not 40 <= len(token) <= 128:
            return None
        now = self.clock()
        with self._lock:
            session = self._sessions.get(token)
            if session is None:
                return None
            if session.expires_at <= now:
                self._sessions.pop(token, None)
                return None
            return session

    def logout(self, token: str | None) -> None:
        if isinstance(token, str):
            with self._lock:
                self._sessions.pop(token, None)

    @staticmethod
    def token_from_cookie(headers) -> str | None:
        get_all = getattr(headers, "get_all", None)
        values = get_all("Cookie") if callable(get_all) else None
        if values is None:
            value = headers.get("Cookie") if headers is not None else None
            values = [] if value is None else [value]
        if len(values) != 1:
            return None
        matches: list[str] = []
        for part in str(values[0]).split(";"):
            name, separator, value = part.strip().partition("=")
            if separator and name == COOKIE_NAME:
                matches.append(value.strip())
        if len(matches) != 1 or not matches[0]:
            return None
        return matches[0]

    def session_for_request(self, handler) -> AuthSession | None:
        record = self.load_credentials()
        if record is None:
            return None
        token = self.token_from_cookie(handler.headers)
        session = self.get_session(token)
        if session is None:
            return None
        fingerprint = self._credential_fingerprint(record)
        if not hmac.compare_digest(session.credential_fingerprint, fingerprint):
            self.logout(token)
            return None
        return session


AUTH_MANAGER = AuthManager()


def configure_local_auth() -> bool:
    """Interactively install one local username/password verifier without echoing it."""
    manager = AuthManager()
    if manager.load_credentials() is not None:
        answer = input("开发区登录配置已存在，是否替换？[y/N] ").strip().casefold()
        if answer != "y":
            print("未更改登录配置。")
            return False
    username = input("本地用户名：").strip()
    password = getpass.getpass("本地密码（至少 12 位）：")
    confirmation = getpass.getpass("再次输入密码：")
    if not hmac.compare_digest(password.encode("utf-8", "surrogatepass"),
                               confirmation.encode("utf-8", "surrogatepass")):
        raise ValueError("两次输入的密码不一致")
    manager.save_credentials(username, password)
    print("开发区登录配置已保存。请重新启动开发服务。")
    return True


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="设置好多鱼图文本地开发区登录凭据")
    parser.add_argument("--setup", action="store_true", help="交互式设置单人本地登录")
    arguments = parser.parse_args()
    if not arguments.setup:
        parser.error("请使用 --setup")
    try:
        configure_local_auth()
    except (OSError, ValueError) as exc:
        raise SystemExit(str(exc))
