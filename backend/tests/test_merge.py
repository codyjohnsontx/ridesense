from app.services.merge import _confidence


def test_merge_confidence_detects_same_workout():
    trainerroad = {
        "name": "Sweet Spot Base",
        "started_at": "2026-04-20T12:00:00+00:00",
        "duration_seconds": 3600,
    }
    strava = {
        "name": "Sweet Spot Base",
        "started_at": "2026-04-20T12:03:00+00:00",
        "duration_seconds": 3650,
    }

    assert _confidence(strava, trainerroad) >= 0.72
