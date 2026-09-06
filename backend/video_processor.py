"""Video processing, multi-detector orchestration and annotation.

One YOLO inference per processed frame feeds every enabled feature.
`detector.detect_objects` returns people, vehicles and weapon proxies together
and each specialist reads only the slice it cares about:

* `EventDetector`     — restricted-zone intrusion and falls (people).
* `WeaponDetector`    — weapon proxies, associated with the nearest person.
* `AccidentDetector`  — vehicle kinematics and contacts.
* `FireSmokeDetector` — pixels rather than boxes, so it reads the raw frame.

The requested class union is narrowed to whatever the caller actually enabled.
That is both faster and more accurate: a class that is never requested cannot
produce a false positive. It also keeps ByteTrack IDs stable, because the class
list does not change between frames of a single video.
"""
import random
import shutil
import string
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Tuple

import cv2
import numpy as np

from backend import coco_classes
from backend.config import (
    MAX_FRAME_WIDTH,
    PROCESS_EVERY_N_FRAMES,
    PROCESSED_DIR,
    EVIDENCE_DIR,
)
from backend.event_detector import EventDetector
from backend.accident_detector import AccidentDetector
from backend.fire_detector import FireSmokeDetector
from backend.weapon_detector import WeaponDetector
from backend.detector import detect_objects, reset_tracker

#: How long an alert stays drawn on the annotated video. A box shown for the
#: single frame that raised it is invisible at playback speed, and the whole
#: point of the export is that a human can see why the incident was raised.
ALERT_OVERLAY_SECONDS = 2.0

# --- Overlay palette (BGR) -----------------------------------------------------
_COLOR_PERSON = (0, 200, 0)
_COLOR_VEHICLE = (255, 170, 0)
_COLOR_WEAPON = (255, 0, 200)
_COLOR_ALERT = (0, 0, 255)
_COLOR_FIRE = (0, 120, 255)
_COLOR_SMOKE = (165, 165, 165)

#: Event types drawn with the fire palette; everything else region-based uses
#: the smoke palette.
_FIRE_EVENTS = ("Fire Detected",)


def generate_incident_code() -> str:
    """Generate a unique incident code like INC-20260902-A3F7."""
    date_part = datetime.now(timezone.utc).strftime("%Y%m%d")
    rand_part = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"INC-{date_part}-{rand_part}"


def _convert_to_h264(input_path: str) -> str:
    """Convert video to H.264 / yuv420p using FFmpeg for HTML5 browser compatibility."""
    ffmpeg_bin = shutil.which("ffmpeg") or r"C:\msys64\ucrt64\bin\ffmpeg.exe"
    if not (shutil.which("ffmpeg") or Path(ffmpeg_bin).exists()):
        return input_path

    temp_output = str(Path(input_path).with_name(f"h264_{Path(input_path).name}"))
    cmd = [
        str(ffmpeg_bin),
        "-y",
        "-i", input_path,
        "-vcodec", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "fast",
        "-crf", "23",
        temp_output,
    ]
    try:
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if res.returncode == 0 and Path(temp_output).exists() and Path(temp_output).stat().st_size > 0:
            Path(input_path).unlink(missing_ok=True)
            Path(temp_output).rename(input_path)
            return input_path
    except Exception:
        if Path(temp_output).exists():
            Path(temp_output).unlink(missing_ok=True)
    return input_path


def _resize_frame(frame: np.ndarray) -> Tuple[np.ndarray, float]:
    """Resize frame to max width while preserving aspect ratio."""
    h, w = frame.shape[:2]
    if w <= MAX_FRAME_WIDTH:
        return frame.copy(), 1.0
    scale = MAX_FRAME_WIDTH / w
    new_w = MAX_FRAME_WIDTH
    new_h = int(h * scale)
    resized = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_AREA)
    return resized, scale


def _class_color(class_id: int) -> Tuple[int, int, int]:
    """Overlay colour for a detected COCO class."""
    if coco_classes.is_weapon_proxy(class_id):
        return _COLOR_WEAPON
    if coco_classes.is_vehicle(class_id):
        return _COLOR_VEHICLE
    return _COLOR_PERSON


def _draw_branding(frame: np.ndarray, frame_width: int):
    """Draw GuardianAI branding on frame."""
    cv2.putText(
        frame,
        "GuardianAI",
        (10, 30),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.9,
        (0, 150, 255),
        2,
        cv2.LINE_AA,
    )
    cv2.putText(
        frame,
        datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        (frame_width - 280, 30),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.5,
        (200, 200, 200),
        1,
        cv2.LINE_AA,
    )

def _draw_zone(
    frame: np.ndarray,
    zone_px: Tuple[float, float, float, float],
):
    """Draw restricted zone as transparent red rectangle."""
    overlay = frame.copy()
    zx1, zy1, zx2, zy2 = int(zone_px[0]), int(zone_px[1]), int(zone_px[2]), int(zone_px[3])
    cv2.rectangle(overlay, (zx1, zy1), (zx2, zy2), (0, 0, 255), -1)
    cv2.addWeighted(overlay, 0.25, frame, 0.75, 0, frame)
    cv2.rectangle(frame, (zx1, zy1), (zx2, zy2), (0, 0, 255), 2)
    cv2.putText(
        frame,
        "RESTRICTED ZONE",
        (zx1 + 5, zy1 + 20),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.5,
        (0, 0, 255),
        1,
        cv2.LINE_AA,
    )


def _draw_label_chip(
    frame: np.ndarray,
    x: int,
    y: int,
    text: str,
    color: Tuple[int, int, int],
    scale: float = 0.5,
):
    """Draw a filled label chip whose text is guaranteed to be on-screen.

    The chip normally sits above its box. When the box starts at the top of the
    frame there is no room, so it flips inside the box instead — otherwise the
    label for anything detected near the top edge is silently clipped away.
    """
    (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, scale, 1)
    top = y - th - 8
    baseline = y - 4
    if top < 0:
        top = y
        baseline = y + th + 4
    x = max(0, min(x, frame.shape[1] - tw - 6))
    cv2.rectangle(frame, (x, top), (x + tw + 6, top + th + 8), color, -1)
    cv2.putText(frame, text, (x + 3, baseline),
                cv2.FONT_HERSHEY_SIMPLEX, scale, (255, 255, 255), 1, cv2.LINE_AA)

def _draw_object_box(
    frame: np.ndarray,
    bbox: Tuple[int, int, int, int],
    label: str,
    color: Tuple[int, int, int],
    event_label: str = "",
    thickness: int = 2,
):
    """Draw one tracked object with its label chip and optional event caption."""
    x1, y1, x2, y2 = bbox
    cv2.rectangle(frame, (x1, y1), (x2, y2), color, thickness)
    _draw_label_chip(frame, x1, y1, label, color)
    if event_label:
        caption_y = min(y2 + 16, frame.shape[0] - 4)
        cv2.putText(frame, event_label, (x1, caption_y),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA)


def _draw_person_box(
    frame: np.ndarray,
    x1: int, y1: int, x2: int, y2: int,
    track_id: int,
    confidence: float,
    color: Tuple[int, int, int],
    event_label: str = "",
):
    """Draw a person bounding box with annotations."""
    _draw_object_box(
        frame,
        (x1, y1, x2, y2),
        f"ID:{track_id} {confidence:.0%}",
        color,
        event_label,
    )


def _draw_region_alert(frame: np.ndarray, event: dict):
    """Draw a region-based alert (fire or smoke) that has no tracked box."""
    bbox = event.get("bbox")
    if not bbox:
        return
    color = _COLOR_FIRE if event.get("event_type") in _FIRE_EVENTS else _COLOR_SMOKE
    x1, y1, x2, y2 = (int(v) for v in bbox)
    overlay = frame.copy()
    cv2.rectangle(overlay, (x1, y1), (x2, y2), color, -1)
    cv2.addWeighted(overlay, 0.20, frame, 0.80, 0, frame)
    label = f"{event.get('event_type', 'Region Alert')} {event.get('confidence', 0.0):.0%}"
    _draw_object_box(frame, (x1, y1, x2, y2), label, color, thickness=3)

def _draw_alert_banner(
    frame: np.ndarray,
    frame_width: int,
    frame_height: int,
    events: List[dict],
):
    """Draw the alert banner, led by the highest-risk active event."""
    if not events:
        return
    lead = max(events, key=lambda e: e.get("risk_score", 0))
    banner_text = (
        f"ALERT: {lead['event_type']} | Risk: {lead.get('risk_score', 0)}"
        f" | {lead.get('severity', 'Unknown')}"
    )
    if len(events) > 1:
        banner_text += f" | +{len(events) - 1} more"
    cv2.rectangle(frame, (0, frame_height - 40), (frame_width, frame_height), (0, 0, 180), -1)
    cv2.putText(frame, banner_text[:110], (10, frame_height - 15),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1, cv2.LINE_AA)


def _requested_classes(
    enable_intrusion: bool,
    enable_fall: bool,
    enable_weapon: bool,
    enable_accident: bool,
) -> Tuple[int, ...]:
    """COCO classes to request, given the enabled features.

    Weapon association needs people even when intrusion and falls are off, and
    accident detection needs people to tell a vehicle-pedestrian collision from
    a vehicle-vehicle one.
    """
    classes: set[int] = set()
    if enable_intrusion or enable_fall or enable_weapon or enable_accident:
        classes.add(coco_classes.PERSON)
    if enable_weapon:
        classes.update(coco_classes.WEAPON_PROXY_CLASSES)
    if enable_accident:
        classes.update(coco_classes.VEHICLE_CLASSES)
    return tuple(sorted(classes))

def process_video(
    video_path: str,
    zone_norm: Tuple[float, float, float, float],
    enable_intrusion: bool = True,
    enable_fall: bool = True,
    zone_sensitivity: float = 0.5,
    on_event_callback=None,
    enable_fire: bool = False,
    enable_weapon: bool = False,
    enable_accident: bool = False,
    progress_callback=None,
) -> dict:
    """Process a video file and return results dict.

    on_event_callback(event_dict, annotated_frame) is called for each detected
    event; a single-argument callback is also accepted. progress_callback gets
    (processed_frames, total_frames) after each output frame so an asynchronous
    API client can show real progress without keeping the upload request open.
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return {"success": False, "error": "Cannot open video file"}

    try:
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        orig_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        orig_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        ret, first_frame = cap.read()
        if not ret:
            return {"success": False, "error": "Cannot read first frame from video"}

        _, scale = _resize_frame(first_frame)
        out_w = int(orig_w * scale) if orig_w > MAX_FRAME_WIDTH else orig_w
        out_h = int(orig_h * scale) if orig_w > MAX_FRAME_WIDTH else orig_h

        timestamp_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        output_filename = f"processed_{timestamp_str}_{Path(video_path).stem}.mp4"
        output_path = str(PROCESSED_DIR / output_filename)

        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(output_path, fourcc, fps, (out_w, out_h))

        if not writer.isOpened():
            return {"success": False, "error": "Cannot create output video writer"}

        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)

        # Fresh tracker state per video, so IDs start at 1 and the "tracked"
        # counts below are not polluted by the previous upload.
        reset_tracker()
        requested_classes = _requested_classes(
            enable_intrusion, enable_fall, enable_weapon, enable_accident
        )

        event_detector = EventDetector()
        event_detector.set_fps(fps)
        weapon_detector = WeaponDetector() if enable_weapon else None
        accident_detector = AccidentDetector() if enable_accident else None
        fire_detector = FireSmokeDetector() if enable_fire else None
        for detector in (weapon_detector, accident_detector, fire_detector):
            if detector is not None:
                detector.set_fps(fps)

        zone_px = (
            zone_norm[0] * out_w,
            zone_norm[1] * out_h,
            zone_norm[2] * out_w,
            zone_norm[3] * out_h,
        )

        frame_idx = 0
        people_tracked_ids: set = set()
        vehicle_tracked_ids: set = set()
        events_in_frame: List[dict] = []
        detections: List[dict] = []
        #: (expiry_frame, event) pairs, so an alert stays on screen long enough
        #: to be seen at playback speed.
        active_alerts: List[Tuple[int, dict]] = []
        alert_hold_frames = max(int(fps * ALERT_OVERLAY_SECONDS), 1)

        if progress_callback:
            progress_callback(0, total_frames)

        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    break

                frame, _ = _resize_frame(frame)
                new_events_this_frame: List[dict] = []

                if frame_idx % PROCESS_EVERY_N_FRAMES == 0:
                    detections = (
                        detect_objects(frame, classes=requested_classes)
                        if requested_classes else []
                    )
                    for det in detections:
                        tid = int(det.get("track_id", -1))
                        if tid < 0:
                            continue
                        class_id = int(det.get("class_id", coco_classes.PERSON))
                        if class_id == coco_classes.PERSON:
                            people_tracked_ids.add(tid)
                        elif coco_classes.is_vehicle(class_id):
                            vehicle_tracked_ids.add(tid)

                    if detections and (enable_intrusion or enable_fall):
                        new_events_this_frame.extend(event_detector.process_frame(
                            detections=detections,
                            frame_number=frame_idx,
                            zone_norm=zone_norm,
                            frame_width=out_w,
                            frame_height=out_h,
                            zone_sensitivity=zone_sensitivity,
                            enable_intrusion=enable_intrusion,
                            enable_fall=enable_fall,
                        ))
                    if weapon_detector is not None:
                        new_events_this_frame.extend(
                            weapon_detector.process_frame(detections, frame_idx, frame)
                        )
                    if accident_detector is not None:
                        new_events_this_frame.extend(
                            accident_detector.process_frame(detections, frame_idx)
                        )
                    if fire_detector is not None:
                        # Region-based: it reads pixels, so it runs whether or
                        # not the object detector found anything.
                        new_events_this_frame.extend(
                            fire_detector.process_frame(frame, frame_idx)
                        )

                events_in_frame.extend(new_events_this_frame)

                for ev in new_events_this_frame:
                    active_alerts.append((frame_idx + alert_hold_frames, ev))
                active_alerts = [
                    (expiry, ev) for expiry, ev in active_alerts if expiry > frame_idx
                ]
                current_events = [ev for _, ev in active_alerts]

                alert_labels: Dict[int, str] = {}
                for ev in current_events:
                    tid = int(ev.get("track_id", -1))
                    if tid >= 0:
                        alert_labels.setdefault(tid, ev.get("event_type", ""))

                # Boxes are drawn on every frame from the most recent inference,
                # not only on inference frames, so the overlay does not strobe
                # when PROCESS_EVERY_N_FRAMES > 1.
                for det in detections:
                    x1, y1, x2, y2 = (int(v) for v in det["bbox"])
                    tid = int(det.get("track_id", -1))
                    class_id = int(det.get("class_id", coco_classes.PERSON))
                    event_label = alert_labels.get(tid, "")
                    color = _COLOR_ALERT if event_label else _class_color(class_id)
                    name = det.get("class_name") or coco_classes.class_name(class_id)
                    confidence = float(det.get("confidence", 0.0))
                    label = (
                        f"{name} #{tid} {confidence:.0%}" if tid >= 0
                        else f"{name} {confidence:.0%}"
                    )
                    _draw_object_box(frame, (x1, y1, x2, y2), label, color, event_label)

                for ev in current_events:
                    if int(ev.get("track_id", -1)) < 0:
                        _draw_region_alert(frame, ev)

                if enable_intrusion:
                    _draw_zone(frame, zone_px)
                _draw_branding(frame, out_w)
                _draw_alert_banner(frame, out_w, out_h, current_events)

                # Capture evidence frames for newly triggered events on this annotated frame
                for ev in new_events_this_frame:
                    if on_event_callback:
                        try:
                            on_event_callback(ev, frame)
                        except TypeError:
                            on_event_callback(ev)
                    incident_code = ev.get("incident_code") or generate_incident_code()
                    ev["incident_code"] = incident_code
                    if not ev.get("evidence_path"):
                        ev["evidence_path"] = save_evidence_frame(frame, incident_code)

                writer.write(frame)
                frame_idx += 1
                if progress_callback:
                    progress_callback(frame_idx, total_frames)
        finally:
            writer.release()

        # Convert to browser-friendly H.264 if ffmpeg is available
        final_output_path = _convert_to_h264(output_path)

        return {
            "success": True,
            "total_frames": total_frames,
            "processed_frames": frame_idx,
            "people_tracked": len(people_tracked_ids),
            "vehicles_tracked": len(vehicle_tracked_ids),
            "output_path": final_output_path,
            "events": events_in_frame,
            "fps": fps,
            "output_width": out_w,
            "output_height": out_h,
            "features": {
                "intrusion": enable_intrusion,
                "fall": enable_fall,
                "fire": enable_fire,
                "weapon": enable_weapon,
                "accident": enable_accident,
            },
            # Surfaced so the UI can say whether a capability ran on a purpose
            # trained checkpoint or on the heuristic fallback.
            "custom_models": {
                "fire": bool(fire_detector is not None and fire_detector.uses_custom_model),
                "weapon": bool(weapon_detector is not None and weapon_detector.uses_custom_model),
            },
        }
    finally:
        cap.release()


def save_evidence_frame(frame: np.ndarray, incident_code: str) -> str:
    """Save an annotated frame as evidence JPEG."""
    filename = f"evidence_{incident_code}.jpg"
    path = str(EVIDENCE_DIR / filename)
    cv2.imwrite(path, frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return path





