"""API regression tests for hosted, asynchronous video analysis."""
import time

from fastapi.testclient import TestClient

from backend import main
from backend.schemas import AnalyzeResponse


def _successful_result() -> AnalyzeResponse:
    return AnalyzeResponse(
        success=True,
        message="Analysis complete. 0 incident(s) detected.",
        processed_video_path="processed/test.mp4",
        processed_video_url="/processed/test.mp4",
        people_tracked=0,
        vehicles_tracked=0,
        incidents_created=0,
        incidents=[],
        processing_duration_seconds=0.01,
    )


def test_analysis_job_returns_immediately_and_can_be_polled(monkeypatch):
    monkeypatch.setattr(main, "load_model", lambda: None)

    def fake_analysis(*, progress_callback, **_kwargs):
        progress_callback(1, 2)
        progress_callback(2, 2)
        return _successful_result()

    monkeypatch.setattr(main, "_perform_analysis", fake_analysis)
    with main._jobs_lock:
        main._analysis_jobs.clear()

    with TestClient(main.app) as client:
        response = client.post(
            "/api/analyze/jobs",
            files={"video": ("tiny.mp4", b"not-a-real-video", "video/mp4")},
        )
        assert response.status_code == 202
        accepted = response.json()
        assert accepted["status"] == "queued"
        assert len(accepted["job_id"]) == 32

        status = None
        for _ in range(100):
            status = client.get(f"/api/analyze/jobs/{accepted['job_id']}")
            assert status.status_code == 200
            if status.json()["status"] == "succeeded":
                break
            time.sleep(0.01)

        assert status is not None
        payload = status.json()
        assert payload["status"] == "succeeded"
        assert payload["progress"] == 100
        assert payload["result"]["success"] is True
        assert payload["result"]["incidents_created"] == 0


def test_analysis_job_rejects_oversized_upload(monkeypatch):
    monkeypatch.setattr(main, "load_model", lambda: None)
    monkeypatch.setattr(main, "MAX_UPLOAD_BYTES", 3)

    with TestClient(main.app) as client:
        response = client.post(
            "/api/analyze/jobs",
            files={"video": ("too-big.mp4", b"four", "video/mp4")},
        )

    assert response.status_code == 413
    assert "too large" in response.json()["detail"].lower()


def test_missing_job_explains_backend_restart(monkeypatch):
    monkeypatch.setattr(main, "load_model", lambda: None)
    with main._jobs_lock:
        main._analysis_jobs.clear()

    with TestClient(main.app) as client:
        response = client.get(f"/api/analyze/jobs/{'a' * 32}")

    assert response.status_code == 404
    assert "restarted" in response.json()["detail"].lower()


def test_analysis_job_rejects_when_queue_is_full(monkeypatch):
    monkeypatch.setattr(main, "load_model", lambda: None)
    now = main._utc_now()
    with main._jobs_lock:
        main._analysis_jobs.clear()
        for index in range(main.MAX_PENDING_ANALYSIS_JOBS):
            main._analysis_jobs[f"{index:032x}"] = {
                "job_id": f"{index:032x}",
                "status": "queued",
                "updated_at": now,
                "updated_at_epoch": time.time(),
            }

    with TestClient(main.app) as client:
        response = client.post(
            "/api/analyze/jobs",
            files={"video": ("tiny.mp4", b"video", "video/mp4")},
        )

    assert response.status_code == 429
    assert "queue is full" in response.json()["detail"].lower()

    with main._jobs_lock:
        main._analysis_jobs.clear()
