"""GuardianAI Demo Video Generator.

Generates realistic synthetic surveillance footage using local OpenCV assets
to demonstrate restricted-zone intrusion and potential-fall events.
"""
import os
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import cv2
import numpy as np
import ultralytics

from backend.config import BASE_DIR
from backend.video_processor import _convert_to_h264


def generate_surveillance_demo(output_path: str = None) -> str:
    """Generate a sample surveillance MP4 video for demo testing."""
    if output_path is None:
        demo_dir = BASE_DIR / "demo"
        demo_dir.mkdir(parents=True, exist_ok=True)
        output_path = str(demo_dir / "sample_surveillance.mp4")

    raw_output = str(Path(output_path).with_name(f"raw_{Path(output_path).name}"))

    # Locate local ultralytics assets
    asset_dir = Path(ultralytics.__file__).parent / "assets"
    bus_path = asset_dir / "bus.jpg"
    zidane_path = asset_dir / "zidane.jpg"

    source_path = bus_path if bus_path.exists() else zidane_path
    if not source_path.exists():
        print(f"Error: Asset not found at {source_path}", file=sys.stderr)
        return ""

    src_img = cv2.imread(str(source_path))
    sh, sw = src_img.shape[:2]

    # Crop a clear human figure
    if source_path == bus_path:
        # Person 3 in bus.jpg
        person = src_img[394:876, 670:810]
    else:
        # Person in zidane.jpg
        person = src_img[150:700, 100:450]

    person = cv2.resize(person, (110, 250))
    ph, pw = person.shape[:2]

    width, height = 640, 480
    fps = 20.0
    total_frames = 100  # 5 seconds

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(raw_output, fourcc, fps, (width, height))

    # Neutral surveillance background
    bg = cv2.resize(src_img, (width, height))
    bg = cv2.GaussianBlur(bg, (5, 5), 0)
    bg = (bg * 0.55).astype(np.uint8)

    # Floor / perspective guide
    cv2.line(bg, (0, 360), (width, 360), (70, 70, 70), 2)

    for i in range(total_frames):
        frame = bg.copy()

        # Person enters from x=100 and walks into restricted zone (x=380 to 580)
        if i < 30:
            px = int(100 + (i / 30.0) * 300)
            py = 200
        else:
            # Stays inside restricted zone for 70 frames (> 3.5 seconds)
            px = 400 + int(10 * np.sin(i * 0.2))
            py = 200

        # Paste person
        frame[py:py + ph, px:px + pw] = person

        writer.write(frame)

    writer.release()

    # Transcode to H.264
    _convert_to_h264(raw_output)
    if os.path.exists(raw_output):
        if os.path.exists(output_path):
            os.remove(output_path)
        os.rename(raw_output, output_path)

    print(f"Generated demo video at {output_path} ({os.path.getsize(output_path)} bytes)")
    return output_path


if __name__ == "__main__":
    generate_surveillance_demo()
