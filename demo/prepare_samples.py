"""Run the real pipeline once and export portable, reviewable sample results.

Usage: python -m demo.prepare_samples --source-dir /path/to/clips
Requires imageio-ffmpeg for browser-compatible H.264 output.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

os.environ.setdefault("TORCH_NUM_THREADS", "2")
os.environ.setdefault("PROCESS_EVERY_N_FRAMES", "2")
os.environ.setdefault("YOLO_IMAGE_SIZE", "640")
os.environ.setdefault("DATABASE_PATH", "data/sample-build.db")

import cv2
import imageio_ffmpeg

from backend import database
from backend.config import BASE_DIR
from backend.main import _perform_analysis

SAMPLES = [
    ("traffic", "Traffic accident", "traffic_accident_detection_10s.mp4", "accident", "Road junction"),
    ("fire", "Fire & smoke", "fire_smoke_detection_10s.mp4", "fire", "Fire monitoring"),
    ("weapon", "Knife detection", "weapon_detection_knife_10s.mp4", "weapon", "Object inspection"),
    ("fall", "Fall detection", "fall_detection_10s.mp4", "fall", "Indoor safety"),
    ("intrusion", "Restricted zone", "restricted_zone_intrusion_10s.mp4", "intrusion", "Warehouse perimeter"),
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", required=True, type=Path)
    args = parser.parse_args()
    destination = BASE_DIR / "frontend/public/samples"
    destination.mkdir(parents=True, exist_ok=True)
    database.init_database()
    samples = []
    for sample_index, (key, title, filename, feature, location) in enumerate(SAMPLES, 1):
        source = args.source_dir / filename
        shutil.copyfile(source, destination / filename)
        print(f"Analyzing {title}...", flush=True)
        result = _perform_analysis(
            raw_name=filename, upload_path=str(source), camera_name=f"Sample Camera {sample_index:02}",
            location=location, zone_norm=(0.35, 0.3, 0.9, 0.9), zone_sensitivity=0.5,
            enable_intrusion=feature == "intrusion", enable_fall_detection=feature == "fall",
            enable_fire_detection=feature == "fire", enable_weapon_detection=feature == "weapon",
            enable_accident_detection=feature == "accident",
        ).model_dump(mode="json")
        processed_name = f"{key}_processed.mp4"
        subprocess.run([
            imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-i", result["processed_video_path"],
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
            "-preset", "fast", "-crf", "23", str(destination / processed_name),
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        result["processed_video_path"] = f"/samples/{processed_name}"
        result["processed_video_url"] = result["processed_video_path"]
        incidents = []
        for index, inc in enumerate(result["incidents"], 1):
            row = database.get_incident(inc["id"])
            # Negative IDs reserve a stable namespace without affecting the
            # AUTOINCREMENT IDs used by ordinary uploaded-video incidents.
            row["id"] = -(sample_index * 1000 + index)
            row["incident_code"] = f"SAMPLE-{key.upper()}-{index:03}"
            evidence_name = f"{key}_evidence_{index:03}.jpg"
            shutil.copyfile(row["evidence_path"], destination / evidence_name)
            row["evidence_path"] = f"/samples/{evidence_name}"
            row["processed_video_path"] = result["processed_video_path"]
            incidents.append(row)
        result["incidents"] = incidents
        result["precomputed"] = True
        cap = cv2.VideoCapture(str(source))
        cap.set(cv2.CAP_PROP_POS_MSEC, 4000)
        ok, frame = cap.read()
        cap.release()
        if not ok:
            raise RuntimeError(f"Cannot create preview for {source}")
        cv2.imwrite(str(destination / f"{key}_poster.jpg"), frame)
        samples.append({
            "id": key, "title": title, "filename": filename, "duration_seconds": 10,
            "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "video_url": f"/samples/{filename}", "poster_url": f"/samples/{key}_poster.jpg",
            "result": result,
        })
        print(f"Saved {title}: {len(incidents)} actual pipeline alerts", flush=True)
    (destination / "manifest.json").write_text(json.dumps(samples, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
