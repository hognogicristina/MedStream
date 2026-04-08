from sqlalchemy import inspect

from app.db.base import Base
from app.db.session import engine
from app.models import Alert, Doctor, DoctorPasswordReset, Encounter, MedicationAdministration, Patient, Vital, doctor_patients


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

        if "ix_doctors_phone_number" not in indexes:
            connection.exec_driver_sql("CREATE UNIQUE INDEX IF NOT EXISTS ix_doctors_phone_number ON doctors (phone_number)")


def init_db():
    Base.metadata.create_all(bind=engine)
    ensure_doctor_columns()
