from __future__ import annotations

from datetime import timedelta

from app.utils.datetime import now_utc


def create_critical_flow() -> dict:
    return {
        "type": "SURGERY",
        "title": "Emergency surgery",
        "description": "Critical condition requires immediate intervention",
        "status": "incoming",
        "scheduled_at": now_utc() + timedelta(minutes=10),
    }


def create_warning_flow() -> dict:
    return {
        "type": "PROCEDURE",
        "title": "Further investigation",
        "description": "Patient shows abnormal vitals",
        "status": "incoming",
        "scheduled_at": now_utc() + timedelta(hours=2),
    }


def random_activity_probability_for_state(
    state: str,
    base_probability: float,
    multipliers: dict[str, float],
) -> float:
    multiplier = multipliers.get(state, multipliers.get("monitoring", 0.2))
    return base_probability * multiplier
