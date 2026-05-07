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
    if any(token in text for token in ["time trial", "tt", "pursuit"]):
        return "steady_power"
    return "general"
