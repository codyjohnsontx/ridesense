from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


Provider = Literal["strava", "trainerroad", "all"]
ActivityProvider = Literal["strava", "trainerroad", "upload"]


class AthleteProfile(BaseModel):
    event_type: str = ""
    goals: str = ""
    constraints: str = ""
    recovery_notes: str = ""
    training_days: str = ""


class SyncRun(BaseModel):
    id: int
    provider: str
    status: str
    message: str


class SyncRequest(BaseModel):
    provider: Provider = "all"


class QuestionRequest(BaseModel):
    question: str = Field(min_length=3, max_length=800)


class EvidencePoint(BaseModel):
    metric_id: str
    label: str
    value: str


class GroundedAnswer(BaseModel):
    answer: str
    evidence: list[EvidencePoint]
    confidence: Literal["low", "medium", "high"]
    caveats: list[str]
    follow_up_questions: list[str]


class ActivityIn(BaseModel):
    provider: ActivityProvider
    provider_activity_id: str
    name: str
    sport_type: str
    started_at: str
    duration_seconds: int = 0
    distance_meters: float | None = None
    tss: float | None = None
    estimated_load: float | None = None
    intensity_factor: float | None = None
    normalized_power: float | None = None
    kilojoules: float | None = None
    workout_category: str | None = None
    external_url: str | None = None
    raw_json: dict[str, Any] = Field(default_factory=dict)
