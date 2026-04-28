from __future__ import annotations

import base64

import pytest

from app import security
from app.security import open_json, seal_json


def test_seal_open_roundtrip() -> None:
    payload = {"user_id": "demo-user", "provider": "strava", "nested": {"k": 1}}
    token = seal_json(payload)
    assert open_json(token) == payload


def test_seal_does_not_expose_plaintext() -> None:
    """Fernet output must not contain the plaintext, even after url-safe-b64 decoding.

    The legacy HMAC scheme failed this property — it merely signed plaintext —
    which is why this test exists.
    """
    payload = {"access_token": "super-secret-strava-token-abc123"}
    token = seal_json(payload)
    assert "super-secret" not in token
    decoded = base64.urlsafe_b64decode(token.encode("ascii"))
    assert b"super-secret" not in decoded


def test_open_rejects_tampered_token() -> None:
    token = seal_json({"user_id": "demo-user"})
    with pytest.raises(ValueError, match="integrity check"):
        open_json(token[:-4] + "AAAA")


def test_open_rejects_token_from_different_key(monkeypatch: pytest.MonkeyPatch) -> None:
    from dataclasses import replace

    monkeypatch.setattr(security, "settings", replace(security.settings, app_secret_key="key-one"))
    token = seal_json({"user_id": "demo-user"})

    monkeypatch.setattr(security, "settings", replace(security.settings, app_secret_key="key-two"))
    with pytest.raises(ValueError, match="integrity check"):
        open_json(token)


def test_fernet_rejects_default_secret_outside_development(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from dataclasses import replace

    monkeypatch.setattr(
        security,
        "settings",
        replace(security.settings, app_env="production", app_secret_key="replace-me"),
    )
    with pytest.raises(RuntimeError, match="APP_SECRET_KEY"):
        security._fernet()


def test_fernet_rejects_short_secret_outside_development(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from dataclasses import replace

    monkeypatch.setattr(
        security,
        "settings",
        replace(security.settings, app_env="staging", app_secret_key="abc"),
    )
    with pytest.raises(RuntimeError, match="APP_SECRET_KEY"):
        security._fernet()


def test_fernet_allows_default_secret_in_development(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Local dev must keep working with the .env.example default."""
    from dataclasses import replace

    monkeypatch.setattr(
        security,
        "settings",
        replace(security.settings, app_env="development", app_secret_key="replace-me"),
    )
    security._fernet()  # must not raise


def test_open_rejects_non_object_payload() -> None:
    """Tokens must wrap a JSON object, not a bare value."""
    import json

    body = json.dumps([1, 2, 3]).encode("utf-8")
    token = security._fernet().encrypt(body).decode("ascii")
    with pytest.raises(ValueError, match="must be an object"):
        open_json(token)
