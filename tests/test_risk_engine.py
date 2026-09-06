"""Tests for GuardianAI risk engine."""
import pytest
from backend.risk_engine import (
    compute_risk_score,
    get_severity,
    get_seriousness_for_event,
)


def test_risk_score_perfect():
    """All components at 1.0 should give 100."""
    assert compute_risk_score(1.0, 1.0, 1.0, 1.0) == 100


def test_risk_score_zero():
    """All components at 0 should give 0."""
    assert compute_risk_score(0.0, 0.0, 0.0, 0.0) == 0


def test_risk_score_mixed():
    """Test with mixed values."""
    score = compute_risk_score(0.8, 0.6, 0.5, 0.3)
    expected = round(100 * (0.45 * 0.8 + 0.25 * 0.6 + 0.20 * 0.5 + 0.10 * 0.3))
    assert score == expected


def test_risk_score_clamps_high():
    """Score should not exceed 100."""
    assert compute_risk_score(1.0, 1.0, 1.0, 1.0) <= 100


def test_risk_score_clamps_low():
    """Score should not be below 0."""
    assert compute_risk_score(0.0, 0.0, 0.0, 0.0) >= 0


def test_invalid_confidence_raises():
    """Values outside 0-1 should raise ValueError."""
    with pytest.raises(ValueError):
        compute_risk_score(1.5, 0.5, 0.5, 0.5)


def test_invalid_seriousness_raises():
    with pytest.raises(ValueError):
        compute_risk_score(0.5, -0.1, 0.5, 0.5)


def test_invalid_persistence_raises():
    with pytest.raises(ValueError):
        compute_risk_score(0.5, 0.5, 2.0, 0.5)


def test_invalid_context_raises():
    with pytest.raises(ValueError):
        compute_risk_score(0.5, 0.5, 0.5, -1.0)


def test_severity_low():
    assert get_severity(0) == "Low"
    assert get_severity(39) == "Low"


def test_severity_medium():
    assert get_severity(40) == "Medium"
    assert get_severity(69) == "Medium"


def test_severity_high():
    assert get_severity(70) == "High"
    assert get_severity(100) == "High"


def test_seriousness_values():
    assert get_seriousness_for_event("Restricted Zone Intrusion") == 0.55
    assert get_seriousness_for_event("Extended Intrusion") == 0.70
    assert get_seriousness_for_event("Potential Fall") == 0.85
    assert get_seriousness_for_event("Unknown Event") == 0.50
