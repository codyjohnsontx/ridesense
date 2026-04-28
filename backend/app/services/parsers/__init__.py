from __future__ import annotations

import hashlib
import os
from typing import Any, Callable

from app.schemas import ActivityIn

from .errors import InvalidActivityFileError, UnsupportedFormatError
from .fit import parse_fit
from .gpx import parse_gpx
from .tcx import parse_tcx


EXTENSION_TO_PARSER: dict[str, Callable[[bytes], dict[str, Any]]] = {
    ".gpx": parse_gpx,
    ".tcx": parse_tcx,
    ".fit": parse_fit,
}
SUPPORTED_EXTENSIONS = frozenset(EXTENSION_TO_PARSER)


__all__ = [
    "EXTENSION_TO_PARSER",
    "InvalidActivityFileError",
    "SUPPORTED_EXTENSIONS",
    "UnsupportedFormatError",
    "parse_activity_file",
]


def parse_activity_file(filename: str, content: bytes) -> ActivityIn:
    """Dispatch to the right parser by extension and produce an ActivityIn.

    The provider_activity_id is derived from the SHA-256 of the file content
    so re-uploading the same file is idempotent — repository.upsert will
    update the existing row rather than create a duplicate.
    """
    _, ext = os.path.splitext(filename.lower())
    parser = EXTENSION_TO_PARSER.get(ext)
    if parser is None:
        raise UnsupportedFormatError(
            f"Unsupported activity file format: {filename}. "
            f"Supported: {sorted(EXTENSION_TO_PARSER)}"
        )

    parsed = parser(content)
    digest = hashlib.sha256(content).hexdigest()

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
