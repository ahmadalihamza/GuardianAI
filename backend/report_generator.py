"""Report generation module for GuardianAI incidents."""
from typing import Optional

from backend.config import DASHSCOPE_API_KEY
from backend.risk_engine import CRITICAL_EVENT_TYPES

#: Per-event-type copy for the offline template, as
#: `(headline, detail)`. The headline completes "GuardianAI detected …
#: at <camera>", so it must stay a noun phrase; the detail is its own sentence.
#: Splitting the two is what keeps the generated report grammatical instead of
#: gluing "at Camera 3" onto the end of an explanatory sentence.
#:
#: `{subject}` is filled with either "Person #7" or a neutral phrase, because
#: region-based events (fire, smoke) and vehicle events have no person track and
#: printing "Person #-1" in an operator's report is worse than saying nothing.
_EVENT_DESCRIPTIONS: dict[str, tuple[str, str]] = {
    "Potential Fall": (
        "a potential fall involving {subject}",
        "The individual's posture changed rapidly from upright to horizontal.",
    ),
    "Restricted Zone Intrusion": (
        "a restricted-zone intrusion by {subject}",
        "The individual remained in the restricted area beyond the allowed threshold.",
    ),
    "Extended Intrusion": (
        "a prolonged restricted-zone intrusion by {subject}",
        "The intrusion was sustained well past the alert threshold.",
    ),
    "Weapon Detected": (
        "a possible weapon in view",
        "It was not clearly associated with anyone, so it may be an unattended "
        "object rather than a threat.",
    ),
    "Armed Person": (
        "a possible weapon held by {subject}",
        "The object stayed close enough to the body to be treated as carried "
        "rather than set down.",
    ),
    "Fire Detected": (
        "a suspected fire",
        "The region matched flame colour and flicker characteristics across "
        "consecutive frames.",
    ),
    "Smoke Detected": (
        "suspected smoke",
        "A large, low-saturation, moving region was observed, which steam and "
        "dust can also produce.",
    ),
    "Vehicle Collision": (
        "a suspected collision between two vehicles",
        "The vehicles overlapped while at least one of them was moving.",
    ),
    "Vehicle-Pedestrian Collision": (
        "a suspected collision between a moving vehicle and a pedestrian",
        "The vehicle's box overlapped the pedestrian's while it still carried speed.",
    ),
    "Sudden Vehicle Stop": (
        "an abrupt vehicle deceleration",
        "Hard braking is also normal at junctions, so this is a review prompt "
        "rather than a confirmed accident.",
    ),
    "Vehicle Overturn": (
        "a vehicle that appears to have overturned",
        "Its bounding box widened sharply and it then stopped moving.",
    ),
}

#: Used when the event type has no entry above, so an unrecognised event still
#: produces a report without asserting a mechanism nobody verified.
_GENERIC_DESCRIPTION = ("an anomalous event involving {subject}", "")


def _format_timestamp(timestamp: float) -> str:
    """Render seconds-into-video as HH:MM:SS."""
    total = max(int(timestamp), 0)
    return f"{total // 3600:02d}:{(total % 3600) // 60:02d}:{total % 60:02d}"


def _subject(track_id: int) -> str:
    """Name the subject of an event, or fall back to a neutral phrase."""
    return f"Person #{track_id}" if track_id is not None and track_id >= 0 else "an unidentified subject"


def generate_template_summary(
    event_type: str,
    timestamp: float,
    track_id: int,
    camera_name: str,
    location: str,
    risk_score: int,
    severity: str,
    explanation: str,
) -> str:
    """Generate a deterministic incident summary without an API key."""
    time_str = _format_timestamp(timestamp)

    entry = _EVENT_DESCRIPTIONS.get(event_type)
    if entry is None:
        if "Fall" in event_type:
            entry = _EVENT_DESCRIPTIONS["Potential Fall"]
        elif "Intrusion" in event_type:
            entry = _EVENT_DESCRIPTIONS["Restricted Zone Intrusion"]
        else:
            entry = _GENERIC_DESCRIPTION
    headline, detail = entry
    headline = headline.format(subject=_subject(track_id))

    urgency = (
        "Immediate human verification is recommended."
        if event_type in CRITICAL_EVENT_TYPES or severity == "High"
        else "Human verification is recommended before any action is taken."
    )

    parts = [
        f"At {time_str}, GuardianAI detected {headline} at {camera_name} ({location}).",
        detail,
        f"The calculated risk score is {risk_score}/100, classified as {severity}.",
        explanation,
        urgency,
    ]
    return " ".join(part.strip() for part in parts if part and part.strip())


def generate_ai_summary(
    event_type: str,
    timestamp: float,
    track_id: int,
    camera_name: str,
    location: str,
    risk_score: int,
    severity: str,
    explanation: str,
) -> Optional[str]:
    """Generate an AI-enhanced summary using Qwen via DashScope.

    Returns None if no API key or request fails.
    """
    if not DASHSCOPE_API_KEY:
        return None

    try:
        import dashscope
        from dashscope import Generation

        dashscope.api_key = DASHSCOPE_API_KEY

        prompt = (
            "You are an AI assistant for a surveillance safety system called GuardianAI. "
            "Write a factual, concise incident report based ONLY on the following details. "
            "Do NOT invent casualties, injuries, or any facts not provided. "
            "Do NOT claim that any emergency service was contacted. "
            "Mention uncertainty where appropriate and recommend human verification.\n\n"
            f"Event type: {event_type}\n"
            f"Timestamp (seconds into video): {timestamp:.1f}\n"
            f"Subject: {_subject(track_id)}\n"
            f"Camera: {camera_name}\n"
            f"Location: {location}\n"
            f"Risk score: {risk_score}/100 ({severity})\n"
            f"Technical explanation: {explanation}\n\n"
            "Write a 3-4 sentence report suitable for a security operator."
        )

        response = Generation.call(
            model="qwen-turbo",
            prompt=prompt,
            result_format="message",
            max_tokens=256,
        )

        if response.status_code == 200 and response.output:
            text = response.output.choices[0].message.content.strip()
            return text
        return None
    except Exception:
        return None


def get_incident_summary(
    event_type: str,
    timestamp: float,
    track_id: int,
    camera_name: str,
    location: str,
    risk_score: int,
    severity: str,
    explanation: str,
) -> str:
    """Get the best available summary, falling back to template."""
    ai_summary = generate_ai_summary(
        event_type, timestamp, track_id, camera_name, location,
        risk_score, severity, explanation,
    )
    if ai_summary:
        return ai_summary
    return generate_template_summary(
        event_type, timestamp, track_id, camera_name, location,
        risk_score, severity, explanation,
    )
