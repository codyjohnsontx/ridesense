from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app import db, repository
from app.main import app
from app.schemas import ActivityIn, AthleteProfile
from app.services.merge import rebuild_canonical_activities


FIXTURES = Path(__file__).parent / "fixtures"


def _client(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "settings", SimpleNamespace(database_url=f"sqlite:///{tmp_path / 'app.db'}"))
    db.init_db()
    return TestClient(app)


def _seed_activity(user_id="demo-user"):
    now = datetime.now(timezone.utc)
    threshold_started_at = (now - timedelta(days=7)).isoformat()
    endurance_started_at = (now - timedelta(days=14)).isoformat()
    repository.upsert_provider_activity(
        user_id,
        ActivityIn(
            provider="trainerroad",
            provider_activity_id="tr-api-1",
            name="API Threshold",
            sport_type="Cycling",
            started_at=threshold_started_at,
            duration_seconds=3600,
            tss=95,
            workout_category="Threshold",
        ),
    )
    repository.upsert_provider_activity(
        user_id,
        ActivityIn(
            provider="strava",
            provider_activity_id="st-api-1",
            name="API Endurance",
            sport_type="Ride",
            started_at=endurance_started_at,
            duration_seconds=5400,
            estimated_load=70,
            workout_category="Endurance",
        ),
    )
    rebuild_canonical_activities(user_id)


def _seed_old_activity(user_id="demo-user"):
    old_started_at = (datetime.now(timezone.utc) - timedelta(days=370)).isoformat()
    repository.upsert_provider_activity(
        user_id,
        ActivityIn(
            provider="strava",
            provider_activity_id="st-api-old",
            name="Old Base Ride",
            sport_type="Ride",
            started_at=old_started_at,
            duration_seconds=3600,
            estimated_load=40,
            workout_category="Endurance",
        ),
    )
    rebuild_canonical_activities(user_id)


def test_dashboard_and_activities_return_seeded_data(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    _seed_activity()

    dashboard = client.get("/dashboard?weeks=12").json()
    activities = client.get("/activities").json()

    assert dashboard["analysis"]["meta"]["total_activities"] == 2
    assert dashboard["analysis"]["summary"]["total_recent_load"] == 165
    assert len(activities["activities"]) == 2
    assert activities["activities"][0]["name"] == "API Threshold"


def test_activities_support_offset_pagination(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    _seed_activity()

    first_page = client.get("/activities?limit=1").json()
    second_page = client.get("/activities?limit=1&offset=1").json()

    assert [a["name"] for a in first_page["activities"]] == ["API Threshold"]
    assert [a["name"] for a in second_page["activities"]] == ["API Endurance"]


def test_dashboard_keeps_total_imported_count_when_window_filters_old_data(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    _seed_activity()
    _seed_old_activity()

    dashboard = client.get("/dashboard?weeks=12").json()
    activities = client.get("/activities?weeks=12").json()

    assert dashboard["analysis"]["meta"]["total_activities"] == 3
    assert dashboard["analysis"]["meta"]["recent_activities"] == 2
    assert dashboard["analysis"]["meta"]["range"]["mode"] == "preset"
    assert dashboard["analysis"]["meta"]["range"]["start_date"] is not None
    assert dashboard["analysis"]["meta"]["range"]["end_date"] is not None
    assert "T" not in dashboard["analysis"]["meta"]["range"]["start_date"]
    assert "T" not in dashboard["analysis"]["meta"]["range"]["end_date"]
    assert dashboard["analysis"]["summary"]["total_recent_load"] == 165
    assert [a["name"] for a in activities["activities"]] == ["API Threshold", "API Endurance"]
    assert activities["total_activities"] == 3


def test_dashboard_and_activities_support_all_time_range(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    _seed_activity()
    _seed_old_activity()

    dashboard = client.get("/dashboard?all_time=true").json()
    activities = client.get("/activities?all_time=true").json()

    assert dashboard["analysis"]["meta"]["range"]["mode"] == "all"
    assert dashboard["analysis"]["meta"]["weeks"] is None
    assert dashboard["analysis"]["meta"]["recent_activities"] == 3
    assert dashboard["analysis"]["summary"]["total_recent_load"] == 205
    assert {a["name"] for a in activities["activities"]} == {
        "API Threshold",
        "API Endurance",
        "Old Base Ride",
    }


def test_custom_date_range_is_inclusive_and_validated(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    old_day = (datetime.now(timezone.utc) - timedelta(days=370)).date().isoformat()
    _seed_activity()
    _seed_old_activity()

    dashboard = client.get(f"/dashboard?start_date={old_day}&end_date={old_day}").json()
    activities = client.get(f"/activities?start_date={old_day}&end_date={old_day}").json()

    assert dashboard["analysis"]["meta"]["range"]["mode"] == "custom"
    assert dashboard["analysis"]["meta"]["range"]["start_date"] == old_day
    assert dashboard["analysis"]["summary"]["total_recent_load"] == 40
    assert [a["name"] for a in activities["activities"]] == ["Old Base Ride"]

    missing_pair = client.get(f"/dashboard?start_date={old_day}")
    reversed_pair = client.get("/dashboard?start_date=2026-02-01&end_date=2026-01-01")
    assert missing_pair.status_code == 422
    assert reversed_pair.status_code == 422


def test_profile_save_load_round_trip(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    payload = {
        "event_type": "Road race",
        "goals": "Improve repeatability",
        "constraints": "Limited Mondays",
        "recovery_notes": "Sleep sensitive",
        "training_days": "Tue Thu Sat",
    }

    assert client.put("/athlete-profile", json=payload).json() == payload
    assert client.get("/athlete-profile").json() == payload


def test_question_uses_requested_weeks(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    _seed_activity()
    captured = {}

    def fake_answer(question, profile, analysis, insights):
        captured["question"] = question
        captured["weeks"] = analysis["meta"]["weeks"]
        return SimpleNamespace(
            model_dump=lambda: {
                "answer": "Range-aware answer.",
                "evidence": [{"metric_id": "meta.weeks", "label": "Weeks", "value": str(analysis["meta"]["weeks"])}],
                "confidence": "medium",
                "caveats": [],
                "follow_up_questions": [],
            }
        )

    monkeypatch.setattr("app.main.answer_question", fake_answer)

    response = client.post("/questions?weeks=4", json={"question": "How is load trending?"})

    assert response.status_code == 200
    assert response.json()["evidence"][0]["value"] == "4"
    assert captured == {"question": "How is load trending?", "weeks": 4}


def test_question_uses_custom_range(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    old_day = (datetime.now(timezone.utc) - timedelta(days=370)).date().isoformat()
    _seed_activity()
    _seed_old_activity()
    captured = {}

    def fake_answer(question, profile, analysis, insights):
        captured["question"] = question
        captured["range"] = analysis["meta"]["range"]
        captured["activity_count"] = analysis["meta"]["recent_activities"]
        return SimpleNamespace(
            model_dump=lambda: {
                "answer": "Custom range answer.",
                "evidence": [{"metric_id": "meta.range", "label": "Range", "value": analysis["meta"]["range"]["label"]}],
                "confidence": "low",
                "caveats": [],
                "follow_up_questions": [],
            }
        )

    monkeypatch.setattr("app.main.answer_question", fake_answer)

    response = client.post(
        f"/questions?start_date={old_day}&end_date={old_day}",
        json={"question": "How did that block look?"},
    )

    assert response.status_code == 200
    assert captured["question"] == "How did that block look?"
    assert captured["range"]["mode"] == "custom"
    assert captured["activity_count"] == 1


def test_sync_run_completed_status_with_mocked_provider(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    monkeypatch.setattr("app.main.sync_provider", lambda user_id, provider: {"strava": 2, "trainerroad": 3})
    monkeypatch.setattr(
        "app.main.repository.list_connections",
        lambda user_id: [{"provider": "strava"}, {"provider": "trainerroad"}],
    )

    response = client.post("/sync-runs", json={"provider": "all"})

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "completed"
    assert body["message"] == "Imported 2 Strava and 3 TrainerRoad activities."


def test_sync_run_message_mentions_unlinked_provider(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    monkeypatch.setattr("app.main.sync_provider", lambda user_id, provider: {"strava": 0, "trainerroad": 0})

    response = client.post("/sync-runs", json={"provider": "all"})

    assert response.status_code == 200
    assert response.json()["message"] == (
        "Imported 0 Strava and 0 TrainerRoad activities (Strava is not linked; TrainerRoad is not linked)."
    )


def test_upload_activity_imports_and_dedupes(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    gpx_bytes = (FIXTURES / "sample.gpx").read_bytes()

    first = client.post(
        "/uploads/activity",
        files={"file": ("ride.gpx", gpx_bytes, "application/gpx+xml")},
    )
    assert first.status_code == 200
    assert first.json()["status"] == "imported"
    assert first.json()["duration_seconds"] == 90 * 60

    # Same file again — provider_activity_id is content-hashed, so upsert
    # leaves a single canonical row instead of duplicating.
    second = client.post(
        "/uploads/activity",
        files={"file": ("ride.gpx", gpx_bytes, "application/gpx+xml")},
    )
    assert second.status_code == 200

    activities = client.get("/activities").json()["activities"]
    assert len(activities) == 1
    assert activities[0]["source_priority"] == "upload"


def test_upload_activity_rejects_unsupported_extension(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    response = client.post(
        "/uploads/activity",
        files={"file": ("ride.csv", b"date,watts\n", "text/csv")},
    )
    assert response.status_code == 400
    assert "unsupported file type" in response.json()["detail"]


def test_upload_activity_rejects_oversized_file(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    huge = b"x" * (10 * 1024 * 1024 + 1024)
    response = client.post(
        "/uploads/activity",
        files={"file": ("ride.gpx", huge, "application/gpx+xml")},
    )
    assert response.status_code == 413


def test_upload_activity_rejects_unparseable_content(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    response = client.post(
        "/uploads/activity",
        files={"file": ("ride.gpx", b"<not-gpx", "application/gpx+xml")},
    )
    assert response.status_code == 422


def test_upload_then_strava_match_promotes_to_strava_priority(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    gpx_bytes = (FIXTURES / "sample.gpx").read_bytes()
    client.post("/uploads/activity", files={"file": ("ride.gpx", gpx_bytes, "application/gpx+xml")})

    repository.upsert_provider_activity(
        "demo-user",
        ActivityIn(
            provider="strava",
            provider_activity_id="strava-overlap",
            name="Saturday endurance",
            sport_type="Ride",
            started_at="2026-04-25T12:01:00+00:00",
            duration_seconds=90 * 60,
            estimated_load=72,
        ),
    )
    rebuild_canonical_activities("demo-user")

    activities = client.get("/activities").json()["activities"]
    assert len(activities) == 1
    assert activities[0]["source_priority"] == "strava"


def test_config_status_returns_boolean_flags(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    monkeypatch.setattr(
        "app.main.settings",
        SimpleNamespace(
            strava_client_id="client",
            strava_client_secret="secret",
            openai_api_key="key",
            dev_auth_enabled=True,
        ),
    )

    assert client.get("/config/status").json() == {
        "strava_configured": True,
        "trainerroad_linking_configured": False,
        "openai_configured": True,
        "dev_auth_enabled": True,
    }


def test_dev_cors_allows_localhost_dev_ports(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)

    response = client.options(
        "/dashboard?weeks=12",
        headers={
            "Origin": "http://127.0.0.1:3002",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:3002"
