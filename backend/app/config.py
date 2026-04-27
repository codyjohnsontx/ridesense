from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv


load_dotenv()


@dataclass(frozen=True)
class Settings:
    app_env: str = os.getenv("APP_ENV", "development")
    app_secret_key: str = os.getenv("APP_SECRET_KEY", "replace-me")
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./data/app.db")
    frontend_origin: str = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
    dev_auth_enabled: bool = os.getenv("DEV_AUTH_ENABLED", "true").lower() == "true"
    supabase_url: str = os.getenv("SUPABASE_URL", "")
    supabase_jwt_secret: str = os.getenv("SUPABASE_JWT_SECRET", "")
    strava_client_id: str = os.getenv("STRAVA_CLIENT_ID", "")
    strava_client_secret: str = os.getenv("STRAVA_CLIENT_SECRET", "")
    strava_redirect_uri: str = os.getenv(
        "STRAVA_REDIRECT_URI", "http://localhost:8000/strava/oauth/callback"
    )
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-5.4")


settings = Settings()
