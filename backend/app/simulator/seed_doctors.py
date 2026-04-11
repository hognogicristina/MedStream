from datetime import date
import random

from sqlalchemy import delete

from app.api.doctors import pwd_context
from app.db.session import SessionLocal
from app.models.doctor import Doctor
from app.models.doctor_password_reset import DoctorPasswordReset
from app.models.doctor_patient import doctor_patients
from faker import Faker

def get_fake(rng):
    Faker.seed(rng.randint(1, 999999))
    return Faker("ro_RO")

SEED = 20260411
DOCTOR_COUNT = 12
PASSWORD = "password123"

SPECIALIZATIONS = [
    "Cardiology",
    "Dermatology",
    "Endocrinology",
    "Gastroenterology",
    "Neurology",
    "Oncology",
    "Pediatrics",
    "Psychiatry",
    "Radiology",
]
def generate_name(rng):
    Faker.seed(rng.randint(1, 999999))

    first_name = fake.first_name()
    last_name = fake.last_name()

    return first_name, last_name


def build_rng(seed_suffix: str):
    return random.Random(f"{SEED}:{seed_suffix}")


def generate_doctor_payload(index: int):
    rng = build_rng(f"patient:{index}")
    fake = get_fake(rng)
    first_name = fake.first_name()
    last_name = fake.last_name()
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
