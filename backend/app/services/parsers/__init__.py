from __future__ import annotations

import hashlib

from app.schemas import ActivityIn

from .fit import parse_fit
from .gpx import parse_gpx
from .tcx import parse_tcx


SUPPORTED_EXTENSIONS = {".gpx", ".tcx", ".fit"}


class UnsupportedFormatError(ValueError):
    pass


class InvalidActivityFileError(ValueError):
    pass


def parse_activity_file(filename: str, content: bytes) -> ActivityIn:
    """Dispatch to the right parser by extension and produce an ActivityIn.

    The provider_activity_id is derived from the SHA-256 of the file content
    so re-uploading the same file is idempotent — repository.upsert will
    update the existing row rather than create a duplicate.
    """
    lower = filename.lower()
    digest = hashlib.sha256(content).hexdigest()[:16]

    if lower.endswith(".gpx"):
        parsed = parse_gpx(content)
    elif lower.endswith(".tcx"):
        parsed = parse_tcx(content)
    elif lower.endswith(".fit"):
        parsed = parse_fit(content)
    else:
        raise UnsupportedFormatError(
            f"Unsupported activity file format: {filename}. "
            f"Supported: {sorted(SUPPORTED_EXTENSIONS)}"
        )

    return ActivityIn(
        provider="upload",
        provider_activity_id=f"upload-{digest}",
        name=parsed.get("name") or filename.rsplit(".", 1)[0],
        sport_type=parsed.get("sport_type") or "Ride",
        started_at=parsed["started_at"],
        duration_seconds=int(parsed.get("duration_seconds") or 0),
        distance_meters=parsed.get("distance_meters"),
        normalized_power=parsed.get("normalized_power"),
        kilojoules=parsed.get("kilojoules"),
        external_url=None,
        raw_json={"source_filename": filename, "parsed": parsed},
    )
