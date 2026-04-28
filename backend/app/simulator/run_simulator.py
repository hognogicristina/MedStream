import os
import random
import threading
import time
from datetime import timedelta
from collections import deque

from faker import Faker
from sqlalchemy.sql import func, select
from passlib.context import CryptContext

from app.core.config import settings
from app.db.session import SessionLocal
from app.kafka.producer import send_message
from app.service.medical_history import DIAGNOSIS, ALLERGIES, DRUGS, ACTIVITY_TYPES, DOSAGES, FREQUENCIES, DEPARTMENTS, COUNTIES, CONDITIONS

from app.models.patient.patient import Patient
from app.models.doctor.doctor import Doctor
from app.models.vital import Vital
from app.models.alert import Alert
from app.models.encounter import Encounter
from app.models.patient.patient_diagnosis import PatientDiagnosis
from app.models.patient.patient_allergy import PatientAllergy
from app.models.patient.patient_condition import PatientCondition
from app.models.patient.patient_condition_assignment import PatientConditionAssignment
from app.models.patient.patient_admission_history import PatientAdmissionHistory
from app.models.patient.patient_medication import PatientMedication
from app.models.doctor.doctor_activity import DoctorActivity
from app.models.doctor.doctor_activity_patient import doctor_activity_patients
from app.models.batch_analytics import BatchAnalytics
from app.service.assign_patients import assign_doctor_to_patient
from app.utils.datetime import now_utc, to_utc

fake = Faker("ro_RO")
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

DEFAULT_BATCH_INTERVAL_SECONDS = 300
BATCH_INTERVAL_ENV = "SIMULATOR_BATCH_INTERVAL_SECONDS"
FALLBACK_BATCH_INTERVAL_ENV = "BATCH_INTERVAL"
MAX_STREAMED_PATIENTS = 50
VITAL_SAMPLE_RATE = 0.02
ALWAYS_STREAM_ALERTS = True
PATIENT_STATES = ["stable", "monitoring", "warning", "critical", "recovering"]
BASE_RANDOM_ACTIVITY_PROBABILITY = 0.005
PATIENT_ACTIVITY_LIMIT_RANGE = (3, 5)
PATIENT_ACTIVITY_COOLDOWN_RANGE_MINUTES = (30, 60)
RANDOM_ACTIVITY_STATE_MULTIPLIER = {
    "stable": 0.05,
    "recovering": 0.1,
    "monitoring": 0.2,
    "warning": 0.7,
    "critical": 1.0
}


def resolve_batch_interval_seconds():
    raw_interval = (
        os.getenv(BATCH_INTERVAL_ENV)
        or os.getenv(FALLBACK_BATCH_INTERVAL_ENV)
        or str(DEFAULT_BATCH_INTERVAL_SECONDS)
    )

    try:
        interval = int(raw_interval)
    except (TypeError, ValueError):
        return DEFAULT_BATCH_INTERVAL_SECONDS

    if interval <= 0:
        return DEFAULT_BATCH_INTERVAL_SECONDS

    return interval


BATCH_INTERVAL_SECONDS = resolve_batch_interval_seconds()

vitals_buffer = deque()
alerts_buffer = deque()
buffer_lock = threading.Lock()
patient_states = {}
patient_last_normal_time = {}
patient_last_activity_time = {}
patient_activity_limits = {}
patient_activity_cooldowns = {}
batch_scheduler_started = False
batch_scheduler_lock = threading.Lock()


def get_patient_activity_limit(patient_id):
    if patient_id not in patient_activity_limits:
        patient_activity_limits[patient_id] = random.randint(*PATIENT_ACTIVITY_LIMIT_RANGE)
    return patient_activity_limits[patient_id]


def get_patient_activity_cooldown_minutes(patient_id):
    if patient_id not in patient_activity_cooldowns:
        patient_activity_cooldowns[patient_id] = random.randint(*PATIENT_ACTIVITY_COOLDOWN_RANGE_MINUTES)
    return patient_activity_cooldowns[patient_id]


def can_create_activity_for_patient(db, patient_id, activities_created_in_cycle=None):
    if activities_created_in_cycle is not None and patient_id in activities_created_in_cycle:
        return False

    incoming_limit = get_patient_activity_limit(patient_id)
    incoming_count = db.query(DoctorActivity).filter(
        DoctorActivity.patient_id == patient_id,
        DoctorActivity.status == "incoming"
    ).count()

    if incoming_count >= incoming_limit:
        return False

    last_created_at = patient_last_activity_time.get(patient_id)
    if last_created_at:
        cooldown = timedelta(minutes=get_patient_activity_cooldown_minutes(patient_id))
        if now_utc() - to_utc(last_created_at) < cooldown:
            return False

    return True


def register_activity_created(patient_id, activities_created_in_cycle=None):
    patient_last_activity_time[patient_id] = now_utc()
    if activities_created_in_cycle is not None:
        activities_created_in_cycle.add(patient_id)


def random_activity_probability_for_state(state):
    multiplier = RANDOM_ACTIVITY_STATE_MULTIPLIER.get(state, RANDOM_ACTIVITY_STATE_MULTIPLIER["monitoring"])
    return BASE_RANDOM_ACTIVITY_PROBABILITY * multiplier


def append_vital_sample(patient_id, vitals):
    with buffer_lock:
        vitals_buffer.append({
            "timestamp": now_utc(),
            "patient_id": patient_id,
            **vitals
        })


def append_alert_sample(patient_id, alert_type):
    with buffer_lock:
        alerts_buffer.append({
            "timestamp": now_utc(),
            "patient_id": patient_id,
            "type": alert_type
        })


def evaluate_patient_state(pid, vitals):
    hr = vitals["heart_rate"]
    spo2 = vitals["oxygen_saturation"]
    temp = vitals["temperature"]

    if spo2 < 88 or hr > 130 or temp > 39:
        return "critical"

    if spo2 < 92 or hr > 110 or temp > 38:
        return "warning"

    return "stable"


def handle_state_transition(db, patient, new_state, activities_created_in_cycle=None):
    pid = patient.id
    old_state = patient_states.get(pid)

    if old_state == new_state:
        return

    patient_states[pid] = new_state

    if new_state == "critical":
        create_critical_flow(db, patient, activities_created_in_cycle)

    elif new_state == "warning":
        create_warning_flow(db, patient, activities_created_in_cycle)

    elif new_state == "stable":
        handle_stable_flow(db, patient)


def create_critical_flow(db, patient, activities_created_in_cycle=None):
    if not can_create_activity_for_patient(db, patient.id, activities_created_in_cycle):
        return False

    doctor = random_doctor_for_department(db, patient.department)
    if not doctor:
        return False

    db.add(DoctorActivity(
        doctor_id=doctor.id,
        patient_id=patient.id,
        type="SURGERY",
        title="Emergency surgery",
        description="Critical condition requires immediate intervention",
        status="incoming",
        scheduled_at=now_utc() + timedelta(minutes=10)
    ))
    register_activity_created(patient.id, activities_created_in_cycle)
    return True


def create_warning_flow(db, patient, activities_created_in_cycle=None):
    if not can_create_activity_for_patient(db, patient.id, activities_created_in_cycle):
        return False

    doctor = random_doctor_for_department(db, patient.department)
    if not doctor:
        return False

    db.add(DoctorActivity(
        doctor_id=doctor.id,
        patient_id=patient.id,
        type="PROCEDURE",
        title="Further investigation",
        description="Patient shows abnormal vitals",
        status="incoming",
        scheduled_at=now_utc() + timedelta(hours=2)
    ))
    register_activity_created(patient.id, activities_created_in_cycle)
    return True


def handle_stable_flow(db, patient):
    pid = patient.id

    if pid not in patient_last_normal_time:
        patient_last_normal_time[pid] = now_utc()
        return

    elapsed = now_utc() - to_utc(patient_last_normal_time[pid])

    if elapsed > timedelta(hours=6):
        try_discharge_patient(db, patient)


def try_discharge_patient(db, patient):
    has_pending = db.query(DoctorActivity).filter(
        DoctorActivity.patient_id == patient.id,
        DoctorActivity.status == "incoming"
    ).count() > 0

    if has_pending:
        return

    patient.is_discharged = True
    patient.discharge_date = now_utc()
    patient.discharge_reason = "Recovered"


def transfer_patient(db, patient, new_department):
    new_doctor = random_doctor_for_department(db, new_department)

    patient.department = new_department

    db.execute(
        doctor_activity_patients.delete().where(
            doctor_activity_patients.c.patient_id == patient.id
        )
    )

    assign_doctor_to_patient(db, new_doctor.id, patient.id)

    db.add(DoctorActivity(
        doctor_id=new_doctor.id,
        patient_id=patient.id,
        type="TRANSFER",
        title=f"Transferred to {new_department}",
        description="Patient condition requires specialized care",
        status="completed"
    ))


def generate_cnp(birth_date, gender, index):
    if birth_date.year >= 2000:
        s = "5" if gender == "male" else "6"
    else:
        s = "1" if gender == "male" else "2"

    yy = birth_date.strftime("%y")
    mm = birth_date.strftime("%m")
    dd = birth_date.strftime("%d")

    county = f"{random.randint(1, 41):02d}"
    serial = f"{index % 999:03d}"

    partial = f"{s}{yy}{mm}{dd}{county}{serial}"

    control_key = "279146358279"
    checksum = sum(int(d) * int(w) for d, w in zip(partial, control_key)) % 11
    checksum = 1 if checksum == 10 else checksum

    return f"{partial}{checksum}"


def generate_phone(db):
    while True:
        phone = f"+407{random.randint(1000000, 9999999)}"

        exists = db.execute(
            select(Patient).where(Patient.phone_number == phone)
        ).scalar_one_or_none()

        if not exists:
            return phone


def random_doctor_for_department(db, department):
    return db.query(Doctor) \
        .filter(Doctor.specialization == department) \
        .order_by(func.random()) \
        .first()


def generate_doctors(db, count=40):
    doctors = []

    for dept in DEPARTMENTS:
        birth_date = fake.date_of_birth(minimum_age=25, maximum_age=70)

        doctor = Doctor(
            first_name=fake.first_name(),
            last_name=fake.last_name(),
            email=f"{dept.lower()}_{random.randint(1000, 9999)}@med.local",
            password_hash=pwd_context.hash("password123"),
            specialization=dept,
            license_number=f"LIC-{random.randint(10000, 99999)}",
            phone_number=f"+407{random.randint(1000000, 9999999)}",
            birth_date=birth_date
        )

        db.add(doctor)
        doctors.append(doctor)

    remaining = max(0, count - len(DEPARTMENTS))

    for i in range(remaining):
        dept = random.choice(DEPARTMENTS)
        birth_date = fake.date_of_birth(minimum_age=25, maximum_age=70)

        db.add(Doctor(
            first_name=fake.first_name(),
            last_name=fake.last_name(),
            email=f"doctor_extra_{i}@med.local",
            password_hash=pwd_context.hash("password123"),
            specialization=dept,
            license_number=f"LIC-{20000 + i}",
            phone_number=f"+407{random.randint(1000000, 9999999)}",
            birth_date=birth_date
        ))

    db.commit()


def generate_patient(db, index):
    doctor = db.query(Doctor).order_by(func.random()).first()
    if not doctor:
        return None

    gender = random.choice(["male", "female"])
    birth_date = fake.date_of_birth(minimum_age=18, maximum_age=90)
    is_discharged = False
    now = now_utc()

    address = {
        "address_street": fake.street_name(),
        "address_number": str(random.randint(1, 200)),
        "address_city": fake.city(),
        "address_state": random.choice(COUNTIES),
        "address_postal_code": fake.postcode(),
        "address_country": "Romania"
    }

    is_pregnant = False
    if gender == "female" and 18 <= (now_utc().year - birth_date.year) <= 45:
        is_pregnant = random.random() < 0.2

    if is_pregnant:
        allowed_categories = ["A", "B"]
    else:
        allowed_categories = ["A", "B", "C", "D", "N"]

    valid_drugs = [d for d in DRUGS if d["pregnancy_category"] in allowed_categories]

    if not valid_drugs:
        return None

    drug = random.choice(valid_drugs)
    medication_name = drug["medication"]
    condition_name = drug["condition"]

    patient = Patient(
        first_name=fake.first_name_male() if gender == "male" else fake.first_name_female(),
        last_name=fake.last_name(),
        gender=gender,
        department=doctor.specialization,
        birth_date=birth_date,
        cnp=generate_cnp(birth_date, gender, index),
        phone_number=generate_phone(db),
        is_discharged=is_discharged,
        is_pregnant=is_pregnant,
        discharge_date=now if is_discharged else None,
        discharge_reason="Recovered" if is_discharged else None,
        **address
    )

    db.add(patient)
    db.flush()

    assign_doctor_to_patient(db, doctor.id, patient.id)

    db.add(Encounter(
        patient_id=patient.id,
        doctor_id=doctor.id if doctor else None,
        encounter_type="admission",
        chief_complaint="Auto generated"
    ))

    diagnosis = next(
        (d for d in DIAGNOSIS if condition_name.lower() in d.lower()),
        None
    )

    db.add(PatientAdmissionHistory(
        patient_id=patient.id,
        doctor_id=doctor.id,
        type="admission",
        reason="Initial admission",
        created_at=now - timedelta(hours=random.randint(1, 48))
    ))

    if patient.is_pregnant:
        pregnancy_doctor = random_doctor_for_department(db, "Obstetrics")
        if pregnancy_doctor:
            db.add(DoctorActivity(
                doctor_id=pregnancy_doctor.id,
                patient_id=patient.id,
                type="PROCEDURE",
                title="Childbirth preparation",
                description="Pregnancy monitoring and delivery planning",
                status="incoming",
                scheduled_at=now_utc() + timedelta(days=1)
            ))

    if not is_discharged:
        chronic_conditions = [
            "Hypertension",
            "Type 2 Diabetes",
            "Chronic Heart Failure",
            "Chronic Kidney Disease",
            "COPD",
            "Coronary Artery Disease",
            "Asthma",
            "Atrial Fibrillation"
        ]
        recurring_conditions = [
            "Migraine",
            "Recurrent Urinary Tract Infection",
            "Gastroesophageal Reflux Disease",
            "Anemia"
        ]

        target_condition_count = random.randint(2, 5)
        selected_conditions = []
        for candidate in [condition_name, diagnosis]:
            if candidate and candidate not in selected_conditions:
                selected_conditions.append(candidate)

        preferred_conditions = chronic_conditions + recurring_conditions
        random.shuffle(preferred_conditions)
        for candidate in preferred_conditions:
            if len(selected_conditions) >= target_condition_count:
                break
            if candidate not in selected_conditions:
                selected_conditions.append(candidate)

        extra_conditions = [c for c in CONDITIONS if c]
        random.shuffle(extra_conditions)
        for candidate in extra_conditions:
            if len(selected_conditions) >= target_condition_count:
                break
            if candidate not in selected_conditions:
                selected_conditions.append(candidate)

        target_diagnosis_count = random.randint(1, 3)
        selected_diagnoses = []
        if diagnosis:
            selected_diagnoses.append(diagnosis)

        diagnosis_candidates = [d for d in DIAGNOSIS if d]
        random.shuffle(diagnosis_candidates)
        for candidate in diagnosis_candidates:
            if len(selected_diagnoses) >= target_diagnosis_count:
                break
            if candidate not in selected_diagnoses:
                selected_diagnoses.append(candidate)

        allergy_candidates = [a for a in ALLERGIES if a]
        allergy_count = min(random.randint(1, 4), len(allergy_candidates))
        selected_allergies = random.sample(allergy_candidates, k=allergy_count) if allergy_count > 0 else []

        for diag in selected_diagnoses:
            diagnosed_at = now - timedelta(days=random.randint(2, 42), hours=random.randint(0, 23))
            db.add(PatientDiagnosis(
                patient_id=patient.id,
                doctor_id=doctor.id,
                diagnosis=diag,
                status=random.choice(["active", "improving", "stable", "worsening", "chronic"]),
                created_at=diagnosed_at,
                updated_at=diagnosed_at
            ))

        for label in selected_conditions:
            condition = db.execute(
                select(PatientCondition).where(PatientCondition.name == label)
            ).scalar_one_or_none()

            if not condition:
                condition = PatientCondition(
                    name=label,
                    status=random.choice(["active", "stable", "worsening", "chronic"])
                )
                db.add(condition)
                db.flush()

            existing_assignment = db.execute(
                select(PatientConditionAssignment).where(
                    PatientConditionAssignment.patient_id == patient.id,
                    PatientConditionAssignment.condition_id == condition.id
                )
            ).scalar_one_or_none()

            if existing_assignment:
                continue

            diagnosed_at = now - timedelta(days=random.randint(3, 56), hours=random.randint(0, 23))
            db.add(PatientConditionAssignment(
                patient_id=patient.id,
                condition_id=condition.id,
                doctor_id=doctor.id,
                status=random.choice(["active", "monitoring", "stable", "chronic"]),
                diagnosed_at=diagnosed_at,
                created_at=diagnosed_at
            ))

        dosage = f"{random.choice(['1', '2'])}x {random.choice(DOSAGES)}"
        frequency = random.choice(FREQUENCIES)
        medication_created_at = now - timedelta(days=random.randint(1, 30), hours=random.randint(0, 23))

        db.add(PatientMedication(
            patient_id=patient.id,
            doctor_id=doctor.id,
            name=medication_name,
            dosage=dosage,
            frequency=frequency,
            created_at=medication_created_at
        ))

        for allergy in selected_allergies:
            allergy_created_at = now - timedelta(days=random.randint(7, 90), hours=random.randint(0, 23))
            db.add(PatientAllergy(
                patient_id=patient.id,
                doctor_id=doctor.id,
                allergy_name=allergy,
                severity=random.choice(["mild", "moderate", "severe"]),
                created_at=allergy_created_at
            ))
    db.commit()

    return {
        "id": patient.id,
        "condition": condition_name,
        "diagnosis": diagnosis
    }


def generate_vitals(patient_id):
    hr = random.randint(70, 140)
    spo2 = random.randint(85, 100)
    temp = random.randint(36, 39)

    return {
        "heart_rate": hr,
        "oxygen_saturation": spo2,
        "temperature": temp,
        "systolic_bp": random.randint(110, 160),
        "diastolic_bp": random.randint(70, 100)
    }


def create_alerts(db, patient_id, vital_obj, vital_data):
    created = False

    if vital_data["heart_rate"] > 120:
        send_message("alerts-events", {
            "event": "alert",
            "patient_id": patient_id,
            "type": "heart_rate",
            "value": vital_data["heart_rate"],
            "severity": "high"
        })

        db.add(Alert(
            patient_id=patient_id,
            vital_id=vital_obj.id,
            alert_type="heart_rate",
            message=f"High heart rate: {vital_data['heart_rate']}",
            severity="high"
        ))
        created = True
        append_alert_sample(patient_id, "heart_rate")

    if vital_data["oxygen_saturation"] < 90:
        send_message("alerts-events", {
            "event": "alert",
            "patient_id": patient_id,
            "type": "heart_rate",
            "value": vital_data["heart_rate"],
            "severity": "high"
        })

        db.add(Alert(
            patient_id=patient_id,
            vital_id=vital_obj.id,
            alert_type="oxygen",
            message=f"Low oxygen: {vital_data['oxygen_saturation']}",
            severity="critical"
        ))
        created = True
        append_alert_sample(patient_id, "heart_rate")

    if vital_data["temperature"] > 38:
        send_message("alerts-events", {
            "event": "alert",
            "patient_id": patient_id,
            "type": "heart_rate",
            "value": vital_data["heart_rate"],
            "severity": "high"
        })

        db.add(Alert(
            patient_id=patient_id,
            vital_id=vital_obj.id,
            alert_type="temperature",
            message=f"Fever: {vital_data['temperature']}",
            severity="high"
        ))
        created = True
        append_alert_sample(patient_id, "heart_rate")

    if not created:
        send_message("alerts-events", {
            "event": "alert",
            "patient_id": patient_id,
            "type": "heart_rate",
            "value": vital_data["heart_rate"],
            "severity": "high"
        })

        db.add(Alert(
            patient_id=patient_id,
            vital_id=vital_obj.id,
            alert_type="status",
            message="Patient stable",
            severity="normal"
        ))
        append_alert_sample(patient_id, "heart_rate")


def run_batch_analytics_job():
    now = now_utc()
    window_start = now - timedelta(seconds=BATCH_INTERVAL_SECONDS)

    with buffer_lock:
        recent_vitals = [v for v in vitals_buffer if to_utc(v["timestamp"]) >= window_start]
        recent_alerts = [a for a in alerts_buffer if to_utc(a["timestamp"]) >= window_start]

        while vitals_buffer and to_utc(vitals_buffer[0]["timestamp"]) < window_start:
            vitals_buffer.popleft()

        while alerts_buffer and to_utc(alerts_buffer[0]["timestamp"]) < window_start:
            alerts_buffer.popleft()

    avg_hr = 0.0
    avg_spo2 = 0.0
    avg_temp = 0.0

    if recent_vitals:
        avg_hr = sum(v["heart_rate"] for v in recent_vitals) / len(recent_vitals)
        avg_spo2 = sum(v["oxygen_saturation"] for v in recent_vitals) / len(recent_vitals)
        avg_temp = sum(v["temperature"] for v in recent_vitals) / len(recent_vitals)

    patient_ids = {
        sample["patient_id"]
        for sample in recent_vitals
        if sample.get("patient_id") is not None
    }
    patient_ids.update(
        sample["patient_id"]
        for sample in recent_alerts
        if sample.get("patient_id") is not None
    )

    payload = {
        "event": "batch",
        "timestamp": now.isoformat(),
        "avg_heart_rate": round(avg_hr, 2),
        "avg_oxygen": round(avg_spo2, 2),
        "avg_temperature": round(avg_temp, 2),
        "alerts_count": len(recent_alerts),
        "patients_count": len(patient_ids),
    }

    with SessionLocal() as db:
        db.add(BatchAnalytics(
            timestamp=now,
            avg_heart_rate=payload["avg_heart_rate"],
            avg_oxygen=payload["avg_oxygen"],
            avg_temperature=payload["avg_temperature"],
            alerts_count=payload["alerts_count"],
            patients_count=payload["patients_count"],
        ))
        db.commit()

    send_message(settings.kafka_batch_topic, payload)


def run_batch_scheduler():
    while True:
        time.sleep(BATCH_INTERVAL_SECONDS)
        try:
            run_batch_analytics_job()
        except Exception as error:
            print("Batch scheduler error:", error)


def ensure_batch_scheduler_started():
    global batch_scheduler_started

    with batch_scheduler_lock:
        if batch_scheduler_started:
            return

        threading.Thread(
            target=run_batch_scheduler,
            daemon=True,
            name="medstream-simulator-batch-scheduler"
        ).start()
        batch_scheduler_started = True


def generate_activity(db, patient_id, condition_name=None, diagnosis=None, activities_created_in_cycle=None):
    patient = db.get(Patient, patient_id)
    if not patient or patient.is_discharged:
        return

    if not can_create_activity_for_patient(db, patient_id, activities_created_in_cycle):
        return

    doctor_links = db.execute(
        doctor_activity_patients.select().where(
            doctor_activity_patients.c.patient_id == patient_id
        )
    ).all()

    if not doctor_links:
        return

    valid_doctors = []

    for link in doctor_links:
        doctor = db.get(Doctor, link.doctor_id)
        if doctor and doctor.specialization == patient.department:
            valid_doctors.append(doctor)

    if not valid_doctors:
        return

    doctor = random.choice(valid_doctors)

    activity_type = random.choice(ACTIVITY_TYPES)
    source = condition_name or diagnosis or "medical condition"

    if activity_type == "Consultation":
        title = f"Consultation - {source}"
        description = f"Patient evaluated due to {source}"
    elif activity_type == "Surgery":
        title = f"Surgery - {source}"
        description = f"Surgical intervention required for {source}"
    elif activity_type == "Procedure":
        title = f"Procedure - {source}"
        description = f"Medical procedure performed because of {source}"
    elif activity_type == "Transfer":
        title = f"Transfer - {source}"
        description = f"Patient transferred due to {source}"
    elif activity_type == "Lab test":
        title = f"Lab Test - {source}"
        description = f"Lab investigation requested for {source}"
    else:
        title = f"Imaging - {source}"
        description = f"Imaging required to assess {source}"

    db.add(DoctorActivity(
        doctor_id=doctor.id,
        patient_id=patient_id,
        type=activity_type,
        title=title,
        description=description,
        status="incoming",
        scheduled_at=now_utc() + timedelta(hours=random.randint(1, 24))
    ))
    register_activity_created(patient_id, activities_created_in_cycle)


streamed_patients = set()


def run():
    active_patients = []
    ensure_batch_scheduler_started()

    with SessionLocal() as db:
        if db.query(Doctor).count() == 0:
            generate_doctors(db)

    counter = 1

    while True:
        with SessionLocal() as db:
            activities_created_in_cycle = set()

            if random.random() < 0.8:
                p = generate_patient(db, counter)
                if p:
                    active_patients.append(p)
                    counter += 1

            for patient_data in active_patients:
                if not patient_data or "id" not in patient_data:
                    continue

                pid = patient_data["id"]
                condition_name = patient_data["condition"]
                diagnosis = patient_data["diagnosis"]

                patient = db.get(Patient, pid)
                if not patient or patient.is_discharged:
                    continue

                if random.random() < 0.005:
                    patient.is_discharged = True
                    patient.discharge_date = now_utc()
                    patient.discharge_reason = random.choice([
                        "Recovered",
                        "Transferred",
                        "Stable condition"
                    ])

                    doctor_link = db.execute(
                        doctor_activity_patients.select().where(
                            doctor_activity_patients.c.patient_id == patient.id
                        )
                    ).first()

                    if not doctor_link:
                        continue

                    db.add(PatientAdmissionHistory(
                        patient_id=patient.id,
                        doctor_id=doctor_link.doctor_id,
                        type="discharge",
                        reason=patient.discharge_reason,
                        created_at=patient.discharge_date
                    ))

                    continue

                vitals = generate_vitals(pid)
                append_vital_sample(pid, vitals)

                vital = Vital(
                    patient_id=pid,
                    **vitals
                )

                db.add(vital)
                db.flush()

                new_state = evaluate_patient_state(pid, vitals)
                handle_state_transition(db, patient, new_state, activities_created_in_cycle)

                create_alerts(db, pid, vital, vitals)

                should_stream = False

                if pid in streamed_patients:
                    should_stream = True

                elif len(streamed_patients) < MAX_STREAMED_PATIENTS:
                    streamed_patients.add(pid)
                    should_stream = True

                elif random.random() < VITAL_SAMPLE_RATE:
                    should_stream = True

                if should_stream:
                    send_message("vitals-events", {
                        "event": "vital",
                        "patient_id": pid,
                        **vitals
                    })

                if random.random() < random_activity_probability_for_state(new_state):
                    generate_activity(db, pid, condition_name, diagnosis, activities_created_in_cycle)

            db.commit()

        time.sleep(2)


if __name__ == "__main__":
    run()
