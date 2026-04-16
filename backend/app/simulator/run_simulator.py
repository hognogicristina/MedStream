import csv
import random
import time
from datetime import datetime, timedelta
from pathlib import Path
from faker import Faker
from sqlalchemy.sql import func, select
from passlib.context import CryptContext

from app.db.session import SessionLocal
from app.kafka.producer import send_message
from app.service.medical_history import DIAGNOSIS, ALLERGIES, DRUGS, ACTIVITY_TYPES, DOSAGES, FREQUENCIES, DEPARTMENTS, COUNTIES, STATUS

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

fake = Faker("ro_RO")
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def assign_doctor_to_patient(db, doctor_id, patient_id):
    exists = db.execute(
        doctor_activity_patients.select().where(
            (doctor_activity_patients.c.doctor_id == doctor_id) &
            (doctor_activity_patients.c.patient_id == patient_id)
        )
    ).first()

    if not exists:
        db.execute(
            doctor_activity_patients.insert().values(
                doctor_id=doctor_id,
                patient_id=patient_id
            )
        )


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
    now = datetime.utcnow()

    address = {
        "address_street": fake.street_name(),
        "address_number": str(random.randint(1, 200)),
        "address_city": fake.city(),
        "address_state": random.choice(COUNTIES),
        "address_postal_code": fake.postcode(),
        "address_country": "Romania"
    }

    is_pregnant = False
    if gender == "female" and 18 <= (datetime.utcnow().year - birth_date.year) <= 45:
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

    if not is_discharged:
        if diagnosis:
            db.add(PatientDiagnosis(
                patient_id=patient.id,
                doctor_id=doctor.id,
                diagnosis=diagnosis,
                status=random.choice(STATUS)
            ))

        if condition_name:
            condition = db.execute(
                select(PatientCondition).where(PatientCondition.name == condition_name)
            ).scalar_one_or_none()

            if not condition:
                condition = PatientCondition(
                    name=condition_name,
                    status=random.choice(STATUS)
                )
                db.add(condition)
                db.flush()

            existing_assignment = db.execute(
                select(PatientConditionAssignment).where(
                    PatientConditionAssignment.patient_id == patient.id,
                    PatientConditionAssignment.condition_id == condition.id,
                    PatientConditionAssignment.doctor_id == doctor.id
                )
            ).scalar_one_or_none()

            if not existing_assignment:
                db.add(PatientConditionAssignment(
                    patient_id=patient.id,
                    condition_id=condition.id,
                    doctor_id=doctor.id,
                ))

        dosage = f"{random.choice(['1', '2'])}x {random.choice(DOSAGES)}"
        frequency = random.choice(FREQUENCIES)

        db.add(PatientMedication(
            patient_id=patient.id,
            doctor_id=doctor.id,
            name=medication_name,
            dosage=dosage,
            frequency=frequency,
            created_at=datetime.utcnow().date()
        ))

        for allergy in random.sample(ALLERGIES, k=random.randint(0, 2)):
            db.add(PatientAllergy(
                patient_id=patient.id,
                doctor_id=doctor.id,
                allergy_name=allergy,
                severity=random.choice(["mild", "moderate", "severe"])
            ))

        if diagnosis:
            condition = db.execute(
                select(PatientCondition).where(PatientCondition.name == diagnosis)
            ).scalar_one_or_none()

            if not condition:
                condition = PatientCondition(
                    name=diagnosis,
                    status="active"
                )
                db.add(condition)
                db.flush()

            existing_assignment = db.execute(
                select(PatientConditionAssignment).where(
                    PatientConditionAssignment.patient_id == patient.id,
                    PatientConditionAssignment.condition_id == condition.id,
                    PatientConditionAssignment.doctor_id == doctor.id
                )
            ).scalar_one_or_none()

            if not existing_assignment:
                db.add(PatientConditionAssignment(
                    patient_id=patient.id,
                    condition_id=condition.id,
                    doctor_id=doctor.id
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
        db.add(Alert(
            patient_id=patient_id,
            vital_id=vital_obj.id,
            alert_type="heart_rate",
            message=f"High heart rate: {vital_data['heart_rate']}",
            severity="high"
        ))
        created = True

    if vital_data["oxygen_saturation"] < 90:
        db.add(Alert(
            patient_id=patient_id,
            vital_id=vital_obj.id,
            alert_type="oxygen",
            message=f"Low oxygen: {vital_data['oxygen_saturation']}",
            severity="critical"
        ))
        created = True

    if vital_data["temperature"] > 38:
        db.add(Alert(
            patient_id=patient_id,
            vital_id=vital_obj.id,
            alert_type="temperature",
            message=f"Fever: {vital_data['temperature']}",
            severity="high"
        ))
        created = True

    if not created:
        db.add(Alert(
            patient_id=patient_id,
            vital_id=vital_obj.id,
            alert_type="status",
            message="Patient stable",
            severity="normal"
        ))


def generate_activity(db, patient_id, condition_name=None, diagnosis=None):
    patient = db.get(Patient, patient_id)
    if not patient:
        return

    doctor_link = db.execute(
        doctor_activity_patients.select().where(
            doctor_activity_patients.c.patient_id == patient_id
        )
    ).first()

    if not doctor_link:
        return

    doctor = db.get(Doctor, doctor_link.doctor_id)
    if not doctor:
        return

    activity_type = random.choice(ACTIVITY_TYPES)
    source = condition_name or diagnosis or "medical condition"

    if activity_type == "CONSULTATION":
        title = f"Consultation - {source}"
        description = f"Patient evaluated due to {source}"
    elif activity_type == "SURGERY":
        title = f"Surgery - {source}"
        description = f"Surgical intervention required for {source}"
    elif activity_type == "PROCEDURE":
        title = f"Procedure - {source}"
        description = f"Medical procedure performed because of {source}"
    elif activity_type == "TRANSFER":
        title = f"Transfer - {source}"
        description = f"Patient transferred due to {source}"
    elif activity_type == "LAB TEST":
        title = f"Lab Test - {source}"
        description = f"Lab investigation requested for {source}"
    else:
        title = f"Imaging - {source}"
        description = f"Imaging required to assess {source}"

    activity = DoctorActivity(
        doctor_id=doctor.id,
        patient_id=patient_id,
        type=activity_type,
        title=title,
        description=description,
        status=random.choice(["incoming", "completed"]),
        scheduled_at=datetime.utcnow() + timedelta(hours=random.randint(1, 72))
    )

    db.add(activity)


def run():
    active_patients = []

    with SessionLocal() as db:
        if db.query(Doctor).count() == 0:
            generate_doctors(db)

    counter = 1

    while True:
        with SessionLocal() as db:

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
                    patient.discharge_date = datetime.utcnow()
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

                vital = Vital(
                    patient_id=pid,
                    **vitals
                )

                db.add(vital)
                db.flush()

                create_alerts(db, pid, vital, vitals)

                send_message("vitals-events", {
                    "event": "vital",
                    "patient_id": pid,
                    **vitals
                })

                if random.random() < 0.2:
                    generate_activity(db, pid, condition_name, diagnosis)

            db.commit()

        time.sleep(1)


if __name__ == "__main__":
    run()
