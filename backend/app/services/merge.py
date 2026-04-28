from __future__ import annotations

from datetime import datetime
from difflib import SequenceMatcher

from app.db import connect


_PROVIDER_PRIORITY: dict[str, int] = {"trainerroad": 3, "strava": 2, "upload": 1}


def _higher_priority(a: str, b: str) -> str:
    for name in (a, b):
        if name not in _PROVIDER_PRIORITY:
            raise ValueError(
                f"unknown activity provider: {name!r}. "
                f"Known providers: {sorted(_PROVIDER_PRIORITY)}"
            )
    return a if _PROVIDER_PRIORITY[a] >= _PROVIDER_PRIORITY[b] else b


def _parse_dt(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _confidence(candidate: dict, existing: dict) -> float:
    minutes_apart = abs((_parse_dt(candidate["started_at"]) - _parse_dt(existing["started_at"])).total_seconds()) / 60
    duration_delta = abs((candidate.get("duration_seconds") or 0) - (existing.get("duration_seconds") or 0))
    name_ratio = SequenceMatcher(
        None, (candidate.get("name") or "").lower(), (existing.get("name") or "").lower()
    ).ratio()
    score = 0.0
    if minutes_apart <= 5:
        score += 0.45
    elif minutes_apart <= 20:
        score += 0.25
    if duration_delta <= 180:
        score += 0.35
    elif duration_delta <= 600:
        score += 0.2
    score += min(name_ratio * 0.2, 0.2)
    return round(score, 2)


def rebuild_canonical_activities(user_id: str) -> None:
    """Rebuild canonical activities from provider activities for a user.

    This simple MVP algorithm favors correctness over incremental complexity.
    """
    with connect() as conn:
        provider_rows = [
            dict(row)
            for row in conn.execute(
                """
                SELECT * FROM provider_activities
                WHERE user_id = ?
                ORDER BY started_at ASC
                """,
                (user_id,),
            ).fetchall()
        ]

        conn.execute("DELETE FROM activity_zone_distributions WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM canonical_activities WHERE user_id = ?", (user_id,))

        canonicals: list[dict] = []
        for row in provider_rows:
            provider_row_id = row["id"]
            match_index = None
            match_confidence = 0.0
            for idx, existing in enumerate(canonicals):
                score = _confidence(row, existing)
                if score >= 0.72 and score > match_confidence:
                    match_index = idx
                    match_confidence = score

            if match_index is None:
                cur = conn.execute(
                    """
                    INSERT INTO canonical_activities (
                        user_id, name, sport_type, started_at, duration_seconds,
                        distance_meters, source_priority, tss, estimated_load,
                        workout_category, merge_confidence
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        user_id,
                        row["name"],
                        row["sport_type"],
                        row["started_at"],
                        row["duration_seconds"],
                        row["distance_meters"],
                        row["provider"],
                        row["tss"],
                        row["estimated_load"],
                        row["workout_category"],
                        1,
                    ),
                )
                canonical_id = int(cur.lastrowid)
                canonical_row = dict(row)
                canonical_row["id"] = canonical_id
                canonicals.append(canonical_row)
            else:
                existing = canonicals[match_index]
                canonical_id = existing["id"]
                source_priority = _higher_priority(row["provider"], existing["provider"])
                tss = row["tss"] if row["tss"] is not None else existing["tss"]
                estimated_load = existing["estimated_load"] if existing["estimated_load"] is not None else row["estimated_load"]
                workout_category = row["workout_category"] or existing["workout_category"]
                conn.execute(
                    """
                    UPDATE canonical_activities
                    SET source_priority=?, tss=?, estimated_load=?, workout_category=?,
                        merge_confidence=?, updated_at=CURRENT_TIMESTAMP
                    WHERE id=?
                    """,
                    (source_priority, tss, estimated_load, workout_category, match_confidence, canonical_id),
                )
                existing.update(
                    {
                        "provider": source_priority,
                        "tss": tss,
                        "estimated_load": estimated_load,
                        "workout_category": workout_category,
                    }
                )

            conn.execute(
                "UPDATE provider_activities SET canonical_activity_id=? WHERE id=?",
                (canonical_id, provider_row_id),
            )
