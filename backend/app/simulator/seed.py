from datetime import date, datetime, timedelta
import random

from sqlalchemy import delete, text

from app.batch.patient_stats_job import run as run_batch_stats
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.alert import Alert
from app.models.encounter import Encounter
from app.models.doctor_patient import doctor_patients
from app.models.medication_administration import MedicationAdministration
from app.models.patient import Patient
from app.models.patient_stats import PatientStats
from app.models.vital import Vital
from app.simulator.patient_profiles import DEPARTMENT_PROFILE_MAP, build_patient_state, generate_vitals

SEED = 20260411
PATIENT_COUNT = 150
DEPARTMENTS = ["ER", "ICU", "Cardiology", "Internal Medicine", "Neurology", "Ward"]
ROMANIA_COUNTIES = [
    {"name": "Bucuresti", "cities": ["Bucuresti"]},
    {"name": "Cluj", "cities": ["Cluj-Napoca", "Turda"]},
    {"name": "Iasi", "cities": ["Iasi", "Pascani"]},
    {"name": "Timis", "cities": ["Timisoara", "Lugoj"]},
    {"name": "Constanta", "cities": ["Constanta", "Mangalia"]},
    {"name": "Brasov", "cities": ["Brasov", "Fagaras"]},
]
MALE_FIRST_NAMES = [
    "Andrei", "Mihai", "Victor", "Radu", "Alexandru", "Ionut", "Paul", "Sorin", "Dorin", "Florin", "Tudor", "Bogdan"
]
FEMALE_FIRST_NAMES = [
    "Ioana", "Elena", "Ana", "Maria", "Bianca", "Raluca", "Gabriela", "Cristina", "Monica", "Oana", "Irina", "Larisa"
]
LAST_NAMES = [
    "Popescu", "Ionescu", "Dumitrescu", "Stan", "Stoica", "Marin", "Rusu", "Toma", "Barbu", "Neagu", "Matei", "Luca",
    "Sandu", "Pavel", "Avram", "Toader", "Florea", "Voicu", "Preda", "Enache", "Munteanu", "Ciobanu", "Apostol", "Dragan"
]
STREET_NAMES = [
    "Liberty", "Union", "Oak", "River", "Central", "Garden", "Maple", "Victory", "Elm", "Station", "Hill", "Clinic"
]
PROFILE_COMPLAINTS = {
    "healthy": [
        "Short observation after minor incident",
        "Routine monitoring after intake",
        "Stability check during supervised admission",
    ],
    "cardiac risk": [
        "Chest pressure with telemetry observation",
        "Palpitations and blood pressure instability",
        "Rhythm irregularity requiring monitoring",
    ],
    "infection/fever": [
        "Persistent fever and suspected infection",
        "Productive cough with elevated temperature",
        "Fatigue and inflammatory signs under review",
    ],
    "respiratory distress": [
        "Shortness of breath with oxygen support",
        "Acute respiratory compromise during intake",
        "Hypoxemia requiring continuous monitoring",
    ],
    "recovering patient": [
        "Post-treatment stabilization under observation",
        "Recovery monitoring after acute intervention",
        "Step-down supervision after clinical improvement",
    ],
}
MEDICATIONS = [
    ("Paracetamol", "500 mg"),
    ("Aspirin", "75 mg"),
    ("Furosemide", "20 mg"),
    ("Metoprolol", "50 mg"),
    ("Ceftriaxone", "1 g"),
    ("Salbutamol", "2.5 mg"),
]


def build_rng(seed_suffix: str):
    return random.Random(f"{SEED}:{seed_suffix}")


def generate_phone_number(index: int):
    prefix = f"07{40 + ((index - 1) % 10)}"
    return f"{prefix}{index:06d}"


def generate_address(index: int):
    county = ROMANIA_COUNTIES[(index - 1) % len(ROMANIA_COUNTIES)]
    return {
        "street": f"Strada {STREET_NAMES[(index - 1) % len(STREET_NAMES)]}",
        "number": str(10 + index),
        "apartment": str((index % 18) + 1),
        "city": county["cities"][(index - 1) % len(county["cities"])],
        "county": county["name"],
        "postal_code": f"{100000 + index}",
    }


def generate_birth_date(index: int):
    rng = build_rng(f"birth-date:{index}")
    year = rng.randint(1942, 2004)
    month = rng.randint(1, 12)
    day = rng.randint(1, 28)
    return date(year, month, day)


def generate_cnp(birth_date: date, gender: str, serial: int):
    if birth_date.year >= 2000:
        first_digit = "5" if gender == "male" else "6"
    else:
        first_digit = "1" if gender == "male" else "2"

    county_code = f"{(serial % 52) + 1:02d}"
    unique_serial = f"{serial % 999 + 1:03d}"
    partial = f"{first_digit}{birth_date:%y%m%d}{county_code}{unique_serial}"
    control_key = "279146358279"
    checksum = sum(int(digit) * int(weight) for digit, weight in zip(partial, control_key)) % 11
    checksum_digit = "1" if checksum == 10 else str(checksum)
    return f"{partial}{checksum_digit}"


def generate_patient_payload(index: int):
    department = DEPARTMENTS[(index - 1) % len(DEPARTMENTS)]
    profile_name = DEPARTMENT_PROFILE_MAP[department][(index - 1) % len(DEPARTMENT_PROFILE_MAP[department])]
    gender = "female" if index % 2 == 0 else "male"
    first_name_pool = FEMALE_FIRST_NAMES if gender == "female" else MALE_FIRST_NAMES
    first_name = first_name_pool[(index - 1) % len(first_name_pool)]
    last_name = LAST_NAMES[((index - 1) * 3) % len(LAST_NAMES)]
    birth_date = generate_birth_date(index)
    cnp = generate_cnp(birth_date, gender, index)
    phone_number = generate_phone_number(index)
    address = generate_address(index)
    chief_complaint = PROFILE_COMPLAINTS[profile_name][(index - 1) % len(PROFILE_COMPLAINTS[profile_name])]
    encounter_type = {
        "ER": "emergency",
        "ICU": "critical_care",
        "Cardiology": "specialty_admission",
        "Internal Medicine": "medical_admission",
        "Neurology": "specialty_admission",
        "Ward": "inpatient",
    }[department]

    return {
        "first_name": first_name,
        "last_name": last_name,
        "department": department,
        "cnp": cnp,
        "phone_number": phone_number,
        "birth_date": birth_date,
        "gender": gender,
        "profile_name": profile_name,
        "encounter_type": encounter_type,
        "chief_complaint": chief_complaint,
        "address": address,
    }


def build_alerts_for_vital(vital: Vital):
    alerts = []

    if vital.heart_rate > settings.heart_rate_alert_threshold:
        alerts.append(("heart_rate", f"High heart rate detected: {vital.heart_rate} bpm", "high"))

    if vital.oxygen_saturation < settings.oxygen_alert_threshold:
        alerts.append(("oxygen_saturation", f"Low oxygen saturation detected: {vital.oxygen_saturation}%", "critical"))

    if vital.temperature > settings.temperature_alert_threshold:
        alerts.append(("temperature", f"High temperature detected: {vital.temperature} C", "high"))

    return alerts


def reset_seed_tables(db):
    tables = [
        "doctor_patients",
        "alerts",
        "medication_administrations",
        "vitals",
        "encounters",
        "patient_stats",
        "patients"
    ]
    for table in tables:
        db.execute(text(f"TRUNCATE TABLE {table} CASCADE"))
    db.commit()


def create_encounter(db, patient: Patient, payload: dict):
    encounter = Encounter(
        patient_id=patient.id,
        doctor_id=None,
        encounter_type=payload["encounter_type"],
        chief_complaint=payload["chief_complaint"],
        status="open",
    )
    db.add(encounter)


def seed_vitals_and_alerts(db, patient: Patient):
    state = build_patient_state(patient)
    base_time = datetime.utcnow() - timedelta(hours=24)

    for sample_index in range(48):
        vitals = generate_vitals(state, patient.id)
        vital = Vital(
            patient_id=patient.id,
            heart_rate=vitals["heart_rate"],
            oxygen_saturation=vitals["oxygen_saturation"],
            temperature=vitals["temperature"],
            systolic_bp=vitals["systolic_bp"],
            diastolic_bp=vitals["diastolic_bp"],
            recorded_at=base_time + timedelta(minutes=sample_index * 30),
        )
        db.add(vital)
        db.flush()

        for alert_type, message, severity in build_alerts_for_vital(vital):
            db.add(
                Alert(
                    patient_id=patient.id,
                    vital_id=vital.id,
                    alert_type=alert_type,
                    message=message,
                    severity=severity,
                    created_at=vital.recorded_at,
                )
            )


def seed_medication_history(db, patient: Patient):
    medication_count = build_rng(f"medications:{patient.id}").randint(1, 5)

    for index in range(medication_count):
        medication_name, dosage = MEDICATIONS[(patient.id + index) % len(MEDICATIONS)]
        db.add(
            MedicationAdministration(
                patient_id=patient.id,
                medication_name=medication_name,
                dosage=dosage,
                timestamp=datetime.utcnow() - timedelta(hours=index + 1),
            )
        )


def run():
    generated_patients = [generate_patient_payload(index) for index in range(1, PATIENT_COUNT + 1)]

    with SessionLocal() as db:
        reset_seed_tables(db)

        for payload in generated_patients:
            patient = Patient(
                first_name=payload["first_name"],
                last_name=payload["last_name"],
                department=payload["department"],
                cnp=payload["cnp"],
                phone_number=payload["phone_number"],
                birth_date=payload["birth_date"],
                gender=payload["gender"],
                address_street=payload["address"]["street"],
                address_number=payload["address"]["number"],
                address_apartment=payload["address"]["apartment"],
                address_city=payload["address"]["city"],
                address_state=payload["address"]["county"],
                address_postal_code=payload["address"]["postal_code"],
                address_country="Romania",
            )
            db.add(patient)
            db.flush()

            create_encounter(db, patient, payload)
            seed_vitals_and_alerts(db, patient)
            seed_medication_history(db, patient)

        db.commit()

    run_batch_stats()
    print(f"Generated {PATIENT_COUNT} patients with encounters, vitals, alerts, medications, and analytics snapshots")


if __name__ == "__main__":
    run()
