from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any


def _week_start(value: str) -> str:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    monday = dt - timedelta(days=dt.weekday())
    return monday.date().isoformat()


def load_value(activity: dict[str, Any]) -> float:
    if activity.get("tss") is not None:
        return float(activity["tss"])
    if activity.get("estimated_load") is not None:
        return float(activity["estimated_load"])
    return 0.0


def analyze_activities(
    activities: list[dict[str, Any]],
    weeks: int | None = 12,
    total_activities: int | None = None,
    range_meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    if weeks is None:
        recent = activities
    else:
        cutoff = now - timedelta(weeks=weeks)
        recent = [
            a
            for a in activities
            if datetime.fromisoformat(a["started_at"].replace("Z", "+00:00")) >= cutoff
        ]

    weekly: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"week_start": "", "load": 0.0, "count": 0, "duration_hours": 0.0}
    )
    zones: dict[str, dict[str, Any]] = defaultdict(lambda: {"count": 0, "load": 0.0})
    provider_counts: dict[str, int] = defaultdict(int)

    for activity in recent:
        week = _week_start(activity["started_at"])
        weekly[week]["week_start"] = week
        weekly[week]["load"] += load_value(activity)
        weekly[week]["count"] += 1
        weekly[week]["duration_hours"] += (activity.get("duration_seconds") or 0) / 3600
        zone = activity.get("workout_category") or "Unclassified"
        zones[zone]["count"] += 1
        zones[zone]["load"] += load_value(activity)
        provider_counts[activity.get("source_priority") or "unknown"] += 1

    weekly_rows = sorted(weekly.values(), key=lambda row: row["week_start"])
    for row in weekly_rows:
        row["load"] = round(row["load"], 1)
        row["duration_hours"] = round(row["duration_hours"], 1)

    loads = [row["load"] for row in weekly_rows]
    first_half = loads[: max(len(loads) // 2, 1)]
    second_half = loads[max(len(loads) // 2, 1) :]
    first_avg = sum(first_half) / len(first_half) if first_half else 0
    second_avg = sum(second_half) / len(second_half) if second_half else 0
    trend_pct = ((second_avg - first_avg) / first_avg * 100) if first_avg else 0

    latest = weekly_rows[-1]["load"] if weekly_rows else 0
    avg_weekly = sum(loads) / len(loads) if loads else 0

    return {
        "meta": {
            "total_activities": total_activities if total_activities is not None else len(activities),
            "recent_activities": len(recent),
            "weeks": weeks,
            "range": range_meta
            or {
                "mode": "preset",
                "label": f"Last {weeks} weeks" if weeks is not None else "All time",
                "start_date": None,
                "end_date": None,
            },
        },
        "summary": {
            "latest_week_load": round(latest, 1),
            "avg_weekly_load": round(avg_weekly, 1),
            "trend_pct": round(trend_pct, 1),
            "total_recent_load": round(sum(loads), 1),
        },
        "weekly": weekly_rows,
        "zone_breakdown": {
            zone: {"count": data["count"], "load": round(data["load"], 1)}
            for zone, data in sorted(zones.items())
        },
        "provider_counts": dict(provider_counts),
        "top_workouts": sorted(
            recent, key=lambda item: load_value(item), reverse=True
        )[:10],
    }
