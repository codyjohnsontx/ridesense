from __future__ import annotations

import io
from datetime import datetime, timezone
from typing import Any


def parse_fit(content: bytes) -> dict[str, Any]:
    """Parse a FIT (Garmin Flexible and Interoperable Data Transfer) file.

    Pulls fields from the `session` message when present (Garmin/Wahoo
    devices write one), and falls back to scanning `record` messages to
    derive started_at and duration when the file lacks a session message.
    """
    try:
        from fitparse import FitFile  # type: ignore[import-untyped]
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError(
            "fitparse is required to parse .fit files. Install with `pip install fitparse`."
        ) from exc

    try:
        fit = FitFile(io.BytesIO(content))
    except Exception as exc:
        raise ValueError(f"Invalid FIT file: {exc}") from exc

    sessions = list(fit.get_messages("session"))
    if sessions:
        s = {f.name: f.value for f in sessions[0].fields}
        started_at = _to_utc(s.get("start_time"))
        duration = int(round(float(s.get("total_elapsed_time") or s.get("total_timer_time") or 0)))
        sport = (s.get("sport") or "cycling")
        sport_type = "Ride" if str(sport).lower() in {"cycling", "biking"} else str(sport).title()
        distance = s.get("total_distance")
        nrm_power = s.get("normalized_power") or s.get("avg_power")
        kj = s.get("total_work")  # joules
        kj_value = float(kj) / 1000.0 if kj else None
    else:
        records = list(fit.get_messages("record"))
        if not records:
            raise ValueError("FIT file has no session or record messages")
        timestamps = [r.get("timestamp").value for r in records if r.get("timestamp")]
        if not timestamps:
            raise ValueError("FIT records lack timestamps")
        started_at = _to_utc(timestamps[0])
        duration = int((timestamps[-1] - timestamps[0]).total_seconds())
        sport_type = "Ride"
        distance = None
        nrm_power = None
        kj_value = None

    if duration <= 0:
        raise ValueError("FIT file duration is zero or negative")

    return {
        "name": None,  # FIT files rarely carry a user-facing name
        "sport_type": sport_type,
        "started_at": started_at.isoformat(),
        "duration_seconds": duration,
        "distance_meters": float(distance) if distance is not None else None,
        "normalized_power": float(nrm_power) if nrm_power is not None else None,
        "kilojoules": kj_value,
    }


def _to_utc(value: Any) -> datetime:
    if value is None:
        raise ValueError("FIT timestamp missing")
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)
    raise ValueError(f"unexpected FIT timestamp type: {type(value).__name__}")
