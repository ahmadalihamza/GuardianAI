"""Tests for the offline incident report template.

The template is what an operator reads when no summarisation API key is set, so
it has to stay grammatical, has to cover every event type the risk engine knows
about, and must never invent a subject for an event that has none.
"""
import pytest

from backend.report_generator import (
    _EVENT_DESCRIPTIONS,
    _format_timestamp,
    generate_template_summary,
)
from backend.risk_engine import EVENT_SERIOUSNESS


def summary(event_type: str, track_id: int = 3, severity: str = "Medium",
            timestamp: float = 12.0) -> str:
    return generate_template_summary(
        event_type=event_type,
        timestamp=timestamp,
        track_id=track_id,
        camera_name="Cam 03",
        location="Loading Bay",
        risk_score=64,
        severity=severity,
        explanation="Detector detail.",
    )


@pytest.mark.parametrize("seconds,expected", [
    (0, "00:00:00"),
    (12, "00:00:12"),
    (75, "00:01:15"),
    (3725, "01:02:05"),
    (-4, "00:00:00"),
])
def test_timestamp_formatting(seconds, expected):
    assert _format_timestamp(seconds) == expected


def test_every_known_event_type_has_report_copy():
    missing = set(EVENT_SERIOUSNESS) - set(_EVENT_DESCRIPTIONS)
    assert not missing, f"event types with no report template: {sorted(missing)}"


@pytest.mark.parametrize("event_type", sorted(EVENT_SERIOUSNESS))
def test_summaries_are_well_formed(event_type):
    text = summary(event_type)
    assert text.startswith("At 00:00:12, GuardianAI detected ")
    assert "at Cam 03 (Loading Bay)." in text
    assert "  " not in text
    assert "{subject}" not in text
    assert "human verification is recommended" in text.lower()
    assert text.endswith(".")


@pytest.mark.parametrize("event_type", ["Fire Detected", "Smoke Detected",
                                       "Vehicle Collision", "Vehicle Overturn"])
def test_region_and_vehicle_events_never_name_a_person(event_type):
    """These carry track_id -1; "Person #-1" would be nonsense in a report."""
    text = summary(event_type, track_id=-1)
    assert "Person #" not in text
    assert "-1" not in text


def test_person_events_name_the_track():
    assert "Person #7" in summary("Potential Fall", track_id=7)


def test_critical_event_always_asks_for_immediate_verification():
    text = summary("Vehicle-Pedestrian Collision", track_id=-1, severity="Low")
    assert "Immediate human verification is recommended." in text


def test_low_severity_routine_event_is_not_urgent():
    text = summary("Sudden Vehicle Stop", track_id=-1, severity="Low")
    assert "Immediate" not in text
    assert "Human verification is recommended" in text


def test_unknown_event_type_stays_generic():
    text = summary("Loitering", track_id=7)
    assert "an anomalous event involving Person #7" in text


def test_unknown_intrusion_variant_falls_back_to_intrusion_copy():
    assert "restricted-zone intrusion" in summary("Perimeter Intrusion", track_id=2)
