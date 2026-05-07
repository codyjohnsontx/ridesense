from __future__ import annotations

import math
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any

from app.services.goal_profile import _goal_profile


CTL_TAU_DAYS = 42
ATL_TAU_DAYS = 7


def _parse_dt(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _utc_date(value: str) -> date:
    return _parse_dt(value).astimezone(timezone.utc).date()


def _week_start(value: str) -> str:
    day = _utc_date(value)
    monday = day - timedelta(days=day.weekday())
    return monday.isoformat()


def load_source(activity: dict[str, Any]) -> str:
    if activity.get("tss") is not None:
        return "tss"
    if activity.get("estimated_load") is not None:
        return "estimated"
    return "none"


def load_value(activity: dict[str, Any]) -> float:
    if activity.get("tss") is not None:
        return float(activity["tss"])
    if activity.get("estimated_load") is not None:
        return float(activity["estimated_load"])
    return 0.0


def _date_label(value: str | None) -> str | None:
    if value is None:
        return None
    return _parse_dt(value).date().isoformat()


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


def _filter_visible(
    activities: list[dict[str, Any]],
    weeks: int | None,
    start_at: str | None,
    end_at: str | None,
) -> list[dict[str, Any]]:
    if start_at is not None or end_at is not None:
        start_dt = _parse_dt(start_at) if start_at is not None else None
        end_dt = _parse_dt(end_at) if end_at is not None else None
        visible: list[dict[str, Any]] = []
        for activity in activities:
            started_at = _parse_dt(activity["started_at"])
            if start_dt is not None and started_at < start_dt:
                continue
            if end_dt is not None and started_at > end_dt:
                continue
            visible.append(activity)
        return visible
    if weeks is None:
        return activities
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(weeks=weeks)
    return [a for a in activities if _parse_dt(a["started_at"]) >= cutoff]


def _analysis_end_date(activities: list[dict[str, Any]], end_at: str | None) -> date:
    if end_at is not None:
        return _parse_dt(end_at).astimezone(timezone.utc).date()
    if activities:
        return max(_utc_date(activity["started_at"]) for activity in activities)
    return datetime.now(timezone.utc).date()


def _analysis_start_date(
    visible: list[dict[str, Any]],
    start_at: str | None,
    end_day: date,
) -> date:
    if start_at is not None:
        return _parse_dt(start_at).astimezone(timezone.utc).date()
    if visible:
        return min(_utc_date(activity["started_at"]) for activity in visible)
    return end_day


def _daily_load_series(
    activities: list[dict[str, Any]],
    end_day: date,
) -> tuple[list[date], list[float]]:
    if activities:
        start_day = min(_utc_date(activity["started_at"]) for activity in activities)
    else:
        start_day = end_day

    total_days = max(1, (end_day - start_day).days + 1)
    dates = [start_day + timedelta(days=index) for index in range(total_days)]
    daily = [0.0] * total_days
    for activity in activities:
        day = _utc_date(activity["started_at"])
        if day > end_day:
            continue
        idx = (day - start_day).days
        if 0 <= idx < total_days:
            daily[idx] += load_value(activity)
    return dates, daily


def _ema(values: list[float], tau: float) -> list[float]:
    if not values:
        return []
    alpha = 1 - math.exp(-1 / tau)
    out: list[float] = []
    prev = 0.0
    for value in values:
        prev = prev + alpha * (value - prev)
        out.append(prev)
    return out


def _round_series(values: list[float]) -> list[float]:
    return [round(value, 1) for value in values]


def _form_block(
    activities: list[dict[str, Any]],
    visible_start: date,
    end_day: date,
) -> dict[str, Any]:
    dates, daily = _daily_load_series(activities, end_day)
    ctl_raw = _ema(daily, CTL_TAU_DAYS)
    atl_raw = _ema(daily, ATL_TAU_DAYS)
    tsb_raw = [ctl_raw[index] - atl_raw[index] for index in range(len(daily))]
    start_index = max(0, (visible_start - dates[0]).days) if dates else 0

    ctl_now = round(ctl_raw[-1], 1) if ctl_raw else 0.0
    atl_now = round(atl_raw[-1], 1) if atl_raw else 0.0
    tsb_now = round(tsb_raw[-1], 1) if tsb_raw else 0.0
    ctl_prior_index = max(0, len(ctl_raw) - 29)
    ctl_prior = ctl_raw[ctl_prior_index] if ctl_raw else 0.0
    ctl_change_pct_4w = round(((ctl_now - ctl_prior) / ctl_prior) * 100, 1) if ctl_prior > 0 else 0.0
    ctl_week_ago = ctl_raw[-8] if len(ctl_raw) >= 8 else (ctl_raw[0] if ctl_raw else 0.0)
    ramp_rate_per_week = round(ctl_now - ctl_week_ago, 1)

    return {
        "daily_load": _round_series(daily[start_index:]),
        "ctl": _round_series(ctl_raw[start_index:]),
        "atl": _round_series(atl_raw[start_index:]),
        "tsb": _round_series(tsb_raw[start_index:]),
        "ctl_now": ctl_now,
        "atl_now": atl_now,
        "tsb_now": tsb_now,
        "ctl_change_pct_4w": ctl_change_pct_4w,
        "ramp_rate_per_week": ramp_rate_per_week,
        "start_date": visible_start.isoformat(),
        "end_date": end_day.isoformat(),
    }


def _load_quality(activities: list[dict[str, Any]], history_days: int) -> dict[str, Any]:
    tss_count = sum(1 for activity in activities if load_source(activity) == "tss")
    estimated_count = sum(1 for activity in activities if load_source(activity) == "estimated")
    unscored_count = sum(1 for activity in activities if load_source(activity) == "none")
    scored_count = tss_count + estimated_count
    proxy_share_pct = round((estimated_count / scored_count) * 100, 1) if scored_count else 0.0

    if scored_count == 0 or history_days < 28:
        confidence = "low"
        note = "Not enough scored history to trust a strong training-state read."
    elif history_days < 42 or proxy_share_pct >= 60:
        confidence = "low"
        note = "The selected window relies on short or proxy-heavy load history."
    elif history_days < 84 or proxy_share_pct >= 25:
        confidence = "medium"
        note = "Useful directional signal, but some confidence is lost to short or proxy-derived history."
    else:
        confidence = "high"
        note = "The training-state read is based on enough history and mostly direct TSS."

    return {
        "confidence": confidence,
        "history_days": history_days,
        "proxy_share_pct": proxy_share_pct,
        "tss_activity_count": tss_count,
        "estimated_activity_count": estimated_count,
        "unscored_activity_count": unscored_count,
        "enough_history": history_days >= 42,
        "note": note,
    }


def _verdict(
    form: dict[str, Any],
    weekly: list[dict[str, Any]],
    quality: dict[str, Any],
    profile: dict[str, Any] | None,
) -> dict[str, str]:
    ramp = form["ramp_rate_per_week"]
    tsb = form["tsb_now"]
    ctl_change = form["ctl_change_pct_4w"]
    recent_week = weekly[-1]["load"] if weekly else 0.0
    goal_profile = _goal_profile(profile)

    inspect_next = "Check weekly load and supporting signals to confirm the trend is sustainable."
    if quality["confidence"] == "low":
        return {
            "label": "Maintaining",
            "qualifier": "Low-confidence read",
            "headline": "More scored history needed.",
            "detail": f"Ramp {ramp:+.1f} CTL/week with {quality['proxy_share_pct']:.0f}% proxy load. Hold conclusions lightly.",
            "reasoning": quality["note"],
            "next_step": inspect_next,
        }

    if ramp >= 5 and tsb <= -10:
        return {
            "label": "Building",
            "qualifier": "Aggressive loading",
            "headline": "Fitness is rising under heavy strain.",
            "detail": f"Ramp {ramp:+.1f} CTL/week and readiness {tsb:+.0f} suggest this block is productive but costly.",
            "reasoning": "Strong CTL growth is paired with clearly negative readiness, so recovery timing matters.",
            "next_step": "Protect the next recovery opportunity before stacking another hard week.",
        }
    if tsb >= 5 and ctl_change <= 1:
        return {
            "label": "Recovering",
            "qualifier": "Readiness returning",
            "headline": "Readiness is improving.",
            "detail": f"Next-day readiness sits at {tsb:+.0f} while CTL has stayed comparatively flat over 4 weeks.",
            "reasoning": "Load has backed off enough to let form rebound without a major fitness drop.",
            "next_step": "Use this window for quality if your event timing and recovery notes support it.",
        }
    if ramp >= 2:
        headline = "Fitness is trending up." if goal_profile != "steady_power" else "Sustainable power is trending up."
        return {
            "label": "Building",
            "qualifier": "Sustainable progression",
            "headline": headline,
            "detail": f"Ramp {ramp:+.1f} CTL/week with next-day readiness at {tsb:+.0f}.",
            "reasoning": "Load is moving upward without the deeper readiness cost of an aggressive overload block.",
            "next_step": inspect_next,
        }
    if ramp <= -2 or ctl_change <= -3:
        return {
            "label": "Detraining",
            "qualifier": "Load below maintenance",
            "headline": "Fitness stimulus is fading.",
            "detail": f"CTL changed {ctl_change:+.0f}% over 4 weeks and the most recent week landed at {round(recent_week)} load.",
            "reasoning": "The training load trend is soft enough that fitness is more likely being maintained poorly or slipping.",
            "next_step": "Check whether the drop was intentional or whether training days and constraints need a reset.",
        }
    return {
        "label": "Maintaining",
        "qualifier": "Holding steady",
        "headline": "Load is relatively steady.",
        "detail": f"Ramp {ramp:+.1f} CTL/week with next-day readiness at {tsb:+.0f}.",
        "reasoning": "Load and readiness are both sitting in a middle band without a strong progression or regression signal.",
        "next_step": inspect_next,
    }


def analyze_activities(
    activities: list[dict[str, Any]],
    weeks: int | None = 12,
    start_at: str | None = None,
    end_at: str | None = None,
    total_activities: int | None = None,
    range_meta: dict[str, Any] | None = None,
    profile: dict[str, Any] | None = None,
) -> dict[str, Any]:
    visible = _filter_visible(activities, weeks=weeks, start_at=start_at, end_at=end_at)
    end_day = _analysis_end_date(activities, end_at)
    visible_start = _analysis_start_date(visible, start_at, end_day)
    history = [activity for activity in activities if _utc_date(activity["started_at"]) <= end_day]

    weekly: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"week_start": "", "load": 0.0, "count": 0, "duration_hours": 0.0}
    )
    categories: dict[str, dict[str, Any]] = defaultdict(lambda: {"count": 0, "load": 0.0})
    provider_counts: dict[str, int] = defaultdict(int)

    for activity in visible:
        week = _week_start(activity["started_at"])
        weekly[week]["week_start"] = week
        weekly[week]["load"] += load_value(activity)
        weekly[week]["count"] += 1
        weekly[week]["duration_hours"] += (activity.get("duration_seconds") or 0) / 3600
        category = activity.get("workout_category") or "Unclassified"
        categories[category]["count"] += 1
        categories[category]["load"] += load_value(activity)
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

    history_days = max(1, (end_day - min((_utc_date(activity["started_at"]) for activity in history), default=end_day)).days + 1)
    form = _form_block(history, visible_start=visible_start, end_day=end_day)
    quality = _load_quality(visible, history_days=history_days)
    verdict = _verdict(form, weekly_rows, quality, profile)

    top_workouts = sorted(visible, key=load_value, reverse=True)[:10]

    return {
        "meta": {
            "total_activities": total_activities if total_activities is not None else len(activities),
            "recent_activities": len(visible),
            "weeks": weeks,
            "range": range_meta or _range_meta_fallback(weeks, start_at, end_at),
        },
        "summary": {
            "latest_week_load": round(latest, 1),
            "avg_weekly_load": round(avg_weekly, 1),
            "trend_pct": round(trend_pct, 1),
            "total_recent_load": round(sum(loads), 1),
        },
        "form": form,
        "verdict": verdict,
        "load_quality": quality,
        "weekly": weekly_rows,
        "category_breakdown": {
            category: {"count": data["count"], "load": round(data["load"], 1)}
            for category, data in sorted(categories.items())
        },
        "provider_counts": dict(provider_counts),
        "top_workouts": top_workouts,
    }
