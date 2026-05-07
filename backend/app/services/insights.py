from __future__ import annotations

from typing import Any


def _goal_profile(profile: dict[str, Any] | None) -> str:
    if not profile:
        return "general"
    text = " ".join(
        str(profile.get(key) or "").lower()
        for key in ["event_type", "goals", "constraints", "recovery_notes", "training_days"]
    )
    if any(token in text for token in ["gran fondo", "endurance", "gravel", "ultra", "road race"]):
        return "endurance"
    if any(token in text for token in ["criterium", "crit", "cyclocross", "xco", "short track"]):
        return "high_intensity"
    return "general"


def generate_insights(analysis: dict[str, Any], profile: dict[str, Any] | None = None) -> list[dict[str, str]]:
    summary = analysis["summary"]
    categories = analysis["category_breakdown"]
    verdict = analysis["verdict"]
    quality = analysis["load_quality"]
    insights: list[dict[str, str]] = []

    ramp = analysis["form"]["ramp_rate_per_week"]
    if ramp >= 5:
        insights.append(
            {
                "level": "warning",
                "title": "CTL is ramping quickly",
                "body": f"Fitness is rising about {ramp:.1f} CTL points per week. Productive blocks can do this, but recovery timing becomes more important.",
            }
        )
    elif ramp <= -2:
        insights.append(
            {
                "level": "regression",
                "title": "Fitness stimulus is easing",
                "body": f"CTL is moving about {ramp:.1f} points per week, which suggests the recent load is not strongly progressive.",
            }
        )
    else:
        insights.append(
            {
                "level": "stable",
                "title": "Load trend is relatively steady",
                "body": f"Weekly load changed {summary['trend_pct']}% across this window and the current verdict is {verdict['qualifier'].lower()}.",
            }
        )

    hard_load = sum(
        categories.get(name, {}).get("load", 0)
        for name in ["Threshold", "VO2 Max", "Anaerobic", "Sweet Spot"]
    )
    aerobic_load = categories.get("Endurance", {}).get("load", 0) + categories.get("Tempo", {}).get("load", 0)
    goal_profile = _goal_profile(profile)
    if hard_load > aerobic_load * 1.2 and hard_load > 0 and goal_profile == "endurance":
        insights.append(
            {
                "level": "warning",
                "title": "Workout mix leans intensity-heavy",
                "body": "More scored load is coming from hard workout categories than from endurance-oriented work. That can be fine short term, but it is worth checking against an endurance-focused goal.",
            }
        )
    elif aerobic_load > hard_load and aerobic_load > 0:
        insights.append(
            {
                "level": "progress",
                "title": "Workout mix supports aerobic development",
                "body": "Endurance and tempo categories account for more scored load than the harder workout categories in this window.",
            }
        )

    if quality["confidence"] != "high":
        insights.append(
            {
                "level": "data",
                "title": "Confidence is reduced by data quality",
                "body": quality["note"],
            }
        )

    if analysis["meta"]["recent_activities"] < 4:
        insights.append(
            {
                "level": "data",
                "title": "Limited recent activity count",
                "body": "There are not many recent rides in the selected range, so trend and verdict confidence are naturally lower.",
            }
        )

    return insights
