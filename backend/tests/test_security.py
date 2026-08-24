from app.security import hash_ip, resolve_client_ip, should_bypass_rate_limit


def test_production_accepts_forwarded_ip_only_from_loopback_proxy() -> None:
    assert (
        resolve_client_ip("127.0.0.1", "198.51.100.4, 127.0.0.1", "production")
        == "198.51.100.4"
    )
    assert (
        resolve_client_ip("203.0.113.8", "198.51.100.4", "production") == "203.0.113.8"
    )


def test_invalid_forwarded_ip_falls_back_to_socket_peer() -> None:
    assert resolve_client_ip("127.0.0.1", "not-an-ip", "production") == "127.0.0.1"


def test_development_bypass_requires_actual_loopback_peer() -> None:
    assert should_bypass_rate_limit("127.0.0.1", "development") is True
    assert should_bypass_rate_limit("::1", "development") is True
    assert should_bypass_rate_limit("203.0.113.8", "development") is False
    assert should_bypass_rate_limit("127.0.0.1", "production") is False


def test_ip_hash_is_canonical_keyed_and_does_not_reveal_ip() -> None:
    first = hash_ip("2001:0db8:0:0:0:0:0:1", "secret-a")
    canonical = hash_ip("2001:db8::1", "secret-a")
    other_key = hash_ip("2001:db8::1", "secret-b")

    assert first == canonical
    assert first != other_key
    assert len(first) == 64
    assert "2001" not in first
