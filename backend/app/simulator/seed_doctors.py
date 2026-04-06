from sqlalchemy import select

from app.api.doctors import pwd_context
from app.db.session import SessionLocal
from app.models.doctor import Doctor

DOCTORS = [
    {
        "first_name": "Elena",
        "last_name": "Popescu",
        "email": "elena.popescu@medstream.local",
        "specialization": "Emergency Medicine",
        "license_number": "DOC-1001",
    },
    {
        "first_name": "Andrei",
        "last_name": "Ionescu",
        "email": "andrei.ionescu@medstream.local",
        "specialization": "Cardiology",
        "license_number": "DOC-1002",
    },
    {
        "first_name": "Maria",
        "last_name": "Georgescu",
        "email": "maria.georgescu@medstream.local",
        "specialization": "Intensive Care",
        "license_number": "DOC-1003",
    },
    {
        "first_name": "Radu",
        "last_name": "Matei",
        "email": "radu.matei@medstream.local",
        "specialization": "Neurology",
        "license_number": "DOC-1004",
    },
    {
        "first_name": "Ioana",
        "last_name": "Dumitrescu",
        "email": "ioana.dumitrescu@medstream.local",
        "specialization": "Internal Medicine",
        "license_number": "DOC-1005",
    },
]

PASSWORD = "password123"


def run():
    with SessionLocal() as db:
        for payload in DOCTORS:
            existing_doctor = db.execute(select(Doctor).where(Doctor.email == payload["email"])).scalar_one_or_none()

            if existing_doctor is not None:
                continue

            doctor = Doctor(
                first_name=payload["first_name"],
                last_name=payload["last_name"],
                email=payload["email"],
                password_hash=pwd_context.hash(PASSWORD),
                specialization=payload["specialization"],
                license_number=payload["license_number"],
            )

            db.add(doctor)

        db.commit()

    print("Seeded doctors")


if __name__ == "__main__":
    run()
