"""Risk scoring engine for GuardianAI."""
from typing import Dict


def compute_risk_score(
    confidence: float,
    seriousness: float,
    persistence: float,
    context: float,
) -> int:
    """Compute the overall risk score (0-100).

    Formula:
        risk_score = round(100 * (0.45*confidence + 0.25*seriousness + 0.20*persistence + 0.10*context))
    """
    for name, val in [
        ("confidence", confidence),
        ("seriousness", seriousness),
        ("persistence", persistence),
        ("context", context),
    ]:
        if not 0.0 <= val <= 1.0:
            raise ValueError(f"{name} must be between 0 and 1, got {val}")

    raw = 100 * (
        0.45 * confidence
        + 0.25 * seriousness
        + 0.20 * persistence
        + 0.10 * context
    )
    return int(round(max(0.0, min(100.0, raw))))


def get_severity(risk_score: int) -> str:
    """Map risk score to severity label."""
    if risk_score < 40:
        return "Low"
    elif risk_score < 70:
        return "Medium"
    else:
        return "High"


#: Base seriousness per event type, on a 0..1 scale. These are policy choices,
#: not model outputs: they encode how much an operator should care about a
#: *confirmed* event of each kind, independent of how confident the detector is.
#: Life-threatening events (armed person, vehicle striking a pedestrian, fire)
#: sit at the top; property and boundary events sit lower.
EVENT_SERIOUSNESS: Dict[str, float] = {
    # Person / zone events
    "Restricted Zone Intrusion": 0.55,
    "Extended Intrusion": 0.70,
    "Potential Fall": 0.85,
    # Weapons
    "Weapon Detected": 0.90,
    "Armed Person": 0.95,
    # Fire
    "Smoke Detected": 0.75,
    "Fire Detected": 0.95,
    # Traffic
    "Vehicle Collision": 0.90,
    "Vehicle-Pedestrian Collision": 0.98,
    "Sudden Vehicle Stop": 0.60,
    "Vehicle Overturn": 0.92,
}

#: Which of the above are "critical" — used by the dashboard to highlight the
#: incidents that should never sit in the queue unreviewed.
CRITICAL_EVENT_TYPES = frozenset(
    event for event, score in EVENT_SERIOUSNESS.items() if score >= 0.90
)


def get_seriousness_for_event(event_type: str) -> float:
    """Get base seriousness score for an event type."""
    return EVENT_SERIOUSNESS.get(event_type, 0.50)


def build_risk_breakdown(
    confidence: float,
    seriousness: float,
    persistence: float,
    context: float,
    risk_score: int,
    severity: str,
) -> Dict[str, object]:
    """Build a dict explaining the risk calculation."""
    return {
        "confidence_score": round(confidence, 3),
        "seriousness_score": round(seriousness, 3),
        "persistence_score": round(persistence, 3),
        "context_score": round(context, 3),
        "risk_score": risk_score,
        "severity": severity,
        "formula": "0.45*confidence + 0.25*seriousness + 0.20*persistence + 0.10*context",
    }
