from __future__ import annotations

import math
from datetime import datetime
from typing import Any
from xml.etree.ElementTree import ParseError

import defusedxml.ElementTree as ET
from defusedxml.common import DefusedXmlException

from .errors import InvalidActivityFileError


GPX_NS = {
    "g": "http://www.topografix.com/GPX/1/1",
    "g0": "http://www.topografix.com/GPX/1/0",
}


def _parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlmb / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(a))


def parse_gpx(content: bytes) -> dict[str, Any]:
    try:
        root = ET.fromstring(content)
    except (ParseError, DefusedXmlException) as exc:
        raise ValueError(f"Invalid GPX XML: {exc}") from exc

    ns_uri = root.tag.split("}")[0].lstrip("{") if "}" in root.tag else ""
    ns = {"g": ns_uri} if ns_uri else {}

    segments = root.findall(".//g:trk/g:trkseg", ns) if ns else root.findall(".//trkseg")
    if not segments:
        raise ValueError("GPX file has no track segments")

    times: list[datetime] = []
    distance = 0.0
    for seg in segments:
        seg_points = seg.findall("g:trkpt", ns) if ns else seg.findall("trkpt")
        seg_coords: list[tuple[float, float]] = []
        for pt in seg_points:
            time_el = pt.find("g:time", ns) if ns else pt.find("time")
            if time_el is not None and time_el.text:
                times.append(_parse_iso(time_el.text))
            try:
                seg_coords.append((float(pt.attrib["lat"]), float(pt.attrib["lon"])))
            except (KeyError, ValueError):
                continue
        # Sum haversine only within this segment so a paused-and-resumed
        # ride doesn't get a phantom hop between the last point of one
        # trkseg and the first point of the next.
        for (lat1, lon1), (lat2, lon2) in zip(seg_coords, seg_coords[1:]):
            distance += _haversine_meters(lat1, lon1, lat2, lon2)

    if not times:
        raise ValueError("GPX file has no timestamped track points")

    try:
        started_at = min(times)
        ended_at = max(times)
        duration = int((ended_at - started_at).total_seconds())
    except TypeError as exc:
        raise InvalidActivityFileError(
            "GPX file mixes naive and timezone-aware timestamps; ensure all "
            "<time> elements include a timezone offset (e.g. trailing Z)."
        ) from exc
    if duration <= 0:
        raise ValueError("GPX file duration is zero or negative")

    name_el = root.find(".//g:trk/g:name", ns) if ns else root.find(".//trk/name")
    name = name_el.text.strip() if name_el is not None and name_el.text else None

    return {
        "name": name,
        "sport_type": "Ride",
        "started_at": started_at.isoformat(),
        "duration_seconds": duration,
        "distance_meters": round(distance, 2) if distance > 0 else None,
    }
