from __future__ import annotations

from typing import Any


def generate_insights(analysis: dict[str, Any]) -> list[dict[str, str]]:
    summary = analysis["summary"]
    zones = analysis["zone_breakdown"]
    insights: list[dict[str, str]] = []

    trend = summary["trend_pct"]
    if trend >= 15:
        insights.append(
            {
                "level": "warning",
                "title": "Training load is ramping quickly",
                "body": f"Recent weekly load is up {trend}% versus the earlier part of this window. Check recovery and avoid stacking hard weeks without a downshift.",
            }
        )
    elif trend <= -15:
        insights.append(
            {
                "level": "regression",
                "title": "Training load is trending down",
                "body": f"Recent weekly load is down {abs(trend)}%. If this was not intentional, fitness stimulus may be fading.",
            }
        )
    else:
        insights.append(
            {
                "level": "stable",
                "title": "Load trend is relatively stable",
                "body": f"Weekly load changed {trend}% across this window, which suggests a steadier training pattern.",
            }
        )

    hard_load = sum(
        zones.get(zone, {}).get("load", 0)
        for zone in ["Threshold", "VO2 Max", "Anaerobic", "Sweet Spot"]
    )
    endurance_load = zones.get("Endurance", {}).get("load", 0) + zones.get("Tempo", {}).get("load", 0)
    if hard_load > endurance_load * 1.2 and hard_load > 0:
        insights.append(
            {
                "level": "warning",
                "title": "Intensity-heavy distribution",
                "body": "Most classified stress is coming from Sweet Spot, Threshold, VO2 Max, or Anaerobic work. That may be mismatched for endurance-event goals.",
            }
        )
    elif endurance_load > hard_load:
        insights.append(
            {
                "level": "progress",
                "title": "Endurance base is well represented",
                "body": "Endurance and Tempo work make up more classified load than high-intensity work in this window.",
            }
        )

    if analysis["meta"]["recent_activities"] < 4:
        insights.append(
            {
                "level": "data",
                "title": "Limited recent data",
                "body": "There are not many recent workouts in the selected range, so trend confidence is lower.",
            }
        )

    return insights
