from __future__ import annotations

from datetime import datetime
from typing import Any
from xml.etree import ElementTree as ET


def _parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _findtext(element: ET.Element, path: str, ns: dict[str, str]) -> str | None:
    found = element.find(path, ns)
    return found.text.strip() if found is not None and found.text else None


def parse_tcx(content: bytes) -> dict[str, Any]:
    try:
        root = ET.fromstring(content)
    except ET.ParseError as exc:
        raise ValueError(f"Invalid TCX XML: {exc}") from exc

    ns_uri = root.tag.split("}")[0].lstrip("{") if "}" in root.tag else ""
    ns = {"t": ns_uri} if ns_uri else {}
    activity_path = ".//t:Activities/t:Activity" if ns else ".//Activities/Activity"

    activity = root.find(activity_path, ns) if ns else root.find(activity_path)
    if activity is None:
        raise ValueError("TCX file has no <Activity>")

    sport = activity.attrib.get("Sport") or "Ride"
    if sport.lower() == "biking":
        sport = "Ride"

    laps = activity.findall("t:Lap", ns) if ns else activity.findall("Lap")
    if not laps:
        raise ValueError("TCX file has no <Lap> elements")

    started_at_str = laps[0].attrib.get("StartTime")
    if not started_at_str:
        raise ValueError("TCX file <Lap> is missing StartTime")
    started_at = _parse_iso(started_at_str)

    total_seconds = 0.0
    total_meters = 0.0
    for lap in laps:
        secs = _findtext(lap, "t:TotalTimeSeconds" if ns else "TotalTimeSeconds", ns)
        meters = _findtext(lap, "t:DistanceMeters" if ns else "DistanceMeters", ns)
        if secs:
            total_seconds += float(secs)
        if meters:
            total_meters += float(meters)

    duration = int(round(total_seconds))
    if duration <= 0:
        raise ValueError("TCX file duration is zero or negative")

    name = _findtext(activity, "t:Notes" if ns else "Notes", ns)

    return {
        "name": name,
        "sport_type": sport,
        "started_at": started_at.isoformat(),
        "duration_seconds": duration,
        "distance_meters": round(total_meters, 2) if total_meters > 0 else None,
    }
