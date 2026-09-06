"""Tests for the fire and smoke detector.

COCO has no fire or smoke class, so without a custom checkpoint this module is
classical CV: a chromatic gate, a temporal flicker measure, and persistence. The
tests therefore synthesise pixels rather than boxes, and the negative cases
matter most — a red jacket, a static red sign and a plain grey wall must all stay
quiet, because those are exactly what a colour gate gets wrong.

Skipped when OpenCV is unavailable; the module cannot be imported without it.
"""
import numpy as np
import pytest

cv2 = pytest.importorskip("cv2", reason="fire detection needs OpenCV")

from backend.config import FIRE_PERSISTENCE_FRAMES  # noqa: E402
from backend.fire_detector import (  # noqa: E402
    FireSmokeDetector,
    fire_mask,
    smoke_mask,
)

W, H = 320, 240


def blank(value: int = 40) -> np.ndarray:
    return np.full((H, W, 3), value, dtype=np.uint8)


def paint(frame: np.ndarray, box, bgr) -> np.ndarray:
    x1, y1, x2, y2 = box
    frame[y1:y2, x1:x2] = bgr
    return frame


def flame_frame(size: int, phase: int) -> np.ndarray:
    """A blob of flame-coloured pixels whose edges move frame to frame.

    Real flame is bright, orange-to-yellow (so R > G > B) and never holds still;
    the phase term is what produces a flicker score above the floor.
    """
    frame = blank()
    jitter = 6 if phase % 2 else -6
    x1, y1 = 100, 90
    paint(frame, (x1, y1, x1 + size + jitter, y1 + size), (25, 130, 245))
    # A hotter yellow-white core, as in a real flame.
    paint(frame, (x1 + 8, y1 + 8, x1 + size - 8, y1 + size - 8), (140, 215, 250))
    return frame


def run(frames: list[np.ndarray]) -> list[dict]:
    detector = FireSmokeDetector()
    detector.set_fps(30.0)
    events: list[dict] = []
    for frame_number, frame in enumerate(frames):
        events.extend(detector.process_frame(frame, frame_number))
    return events


def types(events: list[dict]) -> list[str]:
    return [e["event_type"] for e in events]


def test_fire_mask_selects_flame_colours():
    mask = fire_mask(flame_frame(70, 0))
    assert mask.shape == (H, W)
    assert mask.max() == 255
    assert 0 < int((mask > 0).sum()) < W * H


def test_fire_mask_rejects_dark_orange_pixels():
    """Brightness matters: flame is luminous, so a dim orange must not match."""
    frame = paint(blank(), (50, 50, 200, 200), (8, 45, 80))
    assert (fire_mask(frame) > 0).sum() == 0


def test_fire_mask_rejects_blue_dominant_pixels():
    """R > G > B is the discriminator; a blue-dominant blob must not match."""
    frame = paint(blank(), (50, 50, 200, 200), (250, 120, 30))  # BGR: blue-dominant
    assert (fire_mask(frame) > 0).sum() == 0


def test_flickering_flame_raises_one_incident():
    events = run([flame_frame(70, i) for i in range(FIRE_PERSISTENCE_FRAMES * 4)])
    fires = [e for e in events if e["event_type"] == "Fire Detected"]
    assert len(fires) == 1, types(events)
    fire = fires[0]
    assert fire["track_id"] == -1, "a fire region has no tracked subject"
    assert fire["bbox"] is not None
    assert fire["detection_method"] == "heuristic"
    assert 0.0 < fire["confidence"] <= 0.92
    assert "verify" in fire["explanation"].lower()


def test_a_static_red_sign_does_not_raise_fire():
    """No flicker means no fire, however orange the pixels are."""
    static = paint(blank(), (100, 90, 170, 160), (25, 130, 245))
    fires = [e for e in run([static.copy() for _ in range(60)])
             if e["event_type"] == "Fire Detected"]
    assert fires == []


def test_a_tiny_flame_coloured_speck_does_not_raise_fire():
    frames = [flame_frame(6, i) for i in range(60)]
    assert [e for e in run(frames) if e["event_type"] == "Fire Detected"] == []


def test_a_single_flame_frame_does_not_raise_fire():
    assert run([flame_frame(70, 0)]) == []


def test_an_empty_scene_raises_nothing():
    assert run([blank() for _ in range(60)]) == []


def test_malformed_frames_are_ignored():
    detector = FireSmokeDetector()
    detector.set_fps(30.0)
    assert detector.process_frame(None, 0) == []
    assert detector.process_frame(np.zeros((0, 0, 3), dtype=np.uint8), 1) == []
    assert detector.process_frame(np.zeros((H, W), dtype=np.uint8), 2) == []


def test_smoke_mask_needs_motion():
    """A grey wall that never changes is not smoke."""
    grey = np.full((H, W, 3), 150, dtype=np.uint8)
    previous = cv2.cvtColor(grey, cv2.COLOR_BGR2GRAY)
    assert (smoke_mask(grey, previous) > 0).sum() == 0


def test_smoke_mask_finds_a_drifting_grey_plume():
    first = paint(blank(), (60, 60, 200, 200), (150, 152, 150))
    second = paint(blank(), (80, 60, 220, 200), (150, 152, 150))
    previous = cv2.cvtColor(first, cv2.COLOR_BGR2GRAY)
    assert (smoke_mask(second, previous) > 0).sum() > 0


def test_reset_clears_streaks():
    detector = FireSmokeDetector()
    detector.set_fps(30.0)
    for i in range(FIRE_PERSISTENCE_FRAMES + 2):
        detector.process_frame(flame_frame(70, i), i)
    detector.reset()
    # After a reset the persistence requirement has to be met all over again.
    assert detector.process_frame(flame_frame(70, 0), 0) == []
