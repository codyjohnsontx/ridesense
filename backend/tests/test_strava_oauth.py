import time
from unittest.mock import Mock

from fastapi.testclient import TestClient

from app.main import app
from app.security import seal_json


def _fresh_state(user_id: str = "user-1", provider: str = "strava") -> str:
    return seal_json({"user_id": user_id, "provider": provider, "issued_at": int(time.time())})


def test_strava_callback_saves_connection_with_required_scopes(monkeypatch):
    saved = {}

    def fake_exchange_code(code):
        assert code == "good-code"
        return {
            "access_token": "access",
            "refresh_token": "refresh",
            "expires_at": 1234567890,
            "scope": "read,activity:read_all,profile:read_all",
            "athlete": {"id": 42},
        }

    def fake_save_connection(**kwargs):
        saved.update(kwargs)

    monkeypatch.setattr("app.providers.strava.exchange_code", fake_exchange_code)
    monkeypatch.setattr("app.repository.save_connection", fake_save_connection)

    client = TestClient(app)
    response = client.get(
        "/strava/oauth/callback",
        params={"code": "good-code", "state": _fresh_state()},
        follow_redirects=False,
    )

    assert response.status_code in {302, 307}
    assert "status=connected" in response.headers["location"]
    assert saved["user_id"] == "user-1"
    assert saved["provider"] == "strava"
    assert saved["external_athlete_id"] == "42"
    assert saved["scopes"] == "activity:read_all,profile:read_all,read"


def test_strava_callback_rejects_missing_activity_scope(monkeypatch):
    save_connection = Mock()

    def fake_exchange_code(_code):
        return {
            "access_token": "access",
            "refresh_token": "refresh",
            "expires_at": 1234567890,
            "scope": "read",
            "athlete": {"id": 42},
        }

    monkeypatch.setattr("app.providers.strava.exchange_code", fake_exchange_code)
    monkeypatch.setattr("app.repository.save_connection", save_connection)

    client = TestClient(app)
    response = client.get(
        "/strava/oauth/callback",
        params={"code": "limited-code", "state": _fresh_state()},
        follow_redirects=False,
    )

    assert response.status_code in {302, 307}
    assert "status=error" in response.headers["location"]
    save_connection.assert_not_called()


def test_strava_callback_handles_denied_authorization(monkeypatch):
    exchange_code = Mock()
    save_connection = Mock()
    monkeypatch.setattr("app.providers.strava.exchange_code", exchange_code)
    monkeypatch.setattr("app.repository.save_connection", save_connection)

    client = TestClient(app)
    response = client.get(
        "/strava/oauth/callback",
        params={"error": "access_denied"},
        follow_redirects=False,
    )

    assert response.status_code in {302, 307}
    assert "status=error" in response.headers["location"]
    exchange_code.assert_not_called()
    save_connection.assert_not_called()


def test_strava_callback_rejects_missing_state(monkeypatch):
    exchange_code = Mock()
    save_connection = Mock()
    monkeypatch.setattr("app.providers.strava.exchange_code", exchange_code)
    monkeypatch.setattr("app.repository.save_connection", save_connection)

    client = TestClient(app)
    response = client.get(
        "/strava/oauth/callback",
        params={"code": "good-code"},
        follow_redirects=False,
    )

    assert response.status_code in {302, 307}
    assert "status=error" in response.headers["location"]
    exchange_code.assert_not_called()
    save_connection.assert_not_called()


def test_strava_callback_rejects_incomplete_token_response(monkeypatch):
    save_connection = Mock()
    monkeypatch.setattr(
        "app.providers.strava.exchange_code",
        Mock(
            return_value={
                "access_token": "access",
                "expires_at": 1234567890,
                "scope": "read,activity:read_all",
                "athlete": {"id": 42},
            }
        ),
    )
    monkeypatch.setattr("app.repository.save_connection", save_connection)

    client = TestClient(app)
    response = client.get(
        "/strava/oauth/callback",
        params={"code": "good-code", "state": _fresh_state()},
        follow_redirects=False,
    )

    assert response.status_code in {302, 307}
    assert "status=error" in response.headers["location"]
    assert "Incomplete+token+response+from+Strava" in response.headers["location"]
    save_connection.assert_not_called()


def test_strava_callback_handles_save_connection_failure(monkeypatch):
    def fake_save_connection(**_kwargs):
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(
        "app.providers.strava.exchange_code",
        Mock(
            return_value={
                "access_token": "access",
                "refresh_token": "refresh",
                "expires_at": 1234567890,
                "scope": "read,activity:read_all",
                "athlete": {"id": 42},
            }
        ),
    )
    monkeypatch.setattr("app.repository.save_connection", fake_save_connection)

    client = TestClient(app)
    response = client.get(
        "/strava/oauth/callback",
        params={"code": "good-code", "state": _fresh_state()},
        follow_redirects=False,
    )

    assert response.status_code in {302, 307}
    assert "status=error" in response.headers["location"]
    assert "Unable+to+save+Strava+connection" in response.headers["location"]


def test_strava_callback_rejects_expired_state(monkeypatch):
    """State tokens older than OAUTH_STATE_TTL_SECONDS must be rejected,
    so a stolen authorization redirect cannot be replayed days later."""
    exchange_code = Mock()
    save_connection = Mock()
    monkeypatch.setattr("app.providers.strava.exchange_code", exchange_code)
    monkeypatch.setattr("app.repository.save_connection", save_connection)

    stale_state = seal_json(
        {"user_id": "user-1", "provider": "strava", "issued_at": int(time.time()) - 3600}
    )

    client = TestClient(app)
    response = client.get(
        "/strava/oauth/callback",
        params={"code": "good-code", "state": stale_state},
        follow_redirects=False,
    )

    assert response.status_code in {302, 307}
    assert "status=error" in response.headers["location"]
    assert "expired" in response.headers["location"]
    exchange_code.assert_not_called()
    save_connection.assert_not_called()


def test_strava_callback_rejects_state_without_issued_at(monkeypatch):
    """Legacy state tokens that pre-date the TTL field must also be rejected
    rather than implicitly trusted forever."""
    exchange_code = Mock()
    save_connection = Mock()
    monkeypatch.setattr("app.providers.strava.exchange_code", exchange_code)
    monkeypatch.setattr("app.repository.save_connection", save_connection)

    legacy_state = seal_json({"user_id": "user-1", "provider": "strava"})

    client = TestClient(app)
    response = client.get(
        "/strava/oauth/callback",
        params={"code": "good-code", "state": legacy_state},
        follow_redirects=False,
    )

    assert response.status_code in {302, 307}
    assert "status=error" in response.headers["location"]
    exchange_code.assert_not_called()
    save_connection.assert_not_called()


def test_strava_callback_rejects_non_strava_state(monkeypatch):
    exchange_code = Mock()
    save_connection = Mock()
    monkeypatch.setattr("app.providers.strava.exchange_code", exchange_code)
    monkeypatch.setattr("app.repository.save_connection", save_connection)

    client = TestClient(app)
    response = client.get(
        "/strava/oauth/callback",
        params={"code": "good-code", "state": _fresh_state(provider="trainerroad")},
        follow_redirects=False,
    )

    assert response.status_code in {302, 307}
    assert "status=error" in response.headers["location"]
    exchange_code.assert_not_called()
    save_connection.assert_not_called()
