from datetime import date

from sqlalchemy import delete

from app.api.doctors import pwd_context
from app.db.session import SessionLocal
from app.models.doctor import Doctor
from app.models.doctor_password_reset import DoctorPasswordReset
from app.models.doctor_patient import doctor_patients

SEED = 20260411
DOCTOR_COUNT = 12
PASSWORD = "password123"
FIRST_NAMES = [
    "Elena", "Mihnea", "Maria", "Victor", "Andrei", "Cristina",
    "Ioana", "Razvan", "Radu", "Ana", "Silvia", "Paul",
]
LAST_NAMES = [
    "Popescu", "Ionescu", "Georgescu", "Neacsu", "Petrescu", "Marin",
    "Dumitrescu", "Tudor", "Matei", "Stanciu", "Dobre", "Enescu",
]
SPECIALIZATIONS = [
    "Medicina de urgenta", "Medicina de urgenta", "Terapie intensiva", "Terapie intensiva",
    "Cardiologie", "Cardiologie", "Medicina interna", "Medicina interna",
    "Neurologie", "Neurologie", "Medicina generala", "Medicina spitaliceasca",
]


def generate_doctor_payload(index: int):
    first_name = FIRST_NAMES[(index - 1) % len(FIRST_NAMES)]
    last_name = LAST_NAMES[(index - 1) % len(LAST_NAMES)]
    slug = f"{first_name}.{last_name}".lower()
    return {
        "first_name": first_name,
        "last_name": last_name,
        "email": f"{slug}.{index}@medstream.local",
        "specialization": SPECIALIZATIONS[(index - 1) % len(SPECIALIZATIONS)],
        "license_number": f"DOC-{1000 + index}",
        "phone_number": f"07{50 + ((index - 1) % 10)}{index:06d}",
        "birth_date": date(1975 + (index % 18), ((index - 1) % 12) + 1, ((index - 1) % 28) + 1),
    }


def run():
    generated_doctors = [generate_doctor_payload(index) for index in range(1, DOCTOR_COUNT + 1)]

    with SessionLocal() as db:
        db.execute(delete(doctor_patients))
        db.execute(delete(DoctorPasswordReset))
        db.execute(delete(Doctor))

        for payload in generated_doctors:
            db.add(
                Doctor(
                    first_name=payload["first_name"],
                    last_name=payload["last_name"],
                    email=payload["email"],
                    pending_email=None,
                    email_confirmed=True,
                    phone_number=payload["phone_number"],
                    birth_date=payload["birth_date"],
                    password_hash=pwd_context.hash(PASSWORD),
                    specialization=payload["specialization"],
                    license_number=payload["license_number"],
                )
            )

        db.commit()

    print(f"Generated {DOCTOR_COUNT} doctors")


if __name__ == "__main__":
    run()
