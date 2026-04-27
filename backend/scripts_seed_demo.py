from __future__ import annotations

from app.db import init_db
from app.repository import upsert_provider_activity, upsert_profile
from app.schemas import ActivityIn, AthleteProfile
from app.services.merge import rebuild_canonical_activities


USER_ID = "demo-user"


def main() -> None:
    init_db()
    upsert_profile(
        USER_ID,
        AthleteProfile(
            event_type="Gran fondo",
            goals="Build durable endurance while keeping one quality intensity day.",
            constraints="Busy work week, prefers weekends for long rides.",
            recovery_notes="Sleep drops during travel weeks.",
            training_days="Tue, Thu, Sat, Sun",
        ),
    )
    samples = [
        ActivityIn(
            provider="trainerroad",
            provider_activity_id="tr-1",
            name="Geiger",
            sport_type="Cycling",
            started_at="2026-03-30T12:00:00+00:00",
            duration_seconds=3600,
            tss=74,
            workout_category="Sweet Spot",
            external_url="https://trainerroad.com/app/career/demo/rides/tr-1",
        ),
        ActivityIn(
            provider="strava",
            provider_activity_id="st-1",
            name="Geiger",
            sport_type="Ride",
            started_at="2026-03-30T12:02:00+00:00",
            duration_seconds=3580,
            estimated_load=70,
            external_url="https://www.strava.com/activities/st-1",
        ),
        ActivityIn(
            provider="trainerroad",
            provider_activity_id="tr-2",
            name="Spanish Needle",
            sport_type="Cycling",
            started_at="2026-04-07T12:00:00+00:00",
            duration_seconds=3000,
            tss=92,
            workout_category="VO2 Max",
        ),
        ActivityIn(
            provider="strava",
            provider_activity_id="st-2",
            name="Long endurance loop",
            sport_type="Ride",
            started_at="2026-04-19T14:00:00+00:00",
            duration_seconds=10800,
            estimated_load=150,
            workout_category="Endurance",
        ),
    ]
    for sample in samples:
        upsert_provider_activity(USER_ID, sample)
    rebuild_canonical_activities(USER_ID)
    print("Seeded demo-user activity data.")


if __name__ == "__main__":
    main()
