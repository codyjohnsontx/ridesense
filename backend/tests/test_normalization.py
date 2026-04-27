from app.services.normalization import normalize_strava_activity, normalize_trainerroad_activity


def test_normalize_strava_activity_keeps_cycling_only():
    activity = normalize_strava_activity(
        {
            "id": 123,
            "name": "Saturday Ride",
            "sport_type": "Ride",
            "start_date": "2026-04-20T12:00:00Z",
            "moving_time": 3600,
            "distance": 30000,
            "weighted_average_watts": 210,
        }
    )

    assert activity is not None
    assert activity.provider == "strava"
    assert activity.estimated_load is not None


def test_normalize_trainerroad_progression_zone():
    activity = normalize_trainerroad_activity(
        {
            "Id": 456,
            "Name": "Over Unders",
            "StartedAt": "2026-04-20T12:00:00Z",
            "DurationSeconds": 3600,
            "TSS": 88,
            "ProgressionId": 83,
        }
    )

    assert activity is not None
    assert activity.workout_category == "Threshold"
