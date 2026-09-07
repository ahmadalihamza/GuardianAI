"""Runtime constraints for the shared YOLO detector."""
from types import SimpleNamespace

import numpy as np

from backend import detector


class _FakeModel:
    def __init__(self):
        self.kwargs = None
        self.predictor = object()

    def track(self, **kwargs):
        self.kwargs = kwargs
        return [SimpleNamespace(boxes=None, names={})]


def test_detection_uses_bounded_inference_shape(monkeypatch):
    model = _FakeModel()
    monkeypatch.setattr(detector, "_model", model)

    assert detector.detect_objects(
        np.zeros((480, 640, 3), dtype=np.uint8), classes=[0]
    ) == []
    assert model.kwargs["imgsz"] == detector.YOLO_IMAGE_SIZE
    assert model.kwargs["max_det"] == detector.YOLO_MAX_DETECTIONS


def test_release_inference_buffers_keeps_weights(monkeypatch):
    model = _FakeModel()
    monkeypatch.setattr(detector, "_model", model)
    collected = []
    monkeypatch.setattr(detector.gc, "collect", lambda: collected.append(True))

    detector.release_inference_buffers()

    assert model.predictor is None
    assert detector._model is model
    assert collected == [True]
