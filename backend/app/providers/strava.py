from __future__ import annotations

from urllib.parse import urlencode

import requests

from app.config import settings


AUTH_URL = "https://www.strava.com/oauth/authorize"
TOKEN_URL = "https://www.strava.com/oauth/token"
API_URL = "https://www.strava.com/api/v3"


def authorization_url(state: str) -> str:
    params = {
        "client_id": settings.strava_client_id,
        "redirect_uri": settings.strava_redirect_uri,
        "response_type": "code",
        "approval_prompt": "auto",
        "scope": "read,activity:read_all,profile:read_all",
        "state": state,
    }
    return f"{AUTH_URL}?{urlencode(params)}"


def exchange_code(code: str) -> dict:
    response = requests.post(
        TOKEN_URL,
        data={
            "client_id": settings.strava_client_id,
            "client_secret": settings.strava_client_secret,
            "code": code,
            "grant_type": "authorization_code",
        },
        timeout=20,
    )
    response.raise_for_status()
    return response.json()


def refresh_access_token(refresh_token: str) -> dict:
    response = requests.post(
        TOKEN_URL,
        data={
            "client_id": settings.strava_client_id,
            "client_secret": settings.strava_client_secret,
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        },
        timeout=20,
    )
    response.raise_for_status()
    return response.json()


def list_activities(access_token: str, page: int = 1, per_page: int = 100) -> tuple[list[dict], dict[str, str]]:
    response = requests.get(
        f"{API_URL}/athlete/activities",
        headers={"Authorization": f"Bearer {access_token}"},
        params={"page": page, "per_page": per_page},
        timeout=30,
    )
    response.raise_for_status()
    rate_headers = {
        key: value
        for key, value in response.headers.items()
        if key.lower().startswith("x-ratelimit")
    }
    return response.json(), rate_headers


def activity_zones(access_token: str, activity_id: str) -> dict:
    response = requests.get(
        f"{API_URL}/activities/{activity_id}/zones",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=20,
    )
    response.raise_for_status()
    return response.json()
