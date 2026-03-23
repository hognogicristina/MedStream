import random
from dataclasses import dataclass
from datetime import date, timedelta

TREATMENT_PROTOCOLS = {
    "cardiac": {
        "base": ["Metoprolol"],
        "add_if_moderate": ["Aspirin"],
        "add_if_severe": ["Furosemide"],
        "critical": ["Furosemide", "Metoprolol"],
    },
    "respiratory": {
        "base": ["Salbutamol"],
        "add_if_moderate": ["Budesonide"],
        "add_if_severe": ["Budesonide", "Azithromycin"],
    },
    "infectious": {
        "base": ["Paracetamol"],
        "add_if_moderate": ["Ceftriaxone"],
        "add_if_severe": ["Ceftriaxone", "Normal Saline"],
    },
    "normal": {
        "base": ["Paracetamol"],
        "optional": ["Omeprazole"],
    },
}

MEDICATION_DETAILS = {
    "Metoprolol": {"dosages": ("25 mg", "50 mg"), "freq": (1, 2), "duration": (5, 14)},
    "Furosemide": {"dosages": ("20 mg", "40 mg"), "freq": (1, 2), "duration": (3, 10)},
    "Aspirin": {"dosages": ("81 mg", "100 mg"), "freq": (1, 1), "duration": (7, 30)},
    "Salbutamol": {"dosages": ("2.5 mg nebulized", "5 mg"), "freq": (3, 4), "duration": (3, 7)},
    "Budesonide": {"dosages": ("0.5 mg", "1 mg"), "freq": (2, 2), "duration": (5, 10)},
    "Azithromycin": {"dosages": ("500 mg",), "freq": (1, 1), "duration": (3, 5)},
    "Ceftriaxone": {"dosages": ("1 g IV", "2 g IV"), "freq": (1, 2), "duration": (5, 10)},
    "Paracetamol": {"dosages": ("500 mg", "1 g"), "freq": (1, 4), "duration": (2, 5)},
    "Normal Saline": {"dosages": ("500 mL IV", "1000 mL IV"), "freq": (1, 2), "duration": (1, 3)},
    "Omeprazole": {"dosages": ("20 mg",), "freq": (1, 1), "duration": (3, 7)},
}


@dataclass(frozen=True)
class GeneratedTreatment:
    admission_id: int
    medication_id: int
    dosage: str
    frequency_per_day: int
    start_date: date
    end_date: date


def generate_severity() -> str:
    return random.choices(
        ["mild", "moderate", "severe"],
        weights=[0.5, 0.3, 0.2],
    )[0]


def decide_medications(condition: str, severity: str, patient_age: int) -> list[str]:
    protocol = TREATMENT_PROTOCOLS[condition]
    meds = set()

    meds.update(protocol.get("base", []))

    if severity == "moderate":
        meds.update(protocol.get("add_if_moderate", []))

    if severity == "severe":
        meds.update(protocol.get("add_if_severe", []))


    if patient_age > 65 and condition == "cardiac":
        meds.add("Aspirin")


    if severity == "severe" and random.random() < 0.25:
        meds.update(protocol.get("critical", []))


    if condition == "normal" and random.random() < 0.3:
        meds.update(protocol.get("optional", []))

    return list(meds)



def generate_medication_plan(med_name: str):
    details = MEDICATION_DETAILS[med_name]

    dosage = random.choice(details["dosages"])
    frequency = random.randint(*details["freq"])

    if frequency > 1 and random.random() < 0.3:
        frequency += 1

    duration = random.randint(*details["duration"])

    return dosage, frequency, duration


def generate_treatments(
        admission_id: int,
        condition: str,
        admission_date: date,
        medication_lookup: dict[str, int],
        patient_age: int = None,
) -> list[GeneratedTreatment]:
    if patient_age is None:
        patient_age = random.randint(18, 90)

    severity = generate_severity()

    medications = decide_medications(condition, severity, patient_age)

    treatments: list[GeneratedTreatment] = []

    for med_name in medications:
        dosage, frequency, duration = generate_medication_plan(med_name)

        treatments.append(
            GeneratedTreatment(
                admission_id=admission_id,
                medication_id=medication_lookup[med_name],
                dosage=dosage,
                frequency_per_day=frequency,
                start_date=admission_date,
                end_date=admission_date + timedelta(days=duration),
            )
        )

    return treatments