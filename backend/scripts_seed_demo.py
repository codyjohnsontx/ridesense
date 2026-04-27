from __future__ import annotations

from datetime import datetime, time, timedelta, timezone

from app.db import init_db
from app.repository import delete_user_data, upsert_provider_activity, upsert_profile
from app.schemas import ActivityIn, AthleteProfile
from app.services.merge import rebuild_canonical_activities


USER_ID = "demo-user"


def _activity_date(days_ago: int, hour: int = 12) -> str:
    today = datetime.now(timezone.utc).date()
    dt = datetime.combine(today - timedelta(days=days_ago), time(hour=hour), tzinfo=timezone.utc)
    return dt.isoformat()


def main() -> None:
    init_db()
    delete_user_data(USER_ID)
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
            started_at=_activity_date(27),
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
            started_at=_activity_date(27, hour=12).replace("12:00:00", "12:02:00"),
            duration_seconds=3580,
            estimated_load=70,
            external_url="https://www.strava.com/activities/st-1",
        ),
        ActivityIn(
            provider="trainerroad",
            provider_activity_id="tr-2",
            name="Spanish Needle",
            sport_type="Cycling",
            started_at=_activity_date(20),
            duration_seconds=3000,
            tss=92,
            workout_category="VO2 Max",
        ),
        ActivityIn(
            provider="strava",
            provider_activity_id="st-2",
            name="Long endurance loop",
            sport_type="Ride",
            started_at=_activity_date(8, hour=14),
            duration_seconds=10800,
            estimated_load=150,
            workout_category="Endurance",
        ),
        ActivityIn(
            provider="trainerroad",
            provider_activity_id="tr-3",
            name="Carson",
            sport_type="Cycling",
            started_at=_activity_date(24),
            duration_seconds=3600,
            tss=66,
            workout_category="Sweet Spot",
        ),
        ActivityIn(
            provider="strava",
            provider_activity_id="st-3",
            name="Lunch endurance",
            sport_type="Ride",
            started_at=_activity_date(22),
            duration_seconds=4200,
            estimated_load=58,
            workout_category="Endurance",
        ),
        ActivityIn(
            provider="trainerroad",
            provider_activity_id="tr-4",
            name="Baird",
            sport_type="Cycling",
            started_at=_activity_date(17),
            duration_seconds=3300,
            tss=82,
            workout_category="VO2 Max",
        ),
        ActivityIn(
            provider="strava",
            provider_activity_id="st-4",
            name="Tempo commute",
            sport_type="Ride",
            started_at=_activity_date(15),
            duration_seconds=3900,
            estimated_load=62,
            workout_category="Tempo",
        ),
        ActivityIn(
            provider="trainerroad",
            provider_activity_id="tr-5",
            name="Pettit",
            sport_type="Cycling",
            started_at=_activity_date(13),
            duration_seconds=3600,
            tss=45,
            workout_category="Endurance",
        ),
        ActivityIn(
            provider="strava",
            provider_activity_id="st-5",
            name="Saturday group ride",
            sport_type="Ride",
            started_at=_activity_date(10, hour=9),
            duration_seconds=9000,
            estimated_load=128,
            workout_category="Tempo",
        ),
        ActivityIn(
            provider="trainerroad",
            provider_activity_id="tr-6",
            name="Mills",
            sport_type="Cycling",
            started_at=_activity_date(6),
            duration_seconds=3300,
            tss=88,
            workout_category="VO2 Max",
        ),
        ActivityIn(
            provider="strava",
            provider_activity_id="st-6",
            name="Recovery spin",
            sport_type="Ride",
            started_at=_activity_date(4),
            duration_seconds=2400,
            estimated_load=24,
            workout_category="Endurance",
        ),
        ActivityIn(
            provider="trainerroad",
            provider_activity_id="tr-7",
            name="Mary Austin",
            sport_type="Cycling",
            started_at=_activity_date(2),
            duration_seconds=3600,
            tss=98,
            workout_category="Threshold",
        ),
        ActivityIn(
            provider="strava",
            provider_activity_id="st-7",
            name="Endurance finish",
            sport_type="Ride",
            started_at=_activity_date(1),
            duration_seconds=5400,
            estimated_load=76,
            workout_category="Endurance",
        ),
    ]
    for sample in samples:
        upsert_provider_activity(USER_ID, sample)
    rebuild_canonical_activities(USER_ID)
    print("Seeded demo-user activity data.")


if __name__ == "__main__":
    main()
