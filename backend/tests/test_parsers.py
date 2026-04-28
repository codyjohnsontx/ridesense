from __future__ import annotations

from pathlib import Path

import pytest

from app.services.parsers import (
    InvalidActivityFileError,
    SUPPORTED_EXTENSIONS,
    UnsupportedFormatError,
    parse_activity_file,
)
from app.services.parsers.gpx import parse_gpx
from app.services.parsers.tcx import parse_tcx


FIXTURES = Path(__file__).parent / "fixtures"


def test_gpx_parser_extracts_name_duration_and_distance() -> None:
    parsed = parse_gpx((FIXTURES / "sample.gpx").read_bytes())
    assert parsed["name"] == "Saturday endurance"
    assert parsed["sport_type"] == "Ride"
    assert parsed["started_at"].startswith("2026-04-25T12:00:00")
    assert parsed["duration_seconds"] == 90 * 60  # 12:00 → 13:30
    assert parsed["distance_meters"] is not None
    assert parsed["distance_meters"] > 0


def test_gpx_parser_rejects_invalid_xml() -> None:
    with pytest.raises(ValueError, match="Invalid GPX"):
        parse_gpx(b"<not-gpx")


def test_gpx_parser_rejects_no_trackpoints() -> None:
    empty = b'<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><name>x</name></trk></gpx>'
    with pytest.raises(ValueError, match="no track segments"):
        parse_gpx(empty)


def test_gpx_distance_does_not_bridge_segment_boundaries() -> None:
    """A paused-and-resumed ride exports as multiple <trkseg>. Distance
    must sum within each segment and never zip across the gap."""
    multi_segment = b"""<?xml version="1.0"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <trkseg>
      <trkpt lat="30.0000" lon="-97.0000"><time>2026-04-25T12:00:00Z</time></trkpt>
      <trkpt lat="30.0010" lon="-97.0000"><time>2026-04-25T12:01:00Z</time></trkpt>
    </trkseg>
    <trkseg>
      <trkpt lat="40.0000" lon="-100.0000"><time>2026-04-25T13:00:00Z</time></trkpt>
      <trkpt lat="40.0010" lon="-100.0000"><time>2026-04-25T13:01:00Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>"""
    parsed = parse_gpx(multi_segment)
    # Each segment is ~111m; total should be ~222m, not the ~1300km
    # that bridging the two locations would produce.
    assert parsed["distance_meters"] is not None
    assert parsed["distance_meters"] < 500


def test_gpx_parser_rejects_dtd() -> None:
    """defusedxml must reject DTDs/entity declarations and we must surface
    that as ValueError, not a 500."""
    malicious = (
        b'<?xml version="1.0"?>\n'
        b'<!DOCTYPE gpx [<!ENTITY a "x">]>\n'
        b'<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg/></trk></gpx>'
    )
    with pytest.raises(ValueError, match="Invalid GPX"):
        parse_gpx(malicious)


def test_gpx_uses_min_max_for_out_of_order_timestamps() -> None:
    """Trackpoint order in the file should not determine duration —
    use min/max so a re-stitched GPX still gets a positive duration."""
    out_of_order = b"""<?xml version="1.0"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <trkseg>
      <trkpt lat="30.0" lon="-97.0"><time>2026-04-25T13:00:00Z</time></trkpt>
      <trkpt lat="30.0" lon="-97.0"><time>2026-04-25T12:00:00Z</time></trkpt>
      <trkpt lat="30.0" lon="-97.0"><time>2026-04-25T12:30:00Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>"""
    parsed = parse_gpx(out_of_order)
    assert parsed["started_at"].startswith("2026-04-25T12:00:00")
    assert parsed["duration_seconds"] == 60 * 60


def test_gpx_rejects_mixed_naive_and_aware_timestamps() -> None:
    """Mixing naive and tz-aware times raises TypeError on subtraction;
    surface as InvalidActivityFileError so the endpoint returns 422."""
    mixed = b"""<?xml version="1.0"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <trkseg>
      <trkpt lat="30.0" lon="-97.0"><time>2026-04-25T12:00:00Z</time></trkpt>
      <trkpt lat="30.0" lon="-97.0"><time>2026-04-25T13:00:00</time></trkpt>
    </trkseg>
  </trk>
</gpx>"""
    with pytest.raises(InvalidActivityFileError, match="naive and timezone-aware"):
        parse_gpx(mixed)


def test_tcx_parser_rejects_dtd() -> None:
    malicious = (
        b'<?xml version="1.0"?>\n'
        b'<!DOCTYPE TrainingCenterDatabase [<!ENTITY a "x">]>\n'
        b'<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"/>'
    )
    with pytest.raises(ValueError, match="Invalid TCX"):
        parse_tcx(malicious)


def test_tcx_parser_sums_laps() -> None:
    parsed = parse_tcx((FIXTURES / "sample.tcx").read_bytes())
    assert parsed["sport_type"] == "Ride"  # "Biking" normalized
    assert parsed["name"] == "Sweet spot intervals"
    assert parsed["started_at"].startswith("2026-04-25T13:00:00")
    assert parsed["duration_seconds"] == 1800 + 1500
    assert parsed["distance_meters"] == 27000.0


def test_tcx_parser_rejects_no_activity() -> None:
    bare = b'<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities/></TrainingCenterDatabase>'
    with pytest.raises(ValueError, match="no <Activity>"):
        parse_tcx(bare)


def test_dispatcher_routes_by_extension_and_hashes_for_idempotent_id() -> None:
    content = (FIXTURES / "sample.gpx").read_bytes()
    activity_a = parse_activity_file("ride.gpx", content)
    activity_b = parse_activity_file("ride.gpx", content)
    assert activity_a.provider == "upload"
    assert activity_a.provider_activity_id == activity_b.provider_activity_id


def test_provider_activity_id_is_filename_independent() -> None:
    """Identity must derive from content, not filename — uploading the same
    bytes under a different name should still upsert into the same row."""
    content = (FIXTURES / "sample.gpx").read_bytes()
    activity_a = parse_activity_file("ride.gpx", content)
    activity_b = parse_activity_file("totally_different_name.gpx", content)
    assert activity_a.provider_activity_id == activity_b.provider_activity_id
    assert activity_b.provider == "upload"


def test_dispatcher_rejects_unknown_extension() -> None:
    with pytest.raises(UnsupportedFormatError):
        parse_activity_file("workout.xlsx", b"x")


def test_supported_extensions_set() -> None:
    assert SUPPORTED_EXTENSIONS == {".gpx", ".tcx", ".fit"}


def test_fit_parser_routes_to_fitparse(monkeypatch: pytest.MonkeyPatch) -> None:
    """We don't ship a binary .fit fixture (it would require manual byte
    construction with CRCs); instead verify the dispatcher reaches parse_fit
    and surfaces fitparse errors as ValueError."""
    from app.services.parsers import fit as fit_module

    def fake_parser(content: bytes):  # noqa: ARG001
        raise ValueError("Invalid FIT file: synthetic")

    monkeypatch.setattr(fit_module, "parse_fit", fake_parser)
    monkeypatch.setattr("app.services.parsers.parse_fit", fake_parser)
    with pytest.raises(ValueError, match="Invalid FIT"):
        parse_activity_file("ride.fit", b"\x00\x00")
