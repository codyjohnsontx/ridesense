import time
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse
from unittest.mock import Mock

from fastapi.testclient import TestClient

from app.main import app
from app.providers import strava
from app.security import open_json, seal_json


def _fresh_state(
    user_id: str = "user-1",
    provider: str = "strava",
    return_origin: str | None = None,
) -> str:
    return seal_json(
        {
            "user_id": user_id,
            "provider": provider,
            "issued_at": int(time.time()),
            "return_origin": return_origin,
        }
    )


def test_strava_authorization_url_forces_scope_reapproval():
    url = strava.authorization_url("state-1")

    params = parse_qs(urlparse(url).query)

    assert params["approval_prompt"] == ["force"]
    assert params["scope"] == [strava.REQUESTED_SCOPES]
    assert params["state"] == ["state-1"]


def test_strava_accepted_scopes_handles_comma_and_space_separated_values():
    assert strava.accepted_scopes({"scope": "read,activity:read_all,profile:read_all"}) == {
        "read",
        "activity:read_all",
        "profile:read_all",
    }
    assert strava.accepted_scopes({"scope": "read activity:read_all profile:read_all"}) == {
        "read",
        "activity:read_all",
        "profile:read_all",
    }


def test_strava_list_activities_sends_pagination_and_date_filters(monkeypatch):
    class FakeResponse:
        headers = {"X-RateLimit-Limit": "100,1000", "Content-Type": "application/json"}

        def raise_for_status(self):
            return None

        def json(self):
            return [{"id": 1}]

    get_call = Mock(return_value=FakeResponse())
    monkeypatch.setattr(strava.requests, "get", get_call)

    activities, rate_headers = strava.list_activities(
        "access-token", page=3, per_page=200, before=1_700_000_000, after=1_600_000_000
    )

    assert activities == [{"id": 1}]
    assert rate_headers == {"X-RateLimit-Limit": "100,1000"}
    assert get_call.call_args.kwargs["headers"] == {"Authorization": "Bearer access-token"}
    assert get_call.call_args.kwargs["params"] == {
        "page": 3,
        "per_page": 200,
        "before": 1_700_000_000,
        "after": 1_600_000_000,
    }


def test_strava_link_start_stores_local_return_origin_in_state(monkeypatch):
    monkeypatch.setattr(
        "app.main.settings",
        SimpleNamespace(strava_client_id="client", frontend_origin="http://localhost:3000"),
    )
    monkeypatch.setattr(
        strava,
        "settings",
        SimpleNamespace(strava_client_id="client", strava_redirect_uri="http://localhost:8000/strava/oauth/callback"),
    )

    client = TestClient(app)
    response = client.post(
        "/strava/link/start",
        headers={"Origin": "http://localhost:3002"},
    )

    assert response.status_code == 200
    params = parse_qs(urlparse(response.json()["authorization_url"]).query)
    state = open_json(params["state"][0])
    assert state["user_id"] == "demo-user"
    assert state["return_origin"] == "http://localhost:3002"


def test_strava_link_start_rejects_untrusted_return_origin(monkeypatch):
    monkeypatch.setattr(
        "app.main.settings",
        SimpleNamespace(strava_client_id="client", frontend_origin="http://localhost:3000"),
    )
    monkeypatch.setattr(
        strava,
        "settings",
        SimpleNamespace(strava_client_id="client", strava_redirect_uri="http://localhost:8000/strava/oauth/callback"),
    )

    client = TestClient(app)
    response = client.post(
        "/strava/link/start",
        headers={"Origin": "https://evil.example"},
    )

    assert response.status_code == 200
    params = parse_qs(urlparse(response.json()["authorization_url"]).query)
    state = open_json(params["state"][0])
    assert state["return_origin"] is None


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


def test_strava_callback_redirects_to_state_return_origin(monkeypatch):
    def fake_exchange_code(_code):
        return {
            "access_token": "access",
            "refresh_token": "refresh",
            "expires_at": 1234567890,
            "scope": "read,activity:read_all",
            "athlete": {"id": 42},
        }

    monkeypatch.setattr("app.providers.strava.exchange_code", fake_exchange_code)
    monkeypatch.setattr("app.repository.save_connection", Mock())
    state = seal_json(
        {
            "user_id": "user-1",
            "provider": "strava",
            "issued_at": int(time.time()),
            "return_origin": "http://localhost:3002",
        }
    )

    client = TestClient(app)
    response = client.get(
        "/strava/oauth/callback",
        params={"code": "good-code", "state": state},
        follow_redirects=False,
    )

    assert response.status_code in {302, 307}
    assert response.headers["location"].startswith("http://localhost:3002/?")
    assert "status=connected" in response.headers["location"]


def test_strava_callback_access_denied_redirects_to_state_return_origin():
    state = seal_json(
        {
            "user_id": "user-1",
            "provider": "strava",
            "issued_at": int(time.time()),
            "return_origin": "http://localhost:3002",
        }
    )

    client = TestClient(app)
    response = client.get(
        "/strava/oauth/callback",
        params={"error": "access_denied", "state": state},
        follow_redirects=False,
    )

    assert response.status_code in {302, 307}
    assert response.headers["location"].startswith("http://localhost:3002/?")
    assert "status=error" in response.headers["location"]


def test_strava_callback_missing_code_redirects_to_state_return_origin():
    client = TestClient(app)
    response = client.get(
        "/strava/oauth/callback",
        params={"state": _fresh_state(return_origin="http://localhost:3002")},
        follow_redirects=False,
    )

    assert response.status_code in {302, 307}
    assert response.headers["location"].startswith("http://localhost:3002/?")
    assert "status=error" in response.headers["location"]


def test_strava_callback_invalid_user_redirects_to_state_return_origin(monkeypatch):
    exchange_code = Mock()
    monkeypatch.setattr("app.providers.strava.exchange_code", exchange_code)

    client = TestClient(app)
    response = client.get(
        "/strava/oauth/callback",
        params={
            "code": "good-code",
            "state": _fresh_state(user_id="", return_origin="http://localhost:3002"),
        },
        follow_redirects=False,
    )

    assert response.status_code in {302, 307}
    assert response.headers["location"].startswith("http://localhost:3002/?")
    assert "status=error" in response.headers["location"]
    exchange_code.assert_not_called()


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


def test_strava_callback_uses_callback_scope_when_token_payload_omits_scope(monkeypatch):
    save_connection = Mock()

    def fake_exchange_code(_code):
        return {
            "access_token": "access",
            "refresh_token": "refresh",
            "expires_at": 1234567890,
            "athlete": {"id": 42},
        }

    monkeypatch.setattr("app.providers.strava.exchange_code", fake_exchange_code)
    monkeypatch.setattr("app.repository.save_connection", save_connection)

    client = TestClient(app)
    response = client.get(
        "/strava/oauth/callback",
        params={
            "code": "good-code",
            "state": _fresh_state(),
            "scope": "read,activity:read_all,profile:read_all",
        },
        follow_redirects=False,
    )

    assert response.status_code in {302, 307}
    assert "status=connected" in response.headers["location"]
    assert save_connection.call_args.kwargs["scopes"] == "activity:read_all,profile:read_all,read"


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
        {
            "user_id": "user-1",
            "provider": "strava",
            "issued_at": int(time.time()) - 3600,
            "return_origin": "http://localhost:3002",
        }
    )

    client = TestClient(app)
    response = client.get(
        "/strava/oauth/callback",
        params={"code": "good-code", "state": stale_state},
        follow_redirects=False,
    )

    assert response.status_code in {302, 307}
    assert response.headers["location"].startswith("http://localhost:3002/?")
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
