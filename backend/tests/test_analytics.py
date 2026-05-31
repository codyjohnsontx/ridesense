from datetime import datetime, timezone

from app.services import analytics
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

    result = analyze_activities(
        activities,
        start_at="2026-03-01T00:00:00+00:00",
        end_at="2026-04-27T23:59:59+00:00",
    )

    assert result["meta"]["recent_activities"] == 2
    assert result["summary"]["total_recent_load"] == 160
    assert result["category_breakdown"]["Threshold"]["load"] == 110
    assert result["form"]["ctl_now"] >= 0
    assert result["verdict"]["headline"]


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


def test_analyze_activities_uses_explicit_range_bounds_before_weeks_cutoff():
    activities = [
        {
            "name": "Bounded Ride",
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
        weeks=12,
        start_at="2025-01-02T00:00:00+00:00",
        end_at="2025-01-02T23:59:59.999999+00:00",
    )

    assert result["meta"]["recent_activities"] == 1
    assert result["meta"]["range"] == {
        "mode": "custom",
        "label": "2025-01-02 to 2025-01-02",
        "start_date": "2025-01-02",
        "end_date": "2025-01-02",
    }
    assert result["summary"]["total_recent_load"] == 40


def test_analyze_activities_weeks_cutoff_starts_at_utc_midnight(monkeypatch):
    class FixedDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            value = cls(2026, 5, 24, 15, 30, tzinfo=timezone.utc)
            return value if tz is None else value.astimezone(tz)

    monkeypatch.setattr(analytics, "datetime", FixedDateTime)
    activities = [
        {
            "name": "Cutoff day ride",
            "started_at": "2026-03-01T00:30:00+00:00",
            "duration_seconds": 3600,
            "tss": 20,
            "estimated_load": None,
            "workout_category": "Endurance",
            "source_priority": "strava",
        },
        {
            "name": "Previous day ride",
            "started_at": "2026-02-28T23:59:59+00:00",
            "duration_seconds": 3600,
            "tss": 30,
            "estimated_load": None,
            "workout_category": "Endurance",
            "source_priority": "strava",
        },
    ]

    result = analyze_activities(activities, weeks=12)

    assert result["meta"]["recent_activities"] == 1
    assert result["summary"]["total_recent_load"] == 20


def test_generate_insights_flags_intensity_heavy_distribution():
    analysis = {
        "meta": {"recent_activities": 8},
        "summary": {"trend_pct": 0},
        "form": {"ramp_rate_per_week": 1.0},
        "verdict": {"qualifier": "Holding steady"},
        "load_quality": {"confidence": "high", "note": "High-confidence read."},
        "category_breakdown": {
            "Threshold": {"load": 300, "count": 3},
            "Endurance": {"load": 100, "count": 2},
        },
    }

    insights = generate_insights(analysis, {"event_type": "Gran fondo"})

    assert any("intensity-heavy" in insight["title"].lower() for insight in insights)


def test_analyze_activities_uses_history_before_visible_window_for_form():
    activities = [
        {
            "name": "Old Base Ride",
            "started_at": "2025-11-01T12:00:00+00:00",
            "duration_seconds": 7200,
            "tss": 120,
            "estimated_load": None,
            "workout_category": "Endurance",
            "source_priority": "trainerroad",
        },
        {
            "name": "Recent Tempo",
            "started_at": "2026-01-15T12:00:00+00:00",
            "duration_seconds": 3600,
            "tss": 70,
            "estimated_load": None,
            "workout_category": "Tempo",
            "source_priority": "trainerroad",
        },
    ]

    result = analyze_activities(
        activities,
        start_at="2026-01-01T00:00:00+00:00",
        end_at="2026-01-31T23:59:59+00:00",
    )

    assert result["meta"]["recent_activities"] == 1
    assert result["form"]["start_date"] == "2026-01-01"
    assert result["form"]["ctl_now"] > 0
