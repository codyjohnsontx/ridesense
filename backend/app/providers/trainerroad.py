from __future__ import annotations

from app.schemas import ActivityIn


def link_session_placeholder() -> dict[str, str]:
    return {
        "status": "not_configured",
        "message": "TrainerRoad browser session linking is scaffolded. Implement Playwright login/session capture before production use.",
    }


def sync_trainerroad_activities() -> list[ActivityIn]:
    """Production implementation should log in with Playwright and store cookies only.

    This placeholder keeps the API contract in place without storing TrainerRoad
    passwords or scraping during local development.
    """
    return []
