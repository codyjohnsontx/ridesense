from __future__ import annotations

from unittest.mock import Mock

import pytest

from app.services import sync as sync_module
from app.services.sync import StravaTokenRefreshError, sync_strava


def _connection(secret_token: str = "encrypted-blob") -> dict:
    return {
        "user_id": "demo-user",
        "provider": "strava",
        "encrypted_secret": secret_token,
        "external_athlete_id": "42",
        "scopes": "read,activity:read_all",
    }


def _strava_activity(activity_id: int, sport: str = "Ride") -> dict:
    return {
        "id": activity_id,
        "type": sport,
        "sport_type": sport,
        "name": f"Activity {activity_id}",
        "start_date": "2026-04-25T12:00:00Z",
        "moving_time": 3600,
        "distance": 30000,
    }


def test_sync_strava_returns_zero_when_not_linked(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(sync_module.repository, "get_connection", lambda *_a, **_k: None)
    assert sync_strava("demo-user") == 0


def test_sync_strava_refreshes_expired_token_and_persists_new_secret(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(sync_module.repository, "get_connection", lambda *_a, **_k: _connection())
    monkeypatch.setattr(sync_module, "open_json", lambda _t: {"access_token": "old", "refresh_token": "r", "expires_at": 0})
    refresh_call = Mock(return_value={"access_token": "new", "refresh_token": "r2", "expires_at": 9_999_999_999})
    monkeypatch.setattr(sync_module.strava, "refresh_access_token", refresh_call)
    save_call = Mock()
    monkeypatch.setattr(sync_module.repository, "save_connection", save_call)
    monkeypatch.setattr(sync_module, "seal_json", lambda payload: f"sealed:{payload['access_token']}")
    list_calls: list[int] = []

    def fake_list(access_token: str, page: int = 1, per_page: int = 100):  # noqa: ARG001
        list_calls.append(page)
        assert access_token == "new"  # refreshed token must reach Strava
        return ([_strava_activity(1)], {})

    monkeypatch.setattr(sync_module.strava, "list_activities", fake_list)
    monkeypatch.setattr(sync_module.repository, "upsert_provider_activity", lambda *_a, **_k: 1)
    monkeypatch.setattr(sync_module, "rebuild_canonical_activities", lambda _u: None)

    count = sync_strava("demo-user")

    assert count == 1
    refresh_call.assert_called_once_with("r")
    assert save_call.call_args.kwargs["encrypted_secret"] == "sealed:new"
    assert save_call.call_args.kwargs["expires_at"] == 9_999_999_999


def test_sync_strava_marks_connection_error_when_refresh_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(sync_module.repository, "get_connection", lambda *_a, **_k: _connection())
    monkeypatch.setattr(sync_module, "open_json", lambda _t: {"access_token": "old", "refresh_token": "r", "expires_at": 0})

    def boom(_refresh_token: str):
        raise RuntimeError("401 Unauthorized")

    monkeypatch.setattr(sync_module.strava, "refresh_access_token", boom)
    set_status = Mock()
    monkeypatch.setattr(sync_module.repository, "set_connection_status", set_status)
    save_call = Mock()
    monkeypatch.setattr(sync_module.repository, "save_connection", save_call)

    with pytest.raises(StravaTokenRefreshError, match="relink"):
        sync_strava("demo-user")

    set_status.assert_called_once_with("demo-user", "strava", "error")
    save_call.assert_not_called()


def test_sync_strava_marks_connection_error_when_refresh_payload_incomplete(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A 200 response from Strava with a missing refresh_token must not be
    persisted — the next sync would explode on secret["refresh_token"]."""
    monkeypatch.setattr(sync_module.repository, "get_connection", lambda *_a, **_k: _connection())
    monkeypatch.setattr(sync_module, "open_json", lambda _t: {"access_token": "old", "refresh_token": "r", "expires_at": 0})
    monkeypatch.setattr(
        sync_module.strava,
        "refresh_access_token",
        lambda _r: {"access_token": "new", "expires_at": 9_999_999_999},  # no refresh_token
    )
    set_status = Mock()
    monkeypatch.setattr(sync_module.repository, "set_connection_status", set_status)
    save_call = Mock()
    monkeypatch.setattr(sync_module.repository, "save_connection", save_call)

    with pytest.raises(StravaTokenRefreshError, match="incomplete"):
        sync_strava("demo-user")

    set_status.assert_called_once_with("demo-user", "strava", "error")
    save_call.assert_not_called()


@pytest.mark.parametrize(
    "bad_payload",
    [
        pytest.param({"access_token": True, "refresh_token": "r", "expires_at": 1}, id="bool-token"),
        pytest.param({"access_token": "", "refresh_token": "r", "expires_at": 1}, id="empty-token"),
        pytest.param({"access_token": "a", "refresh_token": ["x"], "expires_at": 1}, id="list-refresh"),
        pytest.param({"access_token": "a", "refresh_token": "r", "expires_at": "abc"}, id="non-numeric-expiry"),
        pytest.param({"access_token": "a", "refresh_token": "r"}, id="missing-expiry"),
    ],
)
def test_refresh_payload_validation_rejects_malformed(
    monkeypatch: pytest.MonkeyPatch, bad_payload: dict
) -> None:
    monkeypatch.setattr(sync_module.repository, "get_connection", lambda *_a, **_k: _connection())
    monkeypatch.setattr(sync_module, "open_json", lambda _t: {"access_token": "old", "refresh_token": "r", "expires_at": 0})
    monkeypatch.setattr(sync_module.strava, "refresh_access_token", lambda _r: bad_payload)
    set_status = Mock()
    monkeypatch.setattr(sync_module.repository, "set_connection_status", set_status)
    save_call = Mock()
    monkeypatch.setattr(sync_module.repository, "save_connection", save_call)

    with pytest.raises(StravaTokenRefreshError, match="incomplete"):
        sync_strava("demo-user")

    set_status.assert_called_once_with("demo-user", "strava", "error")
    save_call.assert_not_called()


def test_refresh_payload_validation_accepts_numeric_string_expiry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Strava sometimes serializes expires_at as a string in OAuth-y payloads;
    accept the parseable form so a real-world response doesn't trip the guard."""
    monkeypatch.setattr(sync_module.repository, "get_connection", lambda *_a, **_k: _connection())
    monkeypatch.setattr(sync_module, "open_json", lambda _t: {"access_token": "old", "refresh_token": "r", "expires_at": 0})
    monkeypatch.setattr(
        sync_module.strava,
        "refresh_access_token",
        lambda _r: {"access_token": "new", "refresh_token": "r2", "expires_at": "9999999999"},
    )
    save_call = Mock()
    monkeypatch.setattr(sync_module.repository, "save_connection", save_call)
    monkeypatch.setattr(sync_module, "seal_json", lambda payload: f"sealed:{payload['access_token']}")
    monkeypatch.setattr(sync_module.strava, "list_activities", lambda *_a, **_k: ([], {}))
    monkeypatch.setattr(sync_module, "rebuild_canonical_activities", lambda _u: None)

    sync_strava("demo-user")  # must not raise

    save_call.assert_called_once()


def test_sync_strava_paginates_and_filters_non_cycling(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(sync_module.repository, "get_connection", lambda *_a, **_k: _connection())
    monkeypatch.setattr(sync_module, "open_json", lambda _t: {"access_token": "ok", "refresh_token": "r", "expires_at": 9_999_999_999})

    pages = {
        1: [_strava_activity(i) for i in range(100)],
        2: [_strava_activity(101), _strava_activity(102, sport="Run"), _strava_activity(103)],
    }

    def fake_list(_access_token: str, page: int = 1, per_page: int = 100):  # noqa: ARG001
        return (pages.get(page, []), {})

    monkeypatch.setattr(sync_module.strava, "list_activities", fake_list)
    upserts: list[str] = []
    monkeypatch.setattr(
        sync_module.repository,
        "upsert_provider_activity",
        lambda _u, activity: upserts.append(activity.provider_activity_id) or len(upserts),
    )
    monkeypatch.setattr(sync_module, "rebuild_canonical_activities", lambda _u: None)

    count = sync_strava("demo-user")

    # 100 from page 1, 2 cycling rides from page 2 (the Run is filtered out).
    assert count == 102
    # Normalize to int so a future change to provider_activity_id's runtime
    # type can't silently let a Run sneak through.
    assert 102 not in {int(x) for x in upserts}
