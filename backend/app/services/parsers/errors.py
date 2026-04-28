from __future__ import annotations


class UnsupportedFormatError(ValueError):
    """Raised when an upload's extension is not in SUPPORTED_EXTENSIONS."""


class InvalidActivityFileError(ValueError):
    """Raised when a parser detects a domain-level problem with the file
    (mixed timezones, impossible durations, etc.) that should surface as
    a 422 to the client rather than a 500."""
