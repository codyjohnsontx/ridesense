from __future__ import annotations

import base64
import hashlib
import json
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


def _fernet() -> Fernet:
    digest = hashlib.sha256(settings.app_secret_key.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def seal_json(payload: dict[str, Any]) -> str:
    """Encrypt a JSON payload using Fernet (AES-128-CBC + HMAC-SHA256).

    The key is derived from APP_SECRET_KEY. In production, APP_SECRET_KEY
    should come from a managed secret store (KMS, Supabase Vault, etc.) and
    must be rotated together with the data it protects.
    """
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return _fernet().encrypt(body).decode("ascii")


def open_json(token: str) -> dict[str, Any]:
    try:
        body = _fernet().decrypt(token.encode("ascii"))
    except InvalidToken as exc:
        raise ValueError("stored secret failed integrity check") from exc
    data = json.loads(body.decode("utf-8"))
    if not isinstance(data, dict):
        raise ValueError("stored secret payload must be an object")
    return data
