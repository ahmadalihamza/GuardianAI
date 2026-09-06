"""ByteTrack integration wrapper for GuardianAI."""
from typing import Optional
import numpy as np

from backend.detector import detect_people


def track_people(frame: np.ndarray, confidence_threshold: float = 0.45) -> list[dict]:
    """Detect and track people in a frame.

    Returns list of tracked detections with track_id from ByteTrack.
    """
    return detect_people(frame, confidence_threshold)
