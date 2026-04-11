from sqlalchemy import inspect

from app.db.base import Base
from app.db.session import engine
from app.models import Alert, Doctor, DoctorPasswordReset, Encounter, MedicationAdministration, Patient, Vital, doctor_patients
from app.db.session import SessionLocal
from app.schemas.validators import ROMANIA_COUNTRY, normalize_phone_number


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

    with engine.begin() as connection:
        if "phone_number" not in columns:
            connection.exec_driver_sql("ALTER TABLE patients ADD COLUMN phone_number VARCHAR(50)")

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


def init_db():
    Base.metadata.create_all(bind=engine)
    ensure_doctor_columns()
    ensure_patient_columns()
    normalize_doctor_defaults()
    normalize_patient_phone_numbers()
