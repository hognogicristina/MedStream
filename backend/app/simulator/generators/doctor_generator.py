from __future__ import annotations

import random
from datetime import date

from faker import Faker

fake = Faker("ro_RO")


def generate_doctor_payloads(
        *,
        count: int,
        departments: list[str],
        password_hash: str,
) -> list[dict]:
    payloads: list[dict] = []

    for dept in departments:
        payloads.append(
            {
                "first_name": fake.first_name(),
                "last_name": fake.last_name(),
                "email": f"{dept.lower()}_{random.randint(1000, 9999)}@med.local",
                "password_hash": password_hash,
                "specialization": dept,
                "license_number": f"LIC-{random.randint(10000, 99999)}",
                "phone_number": f"+407{random.randint(1000000, 9999999)}",
                "birth_date": fake.date_of_birth(minimum_age=25, maximum_age=70),
            }
        )

    remaining = max(0, count - len(departments))
    for index in range(remaining):
        dept = random.choice(departments)
        payloads.append(
            {
                "first_name": fake.first_name(),
                "last_name": fake.last_name(),
                "email": f"doctor_extra_{index}@med.local",
                "password_hash": password_hash,
                "specialization": dept,
                "license_number": f"LIC-{20000 + index}",
                "phone_number": f"+407{random.randint(1000000, 9999999)}",
                "birth_date": fake.date_of_birth(minimum_age=25, maximum_age=70),
            }
        )

    return payloads
