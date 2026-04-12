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
from app.models.patient_admission_history import PatientAdmissionHistory
from app.models.patient import Patient
from app.models.patient_allergy import PatientAllergy
from app.models.patient_condition import PatientCondition
from app.models.patient_condition_assignment import PatientConditionAssignment
from app.models.patient_diagnosis import PatientDiagnosis
from app.models.patient_medical_history import PatientMedicalHistory
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
DISCHARGE_REASONS = [
    "Clinical condition improved and home monitoring advised.",
    "Treatment completed with stable vitals.",
    "Transferred to outpatient follow-up care.",
    "Post-operative recovery completed without complications.",
]
ALLERGY_OPTIONS = [
    ("Penicillin", "severe"),
    ("Peanuts", "severe"),
    ("Shellfish", "moderate"),
    ("Latex", "moderate"),
    ("Ibuprofen", "mild"),
    ("Dust mites", "mild"),
]
MEDICAL_HISTORY_OPTIONS = [
    ("Appendectomy", "Laparoscopic appendectomy with full recovery.", "surgery"),
    ("Type 2 Diabetes", "Ongoing oral medication management.", "chronic"),
    ("Hypertension", "Controlled with daily antihypertensive therapy.", "chronic"),
    ("Community-acquired pneumonia", "Resolved after inpatient antibiotic treatment.", "illness"),
    ("Migraine disorder", "Intermittent episodes with neurologic follow-up.", "chronic"),
    ("Knee ligament repair", "Surgical repair after sports injury.", "surgery"),
]
DIAGNOSIS_OPTIONS = [
    ("Acute bronchitis", "Supportive care and observation."),
    ("Atrial fibrillation", "Telemetry monitoring recommended."),
    ("Transient ischemic attack", "Neurology evaluation completed."),
    ("Gastroenteritis", "Hydration and symptomatic treatment."),
]
PATIENT_CONDITION_OPTIONS = [
    ("Asthma", "Chronic inflammatory airway disease requiring long-term monitoring."),
    ("Cancer", "Active oncology diagnosis requiring coordinated multidisciplinary care."),
    ("Chronic Kidney Disease", "Reduced renal function requiring laboratory follow-up."),
    ("Diabetes", "Metabolic disorder requiring glucose management."),
    ("Hypertension", "Persistent elevated blood pressure requiring monitoring."),
    ("Ischemic Heart Disease", "Cardiovascular condition with ongoing cardiac risk."),
]


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
        "arrival_method": "ambulance" if rng.random() < 0.35 else "self",
        "is_discharged": rng.random() < 0.18,
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
        "patient_admission_history",
        "patient_condition_assignments",
        "patient_conditions",
        "patient_diagnosis",
        "patient_medical_history",
        "patient_allergies",
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


def seed_allergies(db, patient: Patient):
    rng = build_rng(f"allergies:{patient.id}")
    allergy_count = rng.randint(0, 3)

    for allergy_name, severity in rng.sample(ALLERGY_OPTIONS, k=allergy_count):
        db.add(
            PatientAllergy(
                patient_id=patient.id,
                allergy_name=allergy_name,
                severity=severity,
                created_at=datetime.utcnow() - timedelta(days=rng.randint(5, 500)),
            )
        )


def seed_medical_history(db, patient: Patient):
    rng = build_rng(f"medical-history:{patient.id}")
    history_count = rng.randint(1, 4)
    entries = rng.sample(MEDICAL_HISTORY_OPTIONS, k=history_count)
    today = date.today()

    for index, (condition_name, description, history_type) in enumerate(entries):
        candidate_date = patient.birth_date + timedelta(days=rng.randint(7000, 22000))
        history_date = min(candidate_date, today)
        db.add(
            PatientMedicalHistory(
                patient_id=patient.id,
                condition_name=condition_name,
                description=description,
                type=history_type,
                date=history_date,
                created_at=datetime.utcnow() - timedelta(days=index * 20 + rng.randint(10, 1800)),
            )
        )


def seed_diagnosis(db, patient: Patient):
    rng = build_rng(f"diagnosis:{patient.id}")
    diagnosis_count = rng.randint(1, 2)

    for diagnosis, notes in rng.sample(DIAGNOSIS_OPTIONS, k=diagnosis_count):
        db.add(
            PatientDiagnosis(
                patient_id=patient.id,
                diagnosis=diagnosis,
                notes=notes,
                created_at=datetime.utcnow() - timedelta(hours=rng.randint(1, 96)),
            )
        )


def seed_admission_history(db, patient: Patient):
    rng = build_rng(f"admission-history:{patient.id}")

    if patient.is_discharged and patient.discharge_date:
        if rng.random() < 0.35:
            readmission_date = patient.discharge_date - timedelta(days=rng.randint(20, 120))
            prior_discharge_date = readmission_date - timedelta(days=rng.randint(2, 15))
            db.add(
                PatientAdmissionHistory(
                    patient_id=patient.id,
                    type="discharge",
                    reason="Recovered after inpatient treatment and follow-up arranged.",
                    created_at=prior_discharge_date,
                )
            )
            db.add(
                PatientAdmissionHistory(
                    patient_id=patient.id,
                    type="readmission",
                    reason="Readmitted for recurrence of symptoms requiring reassessment.",
                    created_at=readmission_date,
                )
            )

        db.add(
            PatientAdmissionHistory(
                patient_id=patient.id,
                type="discharge",
                reason=patient.discharge_reason or "Stable for discharge.",
                created_at=patient.discharge_date,
            )
        )


def seed_conditions(db):
    conditions = []

    for name, description in PATIENT_CONDITION_OPTIONS:
        condition = PatientCondition(name=name, description=description)
        db.add(condition)
        conditions.append(condition)

    db.flush()
    return conditions


def seed_patient_conditions(db, patient: Patient, conditions: list[PatientCondition]):
    rng = build_rng(f"conditions:{patient.id}")
    condition_count = rng.randint(0, min(3, len(conditions)))

    if condition_count == 0:
        return

    for condition in rng.sample(conditions, k=condition_count):
        db.add(
            PatientConditionAssignment(
                patient_id=patient.id,
                condition_id=condition.id,
                created_at=datetime.utcnow() - timedelta(days=rng.randint(5, 900)),
            )
        )
        return

    if rng.random() < 0.3:
        discharge_date = datetime.utcnow() - timedelta(days=rng.randint(10, 160))
        readmission_date = discharge_date + timedelta(days=rng.randint(1, 14))
        db.add(
            PatientAdmissionHistory(
                patient_id=patient.id,
                type="discharge",
                reason="Previous admission completed with stable recovery.",
                created_at=discharge_date,
            )
        )
        db.add(
            PatientAdmissionHistory(
                patient_id=patient.id,
                type="readmission",
                reason="Returned for renewed monitoring after symptom progression.",
                created_at=readmission_date,
            )
        )


def run():
    generated_patients = [generate_patient_payload(index) for index in range(1, PATIENT_COUNT + 1)]

    with SessionLocal() as db:
        reset_seed_tables(db)
        seeded_conditions = seed_conditions(db)

        for payload in generated_patients:
            patient_rng = build_rng(f"patient-record:{payload['cnp']}")
            patient = Patient(
                first_name=payload["first_name"],
                last_name=payload["last_name"],
                department=payload["department"],
                cnp=payload["cnp"],
                phone_number=payload["phone_number"],
                birth_date=payload["birth_date"],
                gender=payload["gender"],
                arrival_method=payload["arrival_method"],
                is_discharged=payload["is_discharged"],
                discharge_reason=patient_rng.choice(DISCHARGE_REASONS) if payload["is_discharged"] else None,
                discharge_date=datetime.utcnow() - timedelta(days=patient_rng.randint(1, 45)) if payload["is_discharged"] else None,
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
            seed_allergies(db, patient)
            seed_medical_history(db, patient)
            seed_diagnosis(db, patient)
            seed_admission_history(db, patient)
            seed_patient_conditions(db, patient, seeded_conditions)

        db.commit()

    run_batch_stats()
    print(
        f"Generated {PATIENT_COUNT} patients with encounters, vitals, alerts, medications, allergies, "
        "medical history, diagnoses, and analytics snapshots"
    )


if __name__ == "__main__":
    run()
