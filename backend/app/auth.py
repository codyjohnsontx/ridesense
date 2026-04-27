from __future__ import annotations

import base64
import hashlib
import hmac
import json
from typing import Annotated

from fastapi import Depends, Header, HTTPException

from app.config import settings


def _b64url_decode(value: str) -> bytes:
    padded = value + "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(padded)


def _verified_jwt_subject(token: str) -> str | None:
    """Verify a Supabase HS256 access token and return its subject."""
    try:
        header_part, payload_part, signature_part = token.split(".")
        header = json.loads(_b64url_decode(header_part))
        if header.get("alg") != "HS256" or not settings.supabase_jwt_secret:
            return None
        signing_input = f"{header_part}.{payload_part}".encode("ascii")
        expected = hmac.new(
            settings.supabase_jwt_secret.encode("utf-8"),
            signing_input,
            hashlib.sha256,
        ).digest()
        actual = _b64url_decode(signature_part)
        if not hmac.compare_digest(expected, actual):
            return None
        payload = json.loads(_b64url_decode(payload_part))
        return payload.get("sub")
    except Exception:
        return None


def current_user_id(
    authorization: Annotated[str | None, Header()] = None,
    x_user_id: Annotated[str | None, Header()] = None,
) -> str:
    if settings.dev_auth_enabled:
        return x_user_id or "demo-user"

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")

    subject = _verified_jwt_subject(authorization.removeprefix("Bearer ").strip())
    if not subject:
        raise HTTPException(status_code=401, detail="invalid bearer token")
    return subject


UserId = Annotated[str, Depends(current_user_id)]
