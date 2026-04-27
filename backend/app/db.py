from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from app.config import settings


def _sqlite_path() -> Path:
    if not settings.database_url.startswith("sqlite:///"):
        raise RuntimeError("local MVP supports sqlite:/// DATABASE_URL only")
    path = Path(settings.database_url.removeprefix("sqlite:///"))
    if not path.is_absolute():
        path = Path(__file__).resolve().parents[1] / path
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(_sqlite_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS athlete_profiles (
                user_id TEXT PRIMARY KEY,
                event_type TEXT NOT NULL DEFAULT '',
                goals TEXT NOT NULL DEFAULT '',
                constraints TEXT NOT NULL DEFAULT '',
                recovery_notes TEXT NOT NULL DEFAULT '',
                training_days TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS provider_connections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                provider TEXT NOT NULL,
                external_athlete_id TEXT,
                encrypted_secret TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'connected',
                scopes TEXT NOT NULL DEFAULT '',
                expires_at INTEGER,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, provider)
            );

            CREATE TABLE IF NOT EXISTS sync_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                provider TEXT NOT NULL,
                status TEXT NOT NULL,
                message TEXT NOT NULL DEFAULT '',
                started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                finished_at TEXT
            );

            CREATE TABLE IF NOT EXISTS provider_activities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                provider TEXT NOT NULL,
                provider_activity_id TEXT NOT NULL,
                canonical_activity_id INTEGER,
                name TEXT NOT NULL,
                sport_type TEXT NOT NULL,
                started_at TEXT NOT NULL,
                duration_seconds INTEGER NOT NULL DEFAULT 0,
                distance_meters REAL,
                tss REAL,
                estimated_load REAL,
                intensity_factor REAL,
                normalized_power REAL,
                kilojoules REAL,
                workout_category TEXT,
                external_url TEXT,
                raw_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, provider, provider_activity_id)
            );

            CREATE TABLE IF NOT EXISTS canonical_activities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                sport_type TEXT NOT NULL,
                started_at TEXT NOT NULL,
                duration_seconds INTEGER NOT NULL DEFAULT 0,
                distance_meters REAL,
                source_priority TEXT NOT NULL DEFAULT 'merged',
                tss REAL,
                estimated_load REAL,
                workout_category TEXT,
                merge_confidence REAL NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS activity_zone_distributions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                canonical_activity_id INTEGER NOT NULL,
                provider TEXT NOT NULL,
                zone_name TEXT NOT NULL,
                seconds INTEGER NOT NULL DEFAULT 0,
                source TEXT NOT NULL DEFAULT 'provider',
                FOREIGN KEY(canonical_activity_id) REFERENCES canonical_activities(id)
            );

            CREATE TABLE IF NOT EXISTS question_answers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                question TEXT NOT NULL,
                answer_json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_provider_activities_user_started
                ON provider_activities(user_id, started_at);
            CREATE INDEX IF NOT EXISTS idx_canonical_activities_user_started
                ON canonical_activities(user_id, started_at);
            """
        )
