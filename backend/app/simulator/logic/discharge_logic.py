from __future__ import annotations

import random
from datetime import datetime, timedelta


DISCHARGE_REASONS = ["Recovered", "Transferred", "Stable condition"]


def handle_stable_flow(
    *,
    patient_id: int,
    now: datetime,
    patient_last_normal_time: dict[int, datetime],
    threshold_hours: int = 6,
) -> bool:
    if patient_id not in patient_last_normal_time:
        patient_last_normal_time[patient_id] = now
        return False

    elapsed = now - patient_last_normal_time[patient_id]
    return elapsed > timedelta(hours=threshold_hours)


def try_discharge_patient(has_pending_activities: bool) -> bool:
    return not has_pending_activities


def maybe_random_discharge(probability: float) -> bool:
    return random.random() < probability


def pick_discharge_reason() -> str:
    return random.choice(DISCHARGE_REASONS)
