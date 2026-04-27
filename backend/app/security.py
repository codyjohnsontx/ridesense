from __future__ import annotations

import base64
import hashlib
import hmac
import json
from typing import Any

from app.config import settings


def _key() -> bytes:
    return hashlib.sha256(settings.app_secret_key.encode("utf-8")).digest()


def seal_json(payload: dict[str, Any]) -> str:
    """Tamper-evident local secret wrapper.

    This is acceptable for local development. In production, replace with KMS or
    Supabase Vault encryption before storing provider tokens or session cookies.
    """
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    sig = hmac.new(_key(), body, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(sig + body).decode("ascii")


def open_json(token: str) -> dict[str, Any]:
    raw = base64.urlsafe_b64decode(token.encode("ascii"))
    sig, body = raw[:32], raw[32:]
    expected = hmac.new(_key(), body, hashlib.sha256).digest()
    if not hmac.compare_digest(sig, expected):
        raise ValueError("stored secret failed integrity check")
    data = json.loads(body.decode("utf-8"))
    if not isinstance(data, dict):
        raise ValueError("stored secret payload must be an object")
    return data
