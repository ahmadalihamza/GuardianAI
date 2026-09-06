"""Utility functions for GuardianAI."""
import os
from pathlib import Path


def ensure_directories():
    """Ensure all required directories exist."""
    from backend.config import UPLOAD_DIR, PROCESSED_DIR, EVIDENCE_DIR, MODELS_DIR
    for d in [UPLOAD_DIR, PROCESSED_DIR, EVIDENCE_DIR, MODELS_DIR]:
        d.mkdir(parents=True, exist_ok=True)


def get_file_size_mb(path: str) -> float:
    """Get file size in MB."""
    try:
        return os.path.getsize(path) / (1024 * 1024)
    except OSError:
        return 0.0


def safe_delete(path: str):
    """Safely delete a file."""
    try:
        if os.path.exists(path):
            os.remove(path)
    except OSError:
        pass


def format_timestamp(seconds: float) -> str:
    """Format seconds as MM:SS."""
    mins = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{mins:02d}:{secs:02d}"
