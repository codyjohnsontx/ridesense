import base64
import hashlib
import hmac
import json
from types import SimpleNamespace

from app import auth


def _b64url(payload: bytes) -> str:
    return base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")


def _token(secret: str, subject: str) -> str:
    header = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode("utf-8"))
    body = _b64url(json.dumps({"sub": subject}).encode("utf-8"))
    signature = hmac.new(secret.encode("utf-8"), f"{header}.{body}".encode("ascii"), hashlib.sha256).digest()
    return f"{header}.{body}.{_b64url(signature)}"


def test_verified_jwt_subject_accepts_valid_hs256(monkeypatch):
    monkeypatch.setattr(auth, "settings", SimpleNamespace(supabase_jwt_secret="test-secret"))

    assert auth._verified_jwt_subject(_token("test-secret", "user-123")) == "user-123"


def test_verified_jwt_subject_rejects_invalid_signature(monkeypatch):
    monkeypatch.setattr(auth, "settings", SimpleNamespace(supabase_jwt_secret="test-secret"))

    assert auth._verified_jwt_subject(_token("wrong-secret", "user-123")) is None
