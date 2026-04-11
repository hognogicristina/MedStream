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
from faker import Faker


def get_fake(rng):
    Faker.seed(rng.randint(1, 999999))
    return Faker("ro_RO")


SEED = 20260411
PATIENT_COUNT = 150
DEPARTMENTS = ["ER", "ICU", "Cardiology", "Internal Medicine", "Neurology", "Ward"]


def generate_name(rng):
    Faker.seed(rng.randint(1, 999999))

    first_name = fake.first_name()
    last_name = fake.last_name()

    return first_name, last_name


def build_rng(seed_suffix: str):
    return random.Random(f"{SEED}:{seed_suffix}")


def generate_phone_number(index: int):
    prefixes = ["072", "073", "074", "075", "076", "077"]
    prefix = prefixes[index % len(prefixes)]
    return f"{prefix}{(1000000 + index):07d}"[:10]


def generate_address(rng):
    fake = Faker("ro_RO")
    fake.seed_instance(rng.randint(1, 999999))

    return {
        "street": fake.street_name(),
        "number": str(fake.building_number()),
        "apartment": str(rng.randint(1, 50)) if rng.random() > 0.3 else "",
        "city": fake.city(),
        "county": fake.state(),
        "postal_code": fake.postcode(),
    }


def generate_birth_date(index: int):
    rng = build_rng(f"birth:{index}")
    year = rng.randint(1945, 2005)
    month = rng.randint(1, 12)
    day = rng.randint(1, 28)
    return date(year, month, day)


def generate_cnp(birth_date: date, gender: str, index: int):
    if birth_date.year >= 2000:
        s = "5" if gender == "male" else "6"
    else:
        s = "1" if gender == "male" else "2"

    yy = birth_date.strftime("%y")
    mm = birth_date.strftime("%m")
    dd = birth_date.strftime("%d")

    county_code = f"{(index % 41) + 1:02d}"
    unique_serial = f"{(index * 7 % 999) + 1:03d}"
    partial = f"{s}{yy}{mm}{dd}{county_code}{unique_serial}"
    control_key = "279146358279"
    checksum = sum(int(d) * int(w) for d, w in zip(partial, control_key)) % 11
    checksum = 1 if checksum == 10 else checksum

    return f"{partial}{checksum}"


def generate_patient_payload(index: int):
    department = DEPARTMENTS[(index - 1) % len(DEPARTMENTS)]
    profile_name = DEPARTMENT_PROFILE_MAP[department][(index - 1) % len(DEPARTMENT_PROFILE_MAP[department])]
    rng = build_rng(f"patient:{index}")
    gender = "female" if index % 2 == 0 else "male"
    fake = get_fake(rng)
    first_name = fake.first_name()
    last_name = fake.last_name()
    birth_date = generate_birth_date(index)
    cnp = generate_cnp(birth_date, gender, index)
    phone_number = generate_phone_number(index)
    address = generate_address(rng)
    chief_complaint = fake.sentence(nb_words=6)
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
        medication_name, dosage = random.choice([
            ("Aspirin", "100 mg"),
            ("Lisinopril", "10 mg"),
            ("Metformin", "500 mg"),
            ("Atorvastatin", "20 mg"),
        ])
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
