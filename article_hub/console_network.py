"""Explicit HTTPS LAN-test configuration and exact client-IP enforcement."""

from __future__ import annotations

import ipaddress
import os
import ssl
from dataclasses import dataclass
from http.server import ThreadingHTTPServer
from pathlib import Path
from typing import Iterable


@dataclass(frozen=True)
class LanTestConfig:
    bind_address: str
    port: int
    allowed_device_ips: tuple[str, ...]
    certificate_path: Path
    private_key_path: Path
    origin: str


def _safe_ipv4(value: str, label: str) -> ipaddress.IPv4Address:
    if not isinstance(value, str) or not value or value != value.strip():
        raise ValueError(f"{label}必须是规范 IPv4 地址")
    try:
        address = ipaddress.ip_address(value)
    except ValueError as exc:
        raise ValueError(f"{label}必须是规范 IPv4 地址") from exc
    if (address.version != 4 or not address.is_private or address.is_loopback
            or address.is_link_local or address.is_multicast or address.is_unspecified
            or address.is_reserved):
        raise ValueError(f"{label}必须是可用于局域网测试的私有 IPv4 地址")
    if str(address) != value:
        raise ValueError(f"{label}必须使用规范 IPv4 格式")
    return address


def _candidate_file(root: Path, value: str | Path, label: str) -> Path:
    candidate = Path(root).resolve(strict=True)
    raw = Path(value)
    if not raw.is_absolute():
        raw = candidate / raw
    try:
        resolved = raw.resolve(strict=True)
        resolved.relative_to(candidate)
    except (OSError, ValueError) as exc:
        raise ValueError(f"{label}必须位于当前开发候选内") from exc
    if raw.is_symlink() or bool(getattr(os.path, "isjunction", lambda _: False)(raw)):
        raise ValueError(f"{label}不能是链接")
    if not resolved.is_file():
        raise ValueError(f"{label}必须是现有文件")
    cursor = raw.parent
    while cursor != candidate and candidate in cursor.parents:
        if cursor.is_symlink() or bool(getattr(os.path, "isjunction", lambda _: False)(cursor)):
            raise ValueError(f"{label}路径不能经过链接")
        cursor = cursor.parent
    return resolved


def build_lan_test_config(*, root: Path, bind_address: str | None, port: int | None,
                          allowed_device_ips: Iterable[str] | None,
                          certificate_path: str | Path | None,
                          private_key_path: str | Path | None) -> LanTestConfig:
    """Validate every required LAN-test setting without opening a socket."""
    if (not bind_address or port is None or not allowed_device_ips
            or not certificate_path or not private_key_path):
        raise ValueError("局域网测试必须提供监听地址、端口、允许设备 IP、证书和私钥")
    if type(port) is not int or not 1024 <= port <= 65535:
        raise ValueError("局域网测试端口必须在 1024 到 65535 之间")
    bind_ip = _safe_ipv4(bind_address, "监听地址")
    ips = tuple(_safe_ipv4(item, "允许设备 IP") for item in allowed_device_ips)
    if not ips or len(ips) > 8 or len(set(ips)) != len(ips):
        raise ValueError("允许设备 IP 必须是 1 到 8 个不重复的精确地址")
    if bind_ip in ips:
        raise ValueError("监听地址不能同时作为允许的远程设备地址")
    cert = _candidate_file(root, certificate_path, "测试证书")
    key = _candidate_file(root, private_key_path, "测试私钥")
    if cert == key:
        raise ValueError("证书与私钥必须是不同文件")
    build_tls_context(cert, key)
    return LanTestConfig(str(bind_ip), port, tuple(str(item) for item in ips),
                         cert, key, f"https://{bind_ip}:{port}")


def build_tls_context(certificate_path: str | Path,
                      private_key_path: str | Path) -> ssl.SSLContext:
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.options |= getattr(ssl, "OP_NO_COMPRESSION", 0)
    try:
        context.load_cert_chain(str(certificate_path), str(private_key_path))
    except (OSError, ssl.SSLError, ValueError) as exc:
        raise ValueError("开发区 HTTPS 证书或私钥无效，拒绝启动") from exc
    return context


def parse_loopback_https_origin(value: str):
    """Accept only an exact HTTPS origin for the loopback TLS validation server."""
    from .console_access import AccessSource
    from urllib.parse import urlsplit

    if not isinstance(value, str) or not value or value != value.strip():
        raise ValueError("回环 HTTPS 来源无效")
    try:
        parsed = urlsplit(value)
        port = parsed.port
        host = ipaddress.ip_address(parsed.hostname or "")
    except (ValueError, TypeError) as exc:
        raise ValueError("回环 HTTPS 来源无效") from exc
    if (parsed.scheme != "https" or parsed.username is not None or parsed.password is not None
            or parsed.path or parsed.query or parsed.fragment
            or host != ipaddress.IPv4Address("127.0.0.1")
            or port is None or not 1024 <= port <= 65535
            or value != f"https://127.0.0.1:{port}"):
        raise ValueError("回环 HTTPS 来源必须精确使用 https://127.0.0.1:端口")
    authority = f"127.0.0.1:{port}"
    return AccessSource(value, authority, True, False)


def peer_ip_allowed(client_address, allowed_ips: Iterable[str]) -> bool:
    try:
        raw = client_address[0] if isinstance(client_address, tuple) else client_address
        peer = ipaddress.ip_address(str(raw).split("%", 1)[0])
        if isinstance(peer, ipaddress.IPv6Address) and peer.ipv4_mapped:
            peer = peer.ipv4_mapped
        allowed = {str(ipaddress.ip_address(item)) for item in allowed_ips}
    except (IndexError, TypeError, ValueError):
        return False
    return str(peer) in allowed


class RestrictedHTTPSServer(ThreadingHTTPServer):
    """HTTPS server that checks the accepted socket's actual peer IP."""

    daemon_threads = True
    block_on_close = True

    def __init__(self, server_address, handler_class, *, allowed_client_ips: Iterable[str],
                 test_https_origin: str | None = None):
        allowed = tuple(allowed_client_ips)
        if not allowed:
            raise ValueError("HTTPS 测试服务必须配置精确的客户端 IP 白名单")
        self.allowed_client_ips = frozenset(str(ipaddress.ip_address(item)) for item in allowed)
        self.test_https_origin = test_https_origin
        if test_https_origin is not None:
            parsed = parse_loopback_https_origin(test_https_origin)
            if parsed.authority != f"127.0.0.1:{int(server_address[1])}":
                raise ValueError("回环 HTTPS 来源与测试服务端口不一致")
        super().__init__(server_address, handler_class)

    def verify_request(self, request, client_address) -> bool:
        return peer_ip_allowed(client_address, self.allowed_client_ips)


def _create_https_server(*, bind_address: str, port: int, handler_class,
                         certificate_path: str | Path, private_key_path: str | Path,
                         allowed_client_ips: Iterable[str],
                         test_https_origin: str | None = None) -> RestrictedHTTPSServer:
    context = build_tls_context(certificate_path, private_key_path)
    server = RestrictedHTTPSServer((bind_address, port), handler_class,
                                   allowed_client_ips=allowed_client_ips,
                                   test_https_origin=test_https_origin)
    try:
        server.socket = context.wrap_socket(server.socket, server_side=True)
    except Exception:
        server.server_close()
        raise
    server.test_certificate_path = Path(certificate_path)
    server.scheme = "https"
    return server


def create_lan_test_server(config: LanTestConfig, handler_class) -> RestrictedHTTPSServer:
    """Create a server on the exact configured interface; never widens the bind."""
    if not isinstance(config, LanTestConfig):
        raise TypeError("必须使用经过验证的局域网测试配置")
    return _create_https_server(
        bind_address=config.bind_address,
        port=config.port,
        handler_class=handler_class,
        certificate_path=config.certificate_path,
        private_key_path=config.private_key_path,
        allowed_client_ips=config.allowed_device_ips,
    )


def create_loopback_https_test_server(*, port: int, handler_class,
                                     certificate_path: str | Path,
                                     private_key_path: str | Path) -> RestrictedHTTPSServer:
    """Create the phase validation server on loopback only."""
    if type(port) is not int or (port != 0 and not 1024 <= port <= 65535):
        raise ValueError("回环 HTTPS 测试端口无效")
    server = _create_https_server(
        bind_address="127.0.0.1",
        port=port,
        handler_class=handler_class,
        certificate_path=certificate_path,
        private_key_path=private_key_path,
        allowed_client_ips=("127.0.0.1",),
        test_https_origin=None,
    )
    server.test_https_origin = f"https://127.0.0.1:{server.server_port}"
    return server
