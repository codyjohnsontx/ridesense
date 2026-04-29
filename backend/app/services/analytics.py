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


def _date_label(value: str | None) -> str | None:
    if value is None:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00")).date().isoformat()


def _range_meta_fallback(
    weeks: int | None,
    start_at: str | None,
    end_at: str | None,
) -> dict[str, Any]:
    start_date = _date_label(start_at)
    end_date = _date_label(end_at)
    if start_date is not None or end_date is not None:
        if start_date and end_date:
            label = f"{start_date} to {end_date}"
        elif start_date:
            label = f"From {start_date}"
        else:
            label = f"Through {end_date}"
        return {
            "mode": "custom",
            "label": label,
            "start_date": start_date,
            "end_date": end_date,
        }
    return {
        "mode": "preset" if weeks is not None else "all",
        "label": f"Last {weeks} weeks" if weeks is not None else "All time",
        "start_date": None,
        "end_date": None,
    }


def analyze_activities(
    activities: list[dict[str, Any]],
    weeks: int | None = 12,
    start_at: str | None = None,
    end_at: str | None = None,
    total_activities: int | None = None,
    range_meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if start_at is not None or end_at is not None:
        start_dt = datetime.fromisoformat(start_at.replace("Z", "+00:00")) if start_at is not None else None
        end_dt = datetime.fromisoformat(end_at.replace("Z", "+00:00")) if end_at is not None else None
        recent = []
        for activity in activities:
            started_at = datetime.fromisoformat(activity["started_at"].replace("Z", "+00:00"))
            if start_dt is not None and started_at < start_dt:
                continue
            if end_dt is not None and started_at > end_dt:
                continue
            recent.append(activity)
    elif weeks is None:
        recent = activities
    else:
        now = datetime.now(timezone.utc)
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
            "range": range_meta or _range_meta_fallback(weeks, start_at, end_at),
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
