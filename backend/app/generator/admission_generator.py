import random
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone


DIAGNOSIS_BY_CONDITION = {
    "cardiac": [
        "Acute coronary syndrome under evaluation",
        "Atrial fibrillation with rapid ventricular response",
        "Decompensated heart failure",
    ],
    "respiratory": [
        "Acute exacerbation of chronic obstructive pulmonary disease",
        "Community-acquired pneumonia with hypoxemia",
        "Asthma exacerbation requiring observation",
    ],
    "infectious": [
        "Suspected bacterial sepsis",
        "Complicated urinary tract infection with fever",
        "Viral respiratory infection with systemic symptoms",
    ],
    "normal": [
        "Observation after elective procedure",
        "Routine monitoring and hydration",
        "Post-evaluation admission with stable status",
    ],
}


@dataclass(frozen=True)
class GeneratedAdmission:
    patient_id: int
    doctor_id: int
    department_id: int
    admission_date: datetime
    initial_diagnosis: str


def diagnosis_for_condition(condition: str) -> str:
    return random.choice(DIAGNOSIS_BY_CONDITION[condition])


def generate_admission(
    patient_id: int,
    condition: str,
    doctor: dict,
) -> GeneratedAdmission:
    now = datetime.now(timezone.utc)
    admission_date = now - timedelta(
        days=random.randint(0, 10),
        hours=random.randint(0, 23),
        minutes=random.randint(0, 59),
    )

    return GeneratedAdmission(
        patient_id=patient_id,
        doctor_id=doctor["id"],
        department_id=doctor["department_id"],
        admission_date=admission_date,
        initial_diagnosis=diagnosis_for_condition(condition),
    )
