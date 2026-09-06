"""Tests for the weapon detector.

These cover the two things that decide whether an operator trusts a weapon
alert: the COCO proxy classes are ranked by how weapon-like they actually are,
and a weapon is only called "Armed Person" when it can be associated with
somebody. Negative cases (single-frame flicker, low confidence) matter as much
as the positive ones — they are what keeps the incident queue usable.
"""
import pytest

from backend import coco_classes
from backend.weapon_detector import WeaponDetector, gap_ratio


def person(track_id: int, bbox, conf: float = 0.90) -> dict:
    return {
        "track_id": track_id,
        "bbox": bbox,
        "confidence": conf,
        "class_id": coco_classes.PERSON,
        "class_name": "person",
    }


def weapon(track_id: int, bbox, conf: float = 0.60,
           class_id: int = coco_classes.KNIFE) -> dict:
    return {
        "track_id": track_id,
        "bbox": bbox,
        "confidence": conf,
        "class_id": class_id,
        "class_name": coco_classes.class_name(class_id),
    }


def run(frames: list[list[dict]], fps: float = 30.0) -> list[dict]:
    detector = WeaponDetector()
    detector.set_fps(fps)
    events: list[dict] = []
    for frame_number, detections in enumerate(frames):
        events.extend(detector.process_frame(detections, frame_number))
    return events


#: A person standing in the middle of the frame, and a knife inside their box.
HELD = [person(1, (200, 100, 280, 340)), weapon(9, (238, 200, 262, 214))]
#: The same knife, far enough away that nobody can be holding it.
DROPPED = [person(1, (200, 100, 280, 340)), weapon(9, (520, 420, 544, 434))]


def test_gap_ratio_is_zero_inside_the_person_box():
    assert gap_ratio((238, 200, 262, 214), (200, 100, 280, 340)) == 0.0


def test_gap_ratio_scales_with_person_width():
    """The same pixel gap is a smaller ratio for a larger (nearer) person."""
    narrow = gap_ratio((300, 200, 320, 214), (200, 100, 240, 340))
    wide = gap_ratio((300, 200, 320, 214), (100, 100, 240, 340))
    assert narrow > wide > 0.0


def test_armed_person_is_attributed_to_the_holder():
    events = run([HELD] * 12)
    armed = [e for e in events if e["event_type"] == "Armed Person"]
    assert len(armed) == 1
    assert armed[0]["track_id"] == 1
    assert armed[0]["detection_method"] == "coco"
    assert armed[0]["weapon_class"] == "knife"
    assert armed[0]["bbox"] is not None


def test_unattended_weapon_is_reported_but_ranked_lower():
    dropped = [e for e in run([DROPPED] * 12) if "Weapon" in e["event_type"]]
    held = [e for e in run([HELD] * 12) if e["event_type"] == "Armed Person"]
    assert len(dropped) == 1 and len(held) == 1
    assert dropped[0]["event_type"] == "Weapon Detected"
    assert dropped[0]["track_id"] == -1, "nobody should be blamed for a dropped knife"
    assert dropped[0]["risk_score"] < held[0]["risk_score"]


def test_scissors_rank_below_a_knife_on_identical_geometry():
    def armed_with(class_id):
        frames = [[
            person(1, (200, 100, 280, 340)),
            weapon(9, (238, 200, 262, 214), class_id=class_id),
        ]] * 12
        hits = [e for e in run(frames) if e["event_type"] == "Armed Person"]
        assert len(hits) == 1
        return hits[0]

    knife = armed_with(coco_classes.KNIFE)
    scissors = armed_with(coco_classes.SCISSORS)
    bat = armed_with(coco_classes.BASEBALL_BAT)
    assert scissors["seriousness"] < bat["seriousness"] < knife["seriousness"]
    assert scissors["risk_score"] < knife["risk_score"]


def test_single_frame_detection_is_ignored():
    assert run([HELD]) == []


def test_low_confidence_detection_is_ignored():
    frames = [[
        person(1, (200, 100, 280, 340)),
        weapon(9, (238, 200, 262, 214), conf=0.20),
    ]] * 20
    assert run(frames) == []


def test_picking_a_weapon_up_escalates_the_event_type():
    """A knife on the floor is a different incident from a knife in a hand."""
    events = run([DROPPED] * 10 + [HELD] * 20)
    types = [e["event_type"] for e in events]
    assert types == ["Weapon Detected", "Armed Person"], types
    assert events[0]["frame"] < events[1]["frame"]
    assert events[1]["track_id"] == 1


def test_no_duplicate_incident_while_the_weapon_stays_in_view():
    events = run([HELD] * 240)
    armed = [e for e in events if e["event_type"] == "Armed Person"]
    assert len(armed) == 1, f"expected one incident, got {len(armed)}"


def test_untracked_weapon_still_reports():
    """YOLO sometimes returns a box with no track ID; it must not be dropped."""
    frames = [[
        person(1, (200, 100, 280, 340)),
        weapon(-1, (238, 200, 262, 214)),
    ]] * 12
    assert [e["event_type"] for e in run(frames)] == ["Armed Person"]


def test_people_alone_raise_nothing():
    assert run([[person(1, (200, 100, 280, 340))]] * 30) == []
