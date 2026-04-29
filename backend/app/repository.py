from __future__ import annotations

import json
import sqlite3
from typing import Any

from app.db import connect
from app.schemas import AthleteProfile, ActivityIn


def upsert_profile(user_id: str, profile: AthleteProfile) -> AthleteProfile:
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO athlete_profiles
                (user_id, event_type, goals, constraints, recovery_notes, training_days)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                event_type=excluded.event_type,
                goals=excluded.goals,
                constraints=excluded.constraints,
                recovery_notes=excluded.recovery_notes,
                training_days=excluded.training_days,
                updated_at=CURRENT_TIMESTAMP
            """,
            (
                user_id,
                profile.event_type,
                profile.goals,
                profile.constraints,
                profile.recovery_notes,
                profile.training_days,
            ),
        )
    return profile


def get_profile(user_id: str) -> AthleteProfile:
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM athlete_profiles WHERE user_id = ?", (user_id,)
        ).fetchone()
    if not row:
        return AthleteProfile()
    return AthleteProfile(
        event_type=row["event_type"],
        goals=row["goals"],
        constraints=row["constraints"],
        recovery_notes=row["recovery_notes"],
        training_days=row["training_days"],
    )


def delete_user_data(user_id: str) -> None:
    with connect() as conn:
        conn.execute("DELETE FROM activity_zone_distributions WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM canonical_activities WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM provider_activities WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM provider_connections WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM sync_runs WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM question_answers WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM athlete_profiles WHERE user_id = ?", (user_id,))


def save_connection(
    user_id: str,
    provider: str,
    encrypted_secret: str,
    external_athlete_id: str = "",
    scopes: str = "",
    expires_at: int | None = None,
) -> None:
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO provider_connections
                (user_id, provider, external_athlete_id, encrypted_secret, scopes, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, provider) DO UPDATE SET
                external_athlete_id=excluded.external_athlete_id,
                encrypted_secret=excluded.encrypted_secret,
                scopes=excluded.scopes,
                expires_at=excluded.expires_at,
                status='connected',
                updated_at=CURRENT_TIMESTAMP
            """,
            (user_id, provider, external_athlete_id, encrypted_secret, scopes, expires_at),
        )


def set_connection_status(user_id: str, provider: str, status: str) -> None:
    with connect() as conn:
        conn.execute(
            "UPDATE provider_connections SET status=?, updated_at=CURRENT_TIMESTAMP "
            "WHERE user_id = ? AND provider = ?",
            (status, user_id, provider),
        )


def list_connections(user_id: str) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT provider, external_athlete_id, status, scopes, expires_at, updated_at
            FROM provider_connections
            WHERE user_id = ?
            ORDER BY provider
            """,
            (user_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def get_connection(user_id: str, provider: str) -> dict[str, Any] | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM provider_connections WHERE user_id = ? AND provider = ?",
            (user_id, provider),
        ).fetchone()
    return dict(row) if row else None


def create_sync_run(user_id: str, provider: str, status: str = "queued") -> int:
    with connect() as conn:
        cur = conn.execute(
            "INSERT INTO sync_runs (user_id, provider, status) VALUES (?, ?, ?)",
            (user_id, provider, status),
        )
        return int(cur.lastrowid)


def update_sync_run(run_id: int, status: str, message: str = "") -> None:
    finished = ", finished_at=CURRENT_TIMESTAMP" if status in {"completed", "failed"} else ""
    with connect() as conn:
        conn.execute(
            f"UPDATE sync_runs SET status=?, message=?{finished} WHERE id=?",
            (status, message, run_id),
        )


def list_sync_runs(user_id: str) -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT id, provider, status, message, started_at, finished_at
            FROM sync_runs
            WHERE user_id = ?
            ORDER BY id DESC
            LIMIT 20
            """,
            (user_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def get_sync_run(user_id: str, run_id: int) -> dict[str, Any] | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM sync_runs WHERE user_id = ? AND id = ?", (user_id, run_id)
        ).fetchone()
    return dict(row) if row else None


def upsert_provider_activity(user_id: str, activity: ActivityIn) -> int:
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO provider_activities (
                user_id, provider, provider_activity_id, name, sport_type, started_at,
                duration_seconds, distance_meters, tss, estimated_load, intensity_factor,
                normalized_power, kilojoules, workout_category, external_url, raw_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, provider, provider_activity_id) DO UPDATE SET
                name=excluded.name,
                sport_type=excluded.sport_type,
                started_at=excluded.started_at,
                duration_seconds=excluded.duration_seconds,
                distance_meters=excluded.distance_meters,
                tss=excluded.tss,
                estimated_load=excluded.estimated_load,
                intensity_factor=excluded.intensity_factor,
                normalized_power=excluded.normalized_power,
                kilojoules=excluded.kilojoules,
                workout_category=excluded.workout_category,
                external_url=excluded.external_url,
                raw_json=excluded.raw_json,
                updated_at=CURRENT_TIMESTAMP
            """,
            (
                user_id,
                activity.provider,
                activity.provider_activity_id,
                activity.name,
                activity.sport_type,
                activity.started_at,
                activity.duration_seconds,
                activity.distance_meters,
                activity.tss,
                activity.estimated_load,
                activity.intensity_factor,
                activity.normalized_power,
                activity.kilojoules,
                activity.workout_category,
                activity.external_url,
                json.dumps(activity.raw_json),
            ),
        )
        row = conn.execute(
            """
            SELECT id FROM provider_activities
            WHERE user_id = ? AND provider = ? AND provider_activity_id = ?
            """,
            (user_id, activity.provider, activity.provider_activity_id),
        ).fetchone()
        return int(row["id"])


def list_provider_activities(user_id: str) -> list[sqlite3.Row]:
    with connect() as conn:
        return conn.execute(
            "SELECT * FROM provider_activities WHERE user_id = ? ORDER BY started_at DESC",
            (user_id,),
        ).fetchall()


def count_canonical_activities(
    user_id: str,
    start_at: str | None = None,
    end_at: str | None = None,
) -> int:
    clauses = ["user_id = ?"]
    params: list[Any] = [user_id]
    if start_at is not None:
        clauses.append("datetime(started_at) >= datetime(?)")
        params.append(start_at)
    if end_at is not None:
        clauses.append("datetime(started_at) <= datetime(?)")
        params.append(end_at)

    with connect() as conn:
        row = conn.execute(
            f"""
            SELECT COUNT(*) AS count FROM canonical_activities
            WHERE {" AND ".join(clauses)}
            """,
            params,
        ).fetchone()
    return int(row["count"])


def list_canonical_activities(
    user_id: str,
    limit: int | None = 500,
    offset: int = 0,
    start_at: str | None = None,
    end_at: str | None = None,
) -> list[dict[str, Any]]:
    clauses = ["user_id = ?"]
    params: list[Any] = [user_id]
    if start_at is not None:
        clauses.append("datetime(started_at) >= datetime(?)")
        params.append(start_at)
    if end_at is not None:
        clauses.append("datetime(started_at) <= datetime(?)")
        params.append(end_at)

    limit_sql = ""
    if limit is not None:
        limit_sql = "LIMIT ? OFFSET ?"
        params.extend([limit, offset])

    with connect() as conn:
        rows = conn.execute(
            f"""
            SELECT * FROM canonical_activities
            WHERE {" AND ".join(clauses)}
            ORDER BY started_at DESC, id DESC
            {limit_sql}
            """,
            params,
        ).fetchall()
    return [dict(row) for row in rows]


def save_answer(user_id: str, question: str, answer_json: dict[str, Any]) -> None:
    with connect() as conn:
        conn.execute(
            "INSERT INTO question_answers (user_id, question, answer_json) VALUES (?, ?, ?)",
            (user_id, question, json.dumps(answer_json)),
        )
