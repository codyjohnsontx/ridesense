from __future__ import annotations

import json
import logging
from typing import Any

import requests

from app.config import settings
from app.schemas import GroundedAnswer


logger = logging.getLogger(__name__)


def fallback_answer(question: str, analysis: dict[str, Any], insights: list[dict[str, str]]) -> GroundedAnswer:
    summary = analysis["summary"]
    verdict = analysis["verdict"]
    load_quality = analysis["load_quality"]
    answer = (
        f"Based on the selected training window, the current read is '{verdict['headline']}' "
        f"with an average weekly load of {summary['avg_weekly_load']} and a trend of {summary['trend_pct']}%. "
        f"Confidence is {load_quality['confidence']}."
    )
    return GroundedAnswer(
        answer=answer,
        evidence=[
            {
                "metric_id": "analysis.verdict.headline",
                "label": "Training-state verdict",
                "value": verdict["headline"],
            },
            {
                "metric_id": "summary.avg_weekly_load",
                "label": "Average weekly load",
                "value": str(summary["avg_weekly_load"]),
            },
            {
                "metric_id": "summary.trend_pct",
                "label": "Load trend",
                "value": f"{summary['trend_pct']}%",
            },
            {
                "metric_id": "analysis.load_quality.confidence",
                "label": "Load confidence",
                "value": load_quality["confidence"],
            },
        ],
        confidence=load_quality["confidence"],
        caveats=["This is decision support, not medical advice or a prescriptive coaching plan."],
        follow_up_questions=[
            "Which zone is driving most of my training stress?",
            "Am I progressing or regressing over the last 8 weeks?",
            "Does my training mix match my event goal?",
        ],
    )


def answer_question(
    question: str,
    profile: dict[str, Any],
    analysis: dict[str, Any],
    insights: list[dict[str, str]],
) -> GroundedAnswer:
    if not settings.openai_api_key:
        return fallback_answer(question, analysis, insights)

    schema = GroundedAnswer.model_json_schema()
    prompt = {
        "role": "user",
        "content": [
            {
                "type": "input_text",
                "text": (
                    "Answer the athlete question using only the provided facts. "
                    "Do not invent workouts, diagnoses, FTP changes, or medical advice.\n\n"
                    f"Question: {question}\n"
                    f"Athlete profile: {json.dumps(profile)}\n"
                    f"Analysis: {json.dumps(analysis)}\n"
                    f"Insights: {json.dumps(insights)}"
                ),
            }
        ],
    }
    try:
        response = requests.post(
            "https://api.openai.com/v1/responses",
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": settings.openai_model,
                "input": [prompt],
                "text": {
                    "format": {
                        "type": "json_schema",
                        "name": "grounded_training_answer",
                        "schema": schema,
                        "strict": True,
                    }
                },
            },
            timeout=45,
        )
        response.raise_for_status()
        payload = response.json()
        text = payload["output"][0]["content"][0]["text"]
        return GroundedAnswer.model_validate_json(text)
    except (requests.RequestException, KeyError, IndexError, ValueError, TypeError) as exc:
        logger.warning("Falling back to deterministic answer for question len=%s: %s", len(question), exc)
        return fallback_answer(question, analysis, insights)
