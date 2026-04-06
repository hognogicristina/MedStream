from faker import Faker

from app.db.session import SessionLocal
from app.models.patient import Patient

fake = Faker()
departments = ("ER", "ICU", "Ward")


def run():
    with SessionLocal() as db:
        for _ in range(10):
            patient = Patient(
                first_name=fake.first_name(),
                last_name=fake.last_name(),
                department=fake.random_element(elements=departments),
                cnp=str(fake.random_number(digits=13)),
                birth_date=fake.date_of_birth(minimum_age=18, maximum_age=90),
                gender=fake.random_element(elements=("male", "female")),
            )

            db.add(patient)

        db.commit()

    print("Seeded patients")


if __name__ == "__main__":
    run()
