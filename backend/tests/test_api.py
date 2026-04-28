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


def test_sync_run_completed_status_with_mocked_provider(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    monkeypatch.setattr("app.main.sync_provider", lambda user_id, provider: {"strava": 2, "trainerroad": 3})

    response = client.post("/sync-runs", json={"provider": "all"})

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "completed"
    assert body["message"] == "Imported 2 Strava and 3 TrainerRoad activities."


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
