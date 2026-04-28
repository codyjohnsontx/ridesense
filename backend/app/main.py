from __future__ import annotations

import logging
from urllib.parse import urlencode

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from app import repository
from app.auth import UserId
from app.config import settings
from app.db import init_db
from app.providers import strava, trainerroad
from app.schemas import AthleteProfile, QuestionRequest, SyncRequest
from app.security import seal_json
from app.services.ai import answer_question
from app.services.analytics import analyze_activities
from app.services.insights import generate_insights
from app.services.merge import rebuild_canonical_activities
from app.services.parsers import (
    InvalidActivityFileError,
    SUPPORTED_EXTENSIONS,
    UnsupportedFormatError,
    parse_activity_file,
)
from app.services.sync import sync_provider


MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB


logger = logging.getLogger(__name__)

app = FastAPI(title="Training Insights API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/config/status")
def config_status() -> dict[str, bool]:
    return {
        "strava_configured": bool(settings.strava_client_id and settings.strava_client_secret),
        "trainerroad_linking_configured": False,
        "openai_configured": bool(settings.openai_api_key),
        "dev_auth_enabled": settings.dev_auth_enabled,
    }


@app.get("/integrations")
def integrations(user_id: UserId) -> dict:
    return {"connections": repository.list_connections(user_id)}


@app.post("/strava/link/start")
def strava_link_start(user_id: UserId) -> dict[str, str]:
    if not settings.strava_client_id:
        raise HTTPException(status_code=400, detail="Strava client id is not configured")
    state = seal_json({"user_id": user_id, "provider": "strava"})
    return {"authorization_url": strava.authorization_url(state)}


@app.get("/strava/oauth/callback")
def strava_oauth_callback(
    state: str | None = None,
    code: str | None = None,
    error: str | None = None,
) -> RedirectResponse:
    if error:
        return _frontend_redirect("strava", "error", f"Strava authorization failed: {error}")

    if not code:
        return _frontend_redirect("strava", "error", "Missing Strava authorization code.")

    from app.security import open_json

    if not state:
        return _frontend_redirect("strava", "error", "Invalid Strava authorization state.")

    try:
        data = open_json(state)
        user_id = data.get("user_id")
        if data.get("provider") != "strava" or not user_id:
            return _frontend_redirect("strava", "error", "Invalid Strava authorization state.")
    except Exception:
        return _frontend_redirect("strava", "error", "Invalid Strava authorization state.")

    try:
        token_payload = strava.exchange_code(code)
    except Exception:
        return _frontend_redirect("strava", "error", "Unable to exchange Strava authorization code.")

    if not isinstance(token_payload, dict):
        return _frontend_redirect("strava", "error", "Incomplete token response from Strava.")

    if not strava.has_required_scopes(token_payload):
        return _frontend_redirect(
            "strava",
            "error",
            "RideSense needs Strava activity read access to import cycling history.",
        )

    if not token_payload.get("access_token") or not token_payload.get("refresh_token"):
        return _frontend_redirect("strava", "error", "Incomplete token response from Strava.")

    athlete = token_payload.get("athlete") or {}
    scopes = ",".join(sorted(strava.accepted_scopes(token_payload)))
    try:
        repository.save_connection(
            user_id=user_id,
            provider="strava",
            encrypted_secret=seal_json(token_payload),
            external_athlete_id=str(athlete.get("id") or ""),
            scopes=scopes,
            expires_at=token_payload.get("expires_at"),
        )
    except Exception:
        logger.exception("Failed to persist Strava connection")
        return _frontend_redirect("strava", "error", "Unable to save Strava connection.")
    return _frontend_redirect("strava", "connected", "Strava connected.")


def _frontend_redirect(provider: str, status: str, message: str) -> RedirectResponse:
    query = urlencode({"provider": provider, "status": status, "message": message})
    return RedirectResponse(f"{settings.frontend_origin}/?{query}")


@app.post("/trainerroad/link/start")
def trainerroad_link_start(user_id: UserId) -> dict[str, str]:
    return trainerroad.link_session_placeholder()


@app.post("/uploads/activity")
async def upload_activity(user_id: UserId, file: UploadFile = File(...)) -> dict:
    if not file.filename:
        raise HTTPException(status_code=400, detail="filename is required")
    lower = file.filename.lower()
    if not any(lower.endswith(ext) for ext in SUPPORTED_EXTENSIONS):
        raise HTTPException(
            status_code=400,
            detail=f"unsupported file type; supported: {sorted(SUPPORTED_EXTENSIONS)}",
        )

    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"file exceeds {MAX_UPLOAD_BYTES} bytes")

    try:
        activity = await run_in_threadpool(parse_activity_file, file.filename, content)
    except UnsupportedFormatError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except (InvalidActivityFileError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"could not parse activity file: {exc}") from exc

    await run_in_threadpool(repository.upsert_provider_activity, user_id, activity)
    await run_in_threadpool(rebuild_canonical_activities, user_id)
    return {
        "status": "imported",
        "name": activity.name,
        "started_at": activity.started_at,
        "duration_seconds": activity.duration_seconds,
        "distance_meters": activity.distance_meters,
    }


@app.post("/sync-runs")
def create_sync_run(request: SyncRequest, user_id: UserId) -> dict:
    run_id = repository.create_sync_run(user_id, request.provider)
    try:
        counts = sync_provider(user_id, request.provider)
        repository.update_sync_run(
            run_id,
            "completed",
            f"Imported {counts['strava']} Strava and {counts['trainerroad']} TrainerRoad activities.",
        )
    except Exception as exc:
        repository.update_sync_run(run_id, "failed", str(exc))
    return repository.get_sync_run(user_id, run_id)


@app.get("/sync-runs")
def sync_runs(user_id: UserId) -> dict:
    return {"runs": repository.list_sync_runs(user_id)}


@app.get("/sync-runs/{run_id}")
def sync_run(run_id: int, user_id: UserId) -> dict:
    run = repository.get_sync_run(user_id, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="sync run not found")
    return run


@app.get("/athlete-profile")
def get_profile(user_id: UserId) -> AthleteProfile:
    return repository.get_profile(user_id)


@app.put("/athlete-profile")
def put_profile(profile: AthleteProfile, user_id: UserId) -> AthleteProfile:
    return repository.upsert_profile(user_id, profile)


@app.get("/activities")
def activities(
    user_id: UserId,
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> dict:
    return {"activities": repository.list_canonical_activities(user_id, limit=limit, offset=offset)}


@app.get("/dashboard")
def dashboard(user_id: UserId, weeks: int = Query(12, ge=2, le=52)) -> dict:
    activities = repository.list_canonical_activities(user_id, limit=5000)
    analysis = analyze_activities(activities, weeks=weeks)
    insights = generate_insights(analysis)
    return {
        "analysis": analysis,
        "insights": insights,
        "connections": repository.list_connections(user_id),
        "sync_runs": repository.list_sync_runs(user_id),
    }


@app.get("/insights")
def insights(user_id: UserId, weeks: int = Query(12, ge=2, le=52)) -> dict:
    analysis = analyze_activities(repository.list_canonical_activities(user_id, 5000), weeks=weeks)
    return {"insights": generate_insights(analysis), "analysis": analysis}


@app.post("/questions")
def questions(request: QuestionRequest, user_id: UserId, weeks: int = Query(12, ge=2, le=52)) -> dict:
    profile = repository.get_profile(user_id).model_dump()
    analysis = analyze_activities(repository.list_canonical_activities(user_id, 5000), weeks=weeks)
    insight_rows = generate_insights(analysis)
    answer = answer_question(request.question, profile, analysis, insight_rows)
    payload = answer.model_dump()
    repository.save_answer(user_id, request.question, payload)
    return payload
