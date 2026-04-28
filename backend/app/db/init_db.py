from sqlalchemy import inspect

from app.db.base import Base
from app.db.session import engine
from app.models.doctor.doctor import Doctor
from app.models.doctor.doctor_email_verification import DoctorEmailVerification
from app.models.doctor.doctor_password_reset import DoctorPasswordReset
from app.models.doctor.doctor_activity import DoctorActivity
from app.models.doctor.doctor_activity_patient import doctor_activity_patients

from app.models.patient.patient import Patient
from app.models.patient.patient_admission_history import PatientAdmissionHistory
from app.models.patient.patient_allergy import PatientAllergy
from app.models.patient.patient_condition import PatientCondition
from app.models.patient.patient_condition_assignment import PatientConditionAssignment
from app.models.patient.patient_diagnosis import PatientDiagnosis
from app.models.patient.patient_medication import PatientMedication
from app.models import (
    Alert,
    BatchAnalytics,
    Encounter,
    Vital,
)
from app.db.session import SessionLocal
from app.schemas.validators import ROMANIA_COUNTRY, normalize_phone_number
from app.service.medical_history import CONDITIONS, STATUS


def ensure_doctor_columns():
    inspector = inspect(engine)
    columns = {column["name"] for column in inspector.get_columns("doctors")}
    indexes = {index["name"] for index in inspector.get_indexes("doctors")}

    with engine.begin() as connection:
        if "phone_number" not in columns:
            connection.exec_driver_sql("ALTER TABLE doctors ADD COLUMN phone_number VARCHAR(50)")

        if "is_active" not in columns:
            connection.exec_driver_sql("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name='doctors' AND column_name='is_active'
                ) THEN
                    ALTER TABLE doctors ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
                END IF;
            END $$;
            """)

        if "deleted_at" not in columns:
            connection.exec_driver_sql("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name='doctors' AND column_name='deleted_at'
                ) THEN
                    ALTER TABLE doctors ADD COLUMN deleted_at TIMESTAMP;
                END IF;
            END $$;
            """)

        if "pending_email" not in columns:
            connection.exec_driver_sql("ALTER TABLE doctors ADD COLUMN pending_email VARCHAR(255)")

        if "email_confirmed" not in columns:
            connection.exec_driver_sql("ALTER TABLE doctors ADD COLUMN email_confirmed BOOLEAN NOT NULL DEFAULT true")

        if "birth_date" not in columns:
            connection.exec_driver_sql("ALTER TABLE doctors ADD COLUMN birth_date DATE")

        if "ix_doctors_phone_number" not in indexes:
            connection.exec_driver_sql("CREATE UNIQUE INDEX IF NOT EXISTS ix_doctors_phone_number ON doctors (phone_number)")

        if "ix_doctors_pending_email" not in indexes:
            connection.exec_driver_sql("CREATE UNIQUE INDEX IF NOT EXISTS ix_doctors_pending_email ON doctors (pending_email)")


def ensure_patient_columns():
    inspector = inspect(engine)
    columns = {column["name"] for column in inspector.get_columns("patients")}
    indexes = {index["name"] for index in inspector.get_indexes("patients")}
    condition_assignment_columns = {column["name"] for column in inspector.get_columns("patient_condition_assignments")}

    with engine.begin() as connection:
        if "phone_number" not in columns:
            connection.exec_driver_sql("ALTER TABLE patients ADD COLUMN phone_number VARCHAR(50)")

        if "arrival_method" not in columns:
            connection.exec_driver_sql("ALTER TABLE patients ADD COLUMN arrival_method VARCHAR(20) NOT NULL DEFAULT 'self'")

        if "is_discharged" not in columns:
            connection.exec_driver_sql("ALTER TABLE patients ADD COLUMN is_discharged BOOLEAN NOT NULL DEFAULT false")

        if "discharge_reason" not in columns:
            connection.exec_driver_sql("ALTER TABLE patients ADD COLUMN discharge_reason VARCHAR(500)")

        if "discharge_date" not in columns:
            connection.exec_driver_sql("ALTER TABLE patients ADD COLUMN discharge_date TIMESTAMP")

        address_columns = {
            "address_street": "VARCHAR(120)",
            "address_number": "VARCHAR(30)",
            "address_apartment": "VARCHAR(30)",
            "address_city": "VARCHAR(100)",
            "address_state": "VARCHAR(100)",
            "address_postal_code": "VARCHAR(20)",
            "address_country": "VARCHAR(100)",
        }

        for column_name, column_type in address_columns.items():
            if column_name not in columns:
                connection.exec_driver_sql(f"ALTER TABLE patients ADD COLUMN {column_name} {column_type}")

        if "ix_patients_phone_number" not in indexes:
            connection.exec_driver_sql("CREATE UNIQUE INDEX IF NOT EXISTS ix_patients_phone_number ON patients (phone_number)")

        if "status" not in condition_assignment_columns:
            connection.exec_driver_sql("ALTER TABLE patient_condition_assignments ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'active'")

        if "notes" not in condition_assignment_columns:
            connection.exec_driver_sql("ALTER TABLE patient_condition_assignments ADD COLUMN notes TEXT")

        if "diagnosed_at" not in condition_assignment_columns:
            connection.exec_driver_sql("ALTER TABLE patient_condition_assignments ADD COLUMN diagnosed_at TIMESTAMP NOT NULL DEFAULT NOW()")


def normalize_patient_phone_numbers():
    with SessionLocal() as db:
        patients = db.query(Patient).all()
        did_change = False

        for patient in patients:
            try:
                normalized_phone_number = normalize_phone_number(patient.phone_number)
            except ValueError:
                normalized_phone_number = None

            if normalized_phone_number != patient.phone_number:
                patient.phone_number = normalized_phone_number
                did_change = True

            if patient.arrival_method not in {"ambulance", "self"}:
                patient.arrival_method = "self"
                did_change = True

            if patient.is_discharged is None:
                patient.is_discharged = False
                did_change = True

            if not patient.address_street:
                patient.address_street = "Unknown street"
                did_change = True

            if not patient.address_number:
                patient.address_number = "N/A"
                did_change = True

            if not patient.address_city:
                patient.address_city = "Unknown city"
                did_change = True

            if not patient.address_state:
                patient.address_state = "Unknown county"
                did_change = True

            if not patient.address_postal_code:
                patient.address_postal_code = "000000"
                did_change = True

            if patient.address_country != ROMANIA_COUNTRY:
                patient.address_country = ROMANIA_COUNTRY
                did_change = True

        doctors = db.query(Doctor).all()

        for doctor in doctors:
            try:
                normalized_phone_number = normalize_phone_number(doctor.phone_number)
            except ValueError:
                normalized_phone_number = None

            if normalized_phone_number != doctor.phone_number:
                doctor.phone_number = normalized_phone_number
                did_change = True

        if did_change:
            db.commit()


def normalize_doctor_defaults():
    with SessionLocal() as db:
        doctors = db.query(Doctor).all()
        did_change = False

        for doctor in doctors:
            if doctor.email_confirmed is None:
                doctor.email_confirmed = True
                did_change = True

            if doctor.pending_email == "":
                doctor.pending_email = None
                did_change = True

        if did_change:
            db.commit()


def cleanup_legacy_event_table():
    inspector = inspect(engine)

    if not inspector.has_table("events"):
        return

    dependent_tables = []
    for table_name in inspector.get_table_names():
        for foreign_key in inspector.get_foreign_keys(table_name):
            if foreign_key.get("referred_table") == "events":
                dependent_tables.append(table_name)

    if dependent_tables:
        print(f"Skipping drop of legacy events table due to dependencies: {', '.join(sorted(set(dependent_tables)))}")
        return

    with engine.begin() as connection:
        connection.exec_driver_sql("DROP TABLE IF EXISTS events")


def cleanup_legacy_medical_history_table():
    inspector = inspect(engine)

    if not inspector.has_table("patient_medical_history"):
        return

    with engine.begin() as connection:
        connection.exec_driver_sql("DROP TABLE IF EXISTS patient_medical_history")


def sync_conditions_from_drugs():
    with SessionLocal() as db:
        existing_conditions = {
            condition.name: condition
            for condition in db.query(PatientCondition).all()
        }
        did_change = False

        for name in CONDITIONS:
            if name in existing_conditions:
                continue

            db.add(PatientCondition(
                name=name,
                status="active" if "active" in STATUS else STATUS[0],
            ))
            did_change = True

        if did_change:
            db.commit()


def init_db():
    Base.metadata.create_all(bind=engine)
    ensure_doctor_columns()
    ensure_patient_columns()
    cleanup_legacy_event_table()
    cleanup_legacy_medical_history_table()
    sync_conditions_from_drugs()
    normalize_doctor_defaults()
    normalize_patient_phone_numbers()
