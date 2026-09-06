"""COCO class groupings used by the GuardianAI detectors.

YOLO11n ships with COCO-80 weights. That vocabulary covers people and vehicles
directly, and it covers *some* weapons (knife, scissors, baseball bat) — but it
has no `fire`, `smoke`, or `firearm` class. Anything outside COCO therefore
needs either a custom-trained checkpoint (see `FIRE_MODEL_PATH` /
`WEAPON_MODEL_PATH` in `config.py`) or a classical-CV fallback.

Keeping the IDs in one place means every detector agrees on the vocabulary, and
`detector.detect_objects` can request the union in a single inference pass.
"""

# --- Individual COCO class IDs -------------------------------------------------

PERSON = 0
BICYCLE = 1
CAR = 2
MOTORCYCLE = 3
BUS = 5
TRUCK = 7
BASEBALL_BAT = 34
KNIFE = 43
SCISSORS = 76

# --- Groupings -----------------------------------------------------------------

#: Anything with wheels that can be involved in a traffic accident.
VEHICLE_CLASSES = (BICYCLE, CAR, MOTORCYCLE, BUS, TRUCK)

#: Motorised vehicles only. Bicycles are excluded from collision *severity*
#: escalation because a slow-moving cyclist overlapping a car is usually just
#: occlusion, not an impact.
MOTOR_VEHICLE_CLASSES = (CAR, MOTORCYCLE, BUS, TRUCK)

#: COCO classes that act as weapon proxies. `scissors` and `baseball bat` are
#: deliberately included — they are the only bladed/blunt-object classes COCO
#: offers, and an operator would want to see them. They carry lower seriousness
#: than a knife (see `weapon_detector.WEAPON_SERIOUSNESS`).
WEAPON_PROXY_CLASSES = (KNIFE, SCISSORS, BASEBALL_BAT)

#: Human-readable names for every class GuardianAI requests. Sourced from the
#: COCO-80 label order that Ultralytics uses, so `model.names` and this table
#: agree.
CLASS_NAMES: dict[int, str] = {
    PERSON: "person",
    BICYCLE: "bicycle",
    CAR: "car",
    MOTORCYCLE: "motorcycle",
    BUS: "bus",
    TRUCK: "truck",
    BASEBALL_BAT: "baseball bat",
    KNIFE: "knife",
    SCISSORS: "scissors",
}

#: The union requested from YOLO in a single `track()` call.
ALL_TRACKED_CLASSES = tuple(
    sorted({PERSON, *VEHICLE_CLASSES, *WEAPON_PROXY_CLASSES})
)


def class_name(class_id: int, fallback: str = "object") -> str:
    """Human-readable name for a COCO class id."""
    return CLASS_NAMES.get(class_id, fallback)


def is_vehicle(class_id: int) -> bool:
    """True for any wheeled vehicle class."""
    return class_id in VEHICLE_CLASSES


def is_motor_vehicle(class_id: int) -> bool:
    """True for motorised vehicles (excludes bicycles)."""
    return class_id in MOTOR_VEHICLE_CLASSES


def is_weapon_proxy(class_id: int) -> bool:
    """True for the COCO classes GuardianAI treats as weapons."""
    return class_id in WEAPON_PROXY_CLASSES
