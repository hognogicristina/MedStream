from __future__ import annotations

from datetime import datetime, timedelta


MIN_ADMISSION_DURATION = timedelta(days=3)
STABILITY_HOURS = 6
MIN_EFFECTIVE_EVALUATIONS = 5


def derive_outcome_from_alert_evolution(
    *,
    before_count: int,
    after_count: int,
    before_severity_score: int,
    after_severity_score: int,
) -> str:
    alerts_decreased = after_count < before_count
    alerts_worsened = after_count > before_count
    severity_improved = after_severity_score < before_severity_score
    severity_worsened = after_severity_score > before_severity_score
    alerts_persisted = after_count > 0 and after_count == before_count

    if alerts_decreased or severity_improved:
        return "effective"

    if alerts_worsened or severity_worsened or alerts_persisted:
        return "ineffective"

    return "effective"


def is_stable_window_effective(outcome_history: list[dict], *, now: datetime) -> bool:
    if not outcome_history:
        return False

    recent_by_time = [
        item for item in outcome_history
        if isinstance(item.get("timestamp"), datetime) and now - item["timestamp"] <= timedelta(hours=STABILITY_HOURS)
    ]
    recent_by_count = outcome_history[-MIN_EFFECTIVE_EVALUATIONS:]

    time_window_effective = bool(recent_by_time) and all(item.get("outcome") == "effective" for item in recent_by_time)
    count_window_effective = (
        len(recent_by_count) >= MIN_EFFECTIVE_EVALUATIONS
        and all(item.get("outcome") == "effective" for item in recent_by_count)
    )

    return time_window_effective or count_window_effective


def is_patient_discharge_eligible(
    *,
    now: datetime,
    admission_date: datetime | None,
    outcome_history: list[dict],
    has_incoming_activities: bool,
    patient_state: str,
) -> bool:
    if admission_date is None:
        return False

    if now - admission_date < MIN_ADMISSION_DURATION:
        return False

    if has_incoming_activities:
        return False

    if patient_state != "stable":
        return False

    last_evaluations = outcome_history[-MIN_EFFECTIVE_EVALUATIONS:]
    if len(last_evaluations) < MIN_EFFECTIVE_EVALUATIONS:
        return False

    if any(item.get("outcome") != "effective" for item in last_evaluations):
        return False

    return is_stable_window_effective(outcome_history, now=now)
