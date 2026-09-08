"""Restore shipped sample alerts without inference or resetting human reviews."""
import json

from backend import database
from backend.config import BASE_DIR

MANIFEST_PATH = BASE_DIR / "frontend" / "public" / "samples" / "manifest.json"


def seed_samples() -> None:
    if not MANIFEST_PATH.exists():
        return
    samples = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    conn = database.get_connection()
    try:
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(incidents)")}
        with conn:
            for sample in samples:
                for incident in sample["result"]["incidents"]:
                    if incident["id"] >= 0:
                        raise ValueError("Shipped samples must use reserved negative IDs")
                    record = {key: value for key, value in incident.items() if key in columns}
                    names = list(record)
                    # Never replace a row: its review state and audit history
                    # belong to the operator, even across restarts/deploys.
                    conn.execute(
                        f"INSERT INTO incidents ({','.join(names)}) "
                        f"VALUES ({','.join('?' for _ in names)}) "
                        "ON CONFLICT(incident_code) DO NOTHING",
                        [record[name] for name in names],
                    )
    finally:
        conn.close()
