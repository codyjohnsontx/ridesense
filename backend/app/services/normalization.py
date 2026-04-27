from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.schemas import ActivityIn


CYCLING_TYPES = {
    "Ride",
    "VirtualRide",
    "EBikeRide",
    "MountainBikeRide",
    "GravelRide",
    "Workout",
    "Cycling",
}


PROGRESSION_ZONE_MAP = {
    16: "Tempo",
    33: "Endurance",
    79: "Anaerobic",
    83: "Threshold",
    84: "Sweet Spot",
    85: "VO2 Max",
}


def iso_utc(value: str) -> str:
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    dt = datetime.fromisoformat(value)
    if not dt.tzinfo:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def is_cycling_activity(sport_type: str) -> bool:
    return sport_type in CYCLING_TYPES or "ride" in sport_type.lower()


def estimate_load_from_strava(activity: dict[str, Any]) -> float | None:
    suffer_score = activity.get("suffer_score")
    if suffer_score is not None:
        return float(suffer_score)
    weighted_power = activity.get("weighted_average_watts")
    elapsed = activity.get("moving_time") or activity.get("elapsed_time")
    if weighted_power and elapsed:
        # Rough load proxy: duration hours * relative power stress.
        return round((float(elapsed) / 3600) * (float(weighted_power) / 2.5), 1)
    return None


def normalize_strava_activity(activity: dict[str, Any]) -> ActivityIn | None:
    sport_type = activity.get("sport_type") or activity.get("type") or ""
    if not is_cycling_activity(str(sport_type)):
        return None
    activity_id = str(activity["id"])
    return ActivityIn(
        provider="strava",
        provider_activity_id=activity_id,
        name=activity.get("name") or "Strava activity",
        sport_type=str(sport_type),
        started_at=iso_utc(activity["start_date"]),
        duration_seconds=int(activity.get("moving_time") or activity.get("elapsed_time") or 0),
        distance_meters=activity.get("distance"),
        estimated_load=estimate_load_from_strava(activity),
        normalized_power=activity.get("weighted_average_watts"),
        kilojoules=activity.get("kilojoules"),
        external_url=f"https://www.strava.com/activities/{activity_id}",
        raw_json=activity,
    )


def normalize_trainerroad_activity(activity: dict[str, Any]) -> ActivityIn | None:
    activity_id = str(activity.get("Id") or activity.get("id") or "")
    if not activity_id:
        return None
    started_at = activity.get("StartedAt") or activity.get("startedAt") or activity.get("Date")
    if not started_at:
        return None
    progression_id = activity.get("ProgressionId") or activity.get("progressionId")
    return ActivityIn(
        provider="trainerroad",
        provider_activity_id=activity_id,
        name=activity.get("Name") or activity.get("name") or "TrainerRoad workout",
        sport_type=activity.get("Sport") or activity.get("sport") or "Cycling",
        started_at=iso_utc(str(started_at)),
        duration_seconds=int(
            activity.get("DurationSeconds")
            or activity.get("durationSeconds")
            or float(activity.get("DurationMinutes") or 0) * 60
        ),
        distance_meters=activity.get("DistanceMeters") or activity.get("distanceMeters"),
        tss=activity.get("Tss") or activity.get("TSS") or activity.get("tss"),
        intensity_factor=activity.get("IF") or activity.get("IntensityFactor"),
        normalized_power=activity.get("NP") or activity.get("NormalizedPower"),
        kilojoules=activity.get("Kj") or activity.get("Kilojoules"),
        workout_category=PROGRESSION_ZONE_MAP.get(int(progression_id)) if progression_id else None,
        external_url=activity.get("Url") or activity.get("url"),
        raw_json=activity,
    )
