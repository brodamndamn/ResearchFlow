import hashlib
import hmac
from ipaddress import ip_address
from typing import Literal

Environment = Literal["development", "production", "test"]


def _canonical_ip(value: str) -> str:
    return ip_address(value.strip()).compressed


def resolve_client_ip(
    peer_ip: str,
    forwarded_for: str | None,
    environment: Environment,
) -> str:
    """解析客户端地址；生产环境只接受本机反向代理提供的 X-Forwarded-For。"""

    peer = ip_address(peer_ip.strip())
    if environment == "production" and peer.is_loopback and forwarded_for:
        candidate = forwarded_for.split(",", maxsplit=1)[0].strip()
        try:
            return _canonical_ip(candidate)
        except ValueError:
            pass
    return peer.compressed


def should_bypass_rate_limit(peer_ip: str, environment: Environment) -> bool:
    """开发环境仅允许套接字真实来源为 loopback 的请求绕过限额。"""

    return environment == "development" and ip_address(peer_ip.strip()).is_loopback


def hash_ip(client_ip: str, secret: str | bytes) -> str:
    key = secret.encode() if isinstance(secret, str) else secret
    canonical = _canonical_ip(client_ip).encode()
    return hmac.new(key, canonical, hashlib.sha256).hexdigest()
