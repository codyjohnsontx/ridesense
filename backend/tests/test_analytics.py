from app.services.analytics import analyze_activities
from app.services.insights import generate_insights


def test_analyze_activities_detects_load_trend():
    activities = [
        {
            "name": "Endurance",
            "started_at": "2026-03-02T12:00:00+00:00",
            "duration_seconds": 3600,
            "tss": 50,
            "estimated_load": None,
            "workout_category": "Endurance",
            "source_priority": "trainerroad",
        },
        {
            "name": "Threshold",
            "started_at": "2026-04-20T12:00:00+00:00",
            "duration_seconds": 3600,
            "tss": 110,
            "estimated_load": None,
            "workout_category": "Threshold",
            "source_priority": "trainerroad",
        },
    ]

    result = analyze_activities(activities, weeks=12)

    assert result["summary"]["total_recent_load"] == 160
    assert result["zone_breakdown"]["Threshold"]["load"] == 110


def test_analyze_activities_supports_selected_all_time_window_with_total_count():
    activities = [
        {
            "name": "Old Ride",
            "started_at": "2025-01-02T12:00:00+00:00",
            "duration_seconds": 3600,
            "tss": 40,
            "estimated_load": None,
            "workout_category": "Endurance",
            "source_priority": "strava",
        }
    ]

    result = analyze_activities(
        activities,
        weeks=None,
        total_activities=12,
    )

    assert result["meta"]["total_activities"] == 12
    assert result["meta"]["recent_activities"] == 1
    assert result["meta"]["weeks"] is None
    assert result["meta"]["range"]["mode"] == "all"
    assert result["meta"]["range"]["label"] == "All time"
    assert result["summary"]["total_recent_load"] == 40


def test_generate_insights_flags_intensity_heavy_distribution():
    analysis = {
        "meta": {"recent_activities": 8},
        "summary": {"trend_pct": 0},
        "zone_breakdown": {
            "Threshold": {"load": 300, "count": 3},
            "Endurance": {"load": 100, "count": 2},
        },
    }

    insights = generate_insights(analysis)

    assert any("Intensity-heavy" in insight["title"] for insight in insights)
