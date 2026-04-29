from __future__ import annotations

import logging
import time
from datetime import date, datetime, time as datetime_time, timedelta, timezone
from urllib.parse import urlencode, urlparse

from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from app import repository
from app.auth import UserId
from app.config import settings
from app.db import init_db
from app.providers import strava, trainerroad
from app.schemas import AthleteProfile, QuestionRequest, SyncRequest
from app.security import open_json, seal_json
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
OAUTH_STATE_TTL_SECONDS = 5 * 60


logger = logging.getLogger(__name__)

app = FastAPI(title="Training Insights API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin, "http://localhost:3000"],
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1):\d+$",
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
def strava_link_start(request: Request, user_id: UserId) -> dict[str, str]:
    if not settings.strava_client_id:
        raise HTTPException(status_code=400, detail="Strava client id is not configured")
    state = seal_json({
        "user_id": user_id,
        "provider": "strava",
        "issued_at": int(time.time()),
        "return_origin": _safe_return_origin(request.headers.get("origin") or request.headers.get("referer")),
    })
    return {"authorization_url": strava.authorization_url(state)}


@app.get("/strava/oauth/callback")
def strava_oauth_callback(
    state: str | None = None,
    code: str | None = None,
    error: str | None = None,
    scope: str | None = None,
) -> RedirectResponse:
    if error:
        return _frontend_redirect(
            "strava",
            "error",
            f"Strava authorization failed: {error}",
            _callback_return_origin(state),
        )

    if not code:
        return _frontend_redirect("strava", "error", "Missing Strava authorization code.")

    if not state:
        return _frontend_redirect("strava", "error", "Invalid Strava authorization state.")

    try:
        data = open_json(state)
        user_id = data.get("user_id")
        issued_at = data.get("issued_at")
        if data.get("provider") != "strava" or not user_id:
            return _frontend_redirect("strava", "error", "Invalid Strava authorization state.")
        if not isinstance(issued_at, int) or time.time() - issued_at > OAUTH_STATE_TTL_SECONDS:
            return _frontend_redirect(
                "strava",
                "error",
                "Strava link expired; please start the link flow again.",
            )
    except Exception:
        return _frontend_redirect("strava", "error", "Invalid Strava authorization state.")

    try:
        token_payload = strava.exchange_code(code)
    except Exception as exc:
        response = getattr(exc, "response", None)
        body = getattr(response, "text", "") if response is not None else ""
        logger.warning("Strava code exchange failed for user %s: %s %s", user_id, exc, body[:500])
        return _frontend_redirect(
            "strava",
            "error",
            "Unable to exchange Strava authorization code.",
            data.get("return_origin"),
        )

    if not isinstance(token_payload, dict):
        logger.warning("Strava token response was not a JSON object for user %s", user_id)
        return _frontend_redirect(
            "strava", "error", "Incomplete token response from Strava.", data.get("return_origin")
        )

    if scope and not token_payload.get("scope"):
        token_payload["scope"] = scope

    if not strava.has_required_scopes(token_payload):
        logger.warning(
            "Strava token response for user %s did not include required scopes. scopes=%s",
            user_id,
            strava.accepted_scopes(token_payload),
        )
        return _frontend_redirect(
            "strava",
            "error",
            "RideSense needs Strava activity read access to import cycling history.",
            data.get("return_origin"),
        )

    if not token_payload.get("access_token") or not token_payload.get("refresh_token"):
        logger.warning(
            "Strava token response for user %s missing token fields. has_access=%s has_refresh=%s",
            user_id,
            bool(token_payload.get("access_token")),
            bool(token_payload.get("refresh_token")),
        )
        return _frontend_redirect(
            "strava", "error", "Incomplete token response from Strava.", data.get("return_origin")
        )

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
        return _frontend_redirect(
            "strava", "error", "Unable to save Strava connection.", data.get("return_origin")
        )
    return _frontend_redirect("strava", "connected", "Strava connected.", data.get("return_origin"))


def _safe_return_origin(value: str | None) -> str | None:
    if not value:
        return None
    parsed = urlparse(value)
    if not parsed.scheme or not parsed.netloc:
        return None
    origin = f"{parsed.scheme}://{parsed.netloc}"
    if origin == settings.frontend_origin:
        return origin
    if parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1"} and parsed.port:
        return origin
    return None


def _callback_return_origin(state: str | None) -> str | None:
    if not state:
        return None
    try:
        data = open_json(state)
    except Exception:
        return None
    if data.get("provider") != "strava":
        return None
    return_origin = data.get("return_origin")
    return return_origin if isinstance(return_origin, str) else None


def _frontend_redirect(
    provider: str,
    status: str,
    message: str,
    return_origin: str | None = None,
) -> RedirectResponse:
    query = urlencode({"provider": provider, "status": status, "message": message})
    origin = _safe_return_origin(return_origin) or settings.frontend_origin
    return RedirectResponse(f"{origin}/?{query}")


def _utc_day_start(value: date) -> str:
    return datetime.combine(value, datetime_time.min, tzinfo=timezone.utc).isoformat()


def _utc_day_end(value: date) -> str:
    return datetime.combine(value, datetime_time.max, tzinfo=timezone.utc).isoformat()


def _range_options(
    weeks: int | None,
    all_time: bool,
    start_date: date | None,
    end_date: date | None,
) -> dict:
    if all_time:
        return {
            "mode": "all",
            "label": "All time",
            "weeks": None,
            "start_at": None,
            "end_at": None,
            "meta": {
                "mode": "all",
                "label": "All time",
                "start_date": None,
                "end_date": None,
            },
        }

    if start_date is not None or end_date is not None:
        if start_date is None or end_date is None:
            raise HTTPException(status_code=422, detail="start_date and end_date must be provided together")
        if start_date > end_date:
            raise HTTPException(status_code=422, detail="start_date must be on or before end_date")
        return {
            "mode": "custom",
            "label": f"{start_date.isoformat()} to {end_date.isoformat()}",
            "weeks": None,
            "start_at": _utc_day_start(start_date),
            "end_at": _utc_day_end(end_date),
            "meta": {
                "mode": "custom",
                "label": f"{start_date.isoformat()} to {end_date.isoformat()}",
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
            },
        }

    selected_weeks = weeks or 12
    range_end = datetime.now(timezone.utc)
    range_start = range_end - timedelta(weeks=selected_weeks)
    end_at = range_end.isoformat()
    start_at = range_start.isoformat()
    return {
        "mode": "preset",
        "label": f"Last {selected_weeks} weeks",
        "weeks": selected_weeks,
        "start_at": start_at,
        "end_at": end_at,
        "meta": {
            "mode": "preset",
            "label": f"Last {selected_weeks} weeks",
            "start_date": range_start.date().isoformat(),
            "end_date": range_end.date().isoformat(),
        },
    }


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
        connections = {row["provider"] for row in repository.list_connections(user_id)}
        counts = sync_provider(user_id, request.provider)
        missing = []
        if request.provider in {"strava", "all"} and "strava" not in connections:
            missing.append("Strava is not linked")
        if request.provider in {"trainerroad", "all"} and "trainerroad" not in connections:
            missing.append("TrainerRoad is not linked")
        suffix = f" ({'; '.join(missing)})." if missing else "."
        repository.update_sync_run(
            run_id,
            "completed",
            f"Imported {counts['strava']} Strava and {counts['trainerroad']} TrainerRoad activities{suffix}",
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
    weeks: int | None = Query(12, ge=2, le=104),
    all_time: bool = Query(False),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
) -> dict:
    selected_range = _range_options(weeks, all_time, start_date, end_date)
    return {
        "activities": repository.list_canonical_activities(
            user_id,
            limit=limit,
            offset=offset,
            start_at=selected_range["start_at"],
            end_at=selected_range["end_at"],
        ),
        "total_activities": repository.count_canonical_activities(user_id),
    }


@app.get("/dashboard")
def dashboard(
    user_id: UserId,
    weeks: int | None = Query(12, ge=2, le=104),
    all_time: bool = Query(False),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
) -> dict:
    selected_range = _range_options(weeks, all_time, start_date, end_date)
    total_activities = repository.count_canonical_activities(user_id)
    activities = repository.list_canonical_activities(
        user_id,
        limit=None,
        start_at=selected_range["start_at"],
        end_at=selected_range["end_at"],
    )
    analysis = analyze_activities(
        activities,
        weeks=selected_range["weeks"],
        total_activities=total_activities,
        range_meta=selected_range["meta"],
    )
    insights = generate_insights(analysis)
    return {
        "analysis": analysis,
        "insights": insights,
        "connections": repository.list_connections(user_id),
        "sync_runs": repository.list_sync_runs(user_id),
    }


@app.get("/insights")
def insights(
    user_id: UserId,
    weeks: int | None = Query(12, ge=2, le=104),
    all_time: bool = Query(False),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
) -> dict:
    selected_range = _range_options(weeks, all_time, start_date, end_date)
    analysis = analyze_activities(
        repository.list_canonical_activities(
            user_id,
            limit=None,
            start_at=selected_range["start_at"],
            end_at=selected_range["end_at"],
        ),
        weeks=selected_range["weeks"],
        total_activities=repository.count_canonical_activities(user_id),
        range_meta=selected_range["meta"],
    )
    return {"insights": generate_insights(analysis), "analysis": analysis}


@app.post("/questions")
def questions(
    request: QuestionRequest,
    user_id: UserId,
    weeks: int | None = Query(12, ge=2, le=104),
    all_time: bool = Query(False),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
) -> dict:
    selected_range = _range_options(weeks, all_time, start_date, end_date)
    profile = repository.get_profile(user_id).model_dump()
    analysis = analyze_activities(
        repository.list_canonical_activities(
            user_id,
            limit=None,
            start_at=selected_range["start_at"],
            end_at=selected_range["end_at"],
        ),
        weeks=selected_range["weeks"],
        total_activities=repository.count_canonical_activities(user_id),
        range_meta=selected_range["meta"],
    )
    insight_rows = generate_insights(analysis)
    answer = answer_question(request.question, profile, analysis, insight_rows)
    payload = answer.model_dump()
    repository.save_answer(user_id, request.question, payload)
    return payload
