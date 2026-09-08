"""The shipped results must remain reviewable without ever rerunning inference."""
import hashlib
import json
from pathlib import Path

from fastapi.testclient import TestClient

from backend import database, main, samples


def test_sample_assets_and_results_are_complete():
    manifest = json.loads(samples.MANIFEST_PATH.read_text(encoding="utf-8"))
    assert len(manifest) == 5
    ids = []
    for sample in manifest:
        source = samples.MANIFEST_PATH.parent / sample["filename"]
        assert hashlib.sha256(source.read_bytes()).hexdigest() == sample["source_sha256"]
        result = sample["result"]
        assert result["success"] and result["precomputed"]
        assert result["incidents_created"] == len(result["incidents"])
        paths = [sample["poster_url"], sample["video_url"], result["processed_video_path"]]
        for incident in result["incidents"]:
            ids.append(incident["id"])
            assert incident["id"] < 0
            assert incident["status"] == "Pending Verification"
            paths.append(incident["evidence_path"])
        for path in paths:
            assert path.startswith("/samples/")
            assert (samples.MANIFEST_PATH.parent / Path(path).name).stat().st_size > 0
    assert len(ids) == len(set(ids))


def test_seed_is_idempotent_and_preserves_reviews(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DATABASE_PATH", tmp_path / "test.db")
    monkeypatch.setattr(main, "load_model", lambda: None)
    def no_inference(**kwargs):
        raise AssertionError("Opening samples must not invoke the video pipeline")
    monkeypatch.setattr(main, "_perform_analysis", no_inference)
    with TestClient(main.app) as client:
        incidents = client.get("/api/incidents").json()
        assert incidents and all(row["id"] < 0 for row in incidents)
        target = incidents[0]
        response = client.post(f"/api/incidents/{target['id']}/review", json={
            "reviewer": "Sample test", "assessment": "Unverifiable",
            "notes": "Testing saved sample review", "status": "Pending Verification",
        })
        assert response.status_code == 200
        samples.seed_samples()
        assert len(client.get("/api/incidents").json()) == len(incidents)
        restored = client.get(f"/api/incidents/{target['id']}").json()
        assert restored["operator_assessment"] == "Unverifiable"
        assert len(restored["reviews"]) == 1
    # A process restart must retain the same IDs and audit history.
    with TestClient(main.app) as client:
        restored = client.get(f"/api/incidents/{target['id']}").json()
        assert len(restored["reviews"]) == 1
        # Negative sample IDs must not consume the ordinary upload namespace.
        record = {**target, "incident_code": "ORDINARY-UPLOAD"}
        assert database.insert_incident(record) > 0
