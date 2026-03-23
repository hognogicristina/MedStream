import os
import random
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import psycopg2
from psycopg2.extras import Json

import app.core.config  # noqa: F401
from app.generator.admission_generator import generate_admission
from app.generator.patient_generator import GeneratedPatient, generate_patients
from app.generator.treatment_generator import generate_treatments
from app.generator.vital_signs_generator import generate_vital_signs


DEFAULT_PATIENT_COUNT = 25

DEPARTMENTS = (
    {"name": "Cardiology", "bed_count": 36},
    {"name": "Pulmonology", "bed_count": 28},
    {"name": "Infectious Diseases", "bed_count": 32},
    {"name": "General Medicine", "bed_count": 40},
)

DOCTOR_SEED = (
    {"full_name": "Dr. Elena Popescu", "specialization": "Cardiology", "years_experience": 14, "salary": 17500.00, "department": "Cardiology"},
    {"full_name": "Dr. Andrei Ionescu", "specialization": "Cardiology", "years_experience": 9, "salary": 14800.00, "department": "Cardiology"},
    {"full_name": "Dr. Maria Dumitrescu", "specialization": "Pulmonology", "years_experience": 11, "salary": 16200.00, "department": "Pulmonology"},
    {"full_name": "Dr. Radu Marin", "specialization": "Pulmonology", "years_experience": 7, "salary": 13900.00, "department": "Pulmonology"},
    {"full_name": "Dr. Ioana Stan", "specialization": "Infectious Diseases", "years_experience": 12, "salary": 16800.00, "department": "Infectious Diseases"},
    {"full_name": "Dr. Mihai Georgescu", "specialization": "Infectious Diseases", "years_experience": 8, "salary": 14200.00, "department": "Infectious Diseases"},
    {"full_name": "Dr. Ana Pavel", "specialization": "Internal Medicine", "years_experience": 10, "salary": 15100.00, "department": "General Medicine"},
    {"full_name": "Dr. Victor Enache", "specialization": "Internal Medicine", "years_experience": 6, "salary": 13200.00, "department": "General Medicine"},
)

MEDICATION_SEED = (
    {"name": "Metoprolol", "type": "beta blocker", "manufacturer": "Pfizer", "standard_dosage": "25 mg oral"},
    {"name": "Furosemide", "type": "loop diuretic", "manufacturer": "Sanofi", "standard_dosage": "40 mg oral or IV"},
    {"name": "Aspirin", "type": "antiplatelet", "manufacturer": "Bayer", "standard_dosage": "81 mg oral"},
    {"name": "Salbutamol", "type": "bronchodilator", "manufacturer": "GSK", "standard_dosage": "2.5 mg nebulized"},
    {"name": "Budesonide", "type": "corticosteroid", "manufacturer": "AstraZeneca", "standard_dosage": "0.5 mg nebulized"},
    {"name": "Azithromycin", "type": "antibiotic", "manufacturer": "Pfizer", "standard_dosage": "500 mg oral"},
    {"name": "Ceftriaxone", "type": "antibiotic", "manufacturer": "Roche", "standard_dosage": "1 g IV"},
    {"name": "Paracetamol", "type": "analgesic", "manufacturer": "Sanofi", "standard_dosage": "500 mg oral"},
    {"name": "Normal Saline", "type": "intravenous fluid", "manufacturer": "Baxter", "standard_dosage": "500 mL IV"},
    {"name": "Omeprazole", "type": "proton pump inhibitor", "manufacturer": "Sandoz", "standard_dosage": "20 mg oral"},
)

CONDITION_TO_DEPARTMENT = {
    "cardiac": "Cardiology",
    "respiratory": "Pulmonology",
    "infectious": "Infectious Diseases",
    "normal": "General Medicine",
}

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "database" / "schema.sql"


def get_connection():
    database_url = os.getenv("DATABASE_URL")
    connection_kwargs = {}

    if database_url:
        connection_kwargs["dsn"] = database_url
    else:
        connection_kwargs = {
            "dbname": os.getenv("POSTGRES_DB") or os.getenv("PGDATABASE") or "medstream",
            "user": os.getenv("POSTGRES_USER") or os.getenv("PGUSER") or "postgres",
            "password": os.getenv("POSTGRES_PASSWORD") or os.getenv("PGPASSWORD") or "postgres",
            "host": os.getenv("POSTGRES_HOST") or os.getenv("PGHOST") or "localhost",
            "port": os.getenv("POSTGRES_PORT") or os.getenv("PGPORT") or "5432",
        }

    try:
        if "dsn" in connection_kwargs:
            return psycopg2.connect(connection_kwargs["dsn"])
        return psycopg2.connect(**connection_kwargs)
    except psycopg2.OperationalError as exc:
        raise RuntimeError(
            "Database connection failed. Set DATABASE_URL or configure POSTGRES_DB, "
            "POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_HOST, and POSTGRES_PORT in backend/.env."
        ) from exc


def ensure_schema(connection) -> None:
    if not SCHEMA_PATH.exists():
        raise FileNotFoundError(f"Schema file not found at {SCHEMA_PATH}")

    schema_sql = SCHEMA_PATH.read_text(encoding="utf-8")
    with connection.cursor() as cursor:
        cursor.execute(schema_sql)
    connection.commit()


def seed_departments(cursor) -> dict[str, int]:
    cursor.execute("SELECT id, name FROM departments")
    existing = {name: department_id for department_id, name in cursor.fetchall()}

    for department in DEPARTMENTS:
        if department["name"] in existing:
            continue
        cursor.execute(
            """
            INSERT INTO departments (name, bed_count)
            VALUES (%s, %s)
            RETURNING id
            """,
            (department["name"], department["bed_count"]),
        )
        existing[department["name"]] = cursor.fetchone()[0]

    return existing


def seed_doctors(cursor, department_lookup: dict[str, int]) -> list[dict]:
    cursor.execute(
        """
        SELECT doctors.id, doctors.full_name, doctors.specialization, doctors.department_id, departments.name
        FROM doctors
        JOIN departments ON departments.id = doctors.department_id
        """
    )
    existing_rows = cursor.fetchall()
    existing_by_name = {
        row[1]: {
            "id": row[0],
            "full_name": row[1],
            "specialization": row[2],
            "department_id": row[3],
            "department_name": row[4],
        }
        for row in existing_rows
    }

    for doctor in DOCTOR_SEED:
        if doctor["full_name"] in existing_by_name:
            continue
        cursor.execute(
            """
            INSERT INTO doctors (full_name, specialization, years_experience, salary, department_id)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, full_name, specialization, department_id
            """,
            (
                doctor["full_name"],
                doctor["specialization"],
                doctor["years_experience"],
                doctor["salary"],
                department_lookup[doctor["department"]],
            ),
        )
        row = cursor.fetchone()
        existing_by_name[row[1]] = {
            "id": row[0],
            "full_name": row[1],
            "specialization": row[2],
            "department_id": row[3],
            "department_name": doctor["department"],
        }

    return list(existing_by_name.values())


def seed_medications(cursor) -> dict[str, int]:
    cursor.execute("SELECT id, name FROM medications")
    medication_lookup = {name: medication_id for medication_id, name in cursor.fetchall()}

    for medication in MEDICATION_SEED:
        if medication["name"] in medication_lookup:
            continue
        cursor.execute(
            """
            INSERT INTO medications (name, type, manufacturer, standard_dosage)
            VALUES (%s, %s, %s, %s)
            RETURNING id
            """,
            (
                medication["name"],
                medication["type"],
                medication["manufacturer"],
                medication["standard_dosage"],
            ),
        )
        medication_lookup[medication["name"]] = cursor.fetchone()[0]

    return medication_lookup


def insert_patient(cursor, patient: GeneratedPatient) -> int:
    cursor.execute(
        """
        INSERT INTO patients (full_name, national_id, birth_date, sex, address, medical_history)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (
            patient.full_name,
            patient.national_id,
            patient.birth_date,
            patient.sex,
            patient.address,
            Json(
                {
                    "condition": patient.condition,
                    "generated_profile": True,
                    "risk_notes": [f"Primary monitoring pathway: {patient.condition}"],
                }
            ),
        ),
    )
    return cursor.fetchone()[0]


def select_doctor(doctors: list[dict], condition: str) -> dict:
    department_name = CONDITION_TO_DEPARTMENT[condition]
    department_doctors = [
        doctor for doctor in doctors if doctor["department_name"] == department_name
    ]
    if not department_doctors:
        raise ValueError(f"No doctors available for department '{department_name}'")
    return random.choice(department_doctors)


def insert_admission(cursor, patient_id: int, condition: str, doctors: list[dict]) -> dict:
    doctor = select_doctor(doctors, condition)
    admission = generate_admission(patient_id=patient_id, condition=condition, doctor=doctor)
    cursor.execute(
        """
        INSERT INTO admissions (patient_id, doctor_id, department_id, admission_date, initial_diagnosis)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id
        """,
        (
            admission.patient_id,
            admission.doctor_id,
            admission.department_id,
            admission.admission_date,
            admission.initial_diagnosis,
        ),
    )
    admission_id = cursor.fetchone()[0]
    return {
        "id": admission_id,
        "patient_id": patient_id,
        "doctor_id": admission.doctor_id,
        "department_id": admission.department_id,
        "admission_date": admission.admission_date,
        "condition": condition,
    }


def insert_treatments(cursor, admission: dict, medication_lookup: dict[str, int]) -> None:
    treatments = generate_treatments(
        admission_id=admission["id"],
        condition=admission["condition"],
        admission_date=admission["admission_date"].date(),
        medication_lookup=medication_lookup,
    )
    for treatment in treatments:
        cursor.execute(
            """
            INSERT INTO treatments (
                admission_id,
                medication_id,
                dosage,
                frequency_per_day,
                start_date,
                end_date
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                treatment.admission_id,
                treatment.medication_id,
                treatment.dosage,
                treatment.frequency_per_day,
                treatment.start_date,
                treatment.end_date,
            ),
        )


def insert_vital_sign(
    cursor,
    patient_id: int,
    admission_id: int,
    condition: str,
    recorded_at: datetime | None = None,
) -> dict:
    vital_signs = generate_vital_signs(
        condition,
        recorded_at=recorded_at or datetime.now(timezone.utc),
    )
    cursor.execute(
        """
        INSERT INTO vital_signs (
            patient_id,
            admission_id,
            heart_rate,
            oxygen_saturation,
            temperature,
            blood_pressure_systolic,
            blood_pressure_diastolic,
            respiratory_rate,
            recorded_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (
            patient_id,
            admission_id,
            vital_signs["heart_rate"],
            vital_signs["oxygen_saturation"],
            vital_signs["temperature"],
            vital_signs["blood_pressure_systolic"],
            vital_signs["blood_pressure_diastolic"],
            vital_signs["respiratory_rate"],
            vital_signs["recorded_at"],
        ),
    )
    vital_signs["id"] = cursor.fetchone()[0]
    return vital_signs


def generate_initial_dataset(cursor, patient_count: int) -> list[dict]:
    department_lookup = seed_departments(cursor)
    doctors = seed_doctors(cursor, department_lookup)
    medication_lookup = seed_medications(cursor)

    active_admissions: list[dict] = []
    for patient in generate_patients(patient_count):
        patient_id = insert_patient(cursor, patient)
        admission = insert_admission(cursor, patient_id, patient.condition, doctors)
        insert_treatments(cursor, admission, medication_lookup)
        initial_recorded_at = admission["admission_date"] + timedelta(
            minutes=random.randint(15, 180)
        )
        insert_vital_sign(
            admission_id=admission["id"],
            patient_id=patient_id,
            condition=patient.condition,
            cursor=cursor,
            recorded_at=initial_recorded_at,
        )
        active_admissions.append(admission)

    return active_admissions


def stream_vital_signs(connection, active_admissions: list[dict]) -> None:
    while True:
        with connection.cursor() as cursor:
            for admission in active_admissions:
                insert_vital_sign(
                    cursor=cursor,
                    patient_id=admission["patient_id"],
                    admission_id=admission["id"],
                    condition=admission["condition"],
                )
        connection.commit()
        time.sleep(1)


def main() -> None:
    patient_count = int(os.getenv("GENERATOR_PATIENT_COUNT", DEFAULT_PATIENT_COUNT))
    connection = get_connection()
    connection.autocommit = False

    try:
        ensure_schema(connection)
        with connection.cursor() as cursor:
            active_admissions = generate_initial_dataset(cursor, patient_count)
        connection.commit()
        stream_vital_signs(connection, active_admissions)
    except KeyboardInterrupt:
        connection.rollback()
    finally:
        connection.close()


if __name__ == "__main__":
    main()
