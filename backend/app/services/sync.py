from __future__ import annotations

import time

from app import repository
from app.providers import strava, trainerroad
from app.security import open_json, seal_json
from app.services.merge import rebuild_canonical_activities
from app.services.normalization import normalize_strava_activity


def sync_strava(user_id: str) -> int:
    connection = repository.get_connection(user_id, "strava")
    if not connection:
        return 0

    secret = open_json(connection["encrypted_secret"])
    if int(secret.get("expires_at") or 0) <= int(time.time()) + 60:
        secret = strava.refresh_access_token(secret["refresh_token"])
        repository.save_connection(
            user_id=user_id,
            provider="strava",
            encrypted_secret=seal_json(secret),
            external_athlete_id=connection.get("external_athlete_id") or "",
            scopes=connection.get("scopes") or "",
            expires_at=secret.get("expires_at"),
        )

    count = 0
    page = 1
    while True:
        activities, _headers = strava.list_activities(secret["access_token"], page=page)
        if not activities:
            break
        for raw in activities:
            normalized = normalize_strava_activity(raw)
            if normalized:
                repository.upsert_provider_activity(user_id, normalized)
                count += 1
        if len(activities) < 100:
            break
        page += 1

    rebuild_canonical_activities(user_id)
    return count


def sync_trainerroad(user_id: str) -> int:
    count = 0
    for activity in trainerroad.sync_trainerroad_activities():
        repository.upsert_provider_activity(user_id, activity)
        count += 1
    rebuild_canonical_activities(user_id)
    return count


def sync_provider(user_id: str, provider: str) -> dict[str, int]:
    result = {"strava": 0, "trainerroad": 0}
    if provider in {"strava", "all"}:
        result["strava"] = sync_strava(user_id)
    if provider in {"trainerroad", "all"}:
        result["trainerroad"] = sync_trainerroad(user_id)
    return result
