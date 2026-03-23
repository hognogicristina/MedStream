import random
from dataclasses import dataclass
from datetime import date

from faker import Faker


fake = Faker()

CONDITIONS = ("cardiac", "respiratory", "normal", "infectious")
SEXES = ("male", "female")


@dataclass(frozen=True)
class GeneratedPatient:
    full_name: str
    national_id: str
    birth_date: date
    sex: str
    address: str
    condition: str


def _generate_national_id() -> str:
    return "".join(str(random.randint(0, 9)) for _ in range(13))


def _pick_condition(age: int) -> str:
    if age >= 65:
        weights = (0.35, 0.20, 0.20, 0.25)
    elif age <= 12:
        weights = (0.05, 0.30, 0.35, 0.30)
    else:
        weights = (0.20, 0.25, 0.35, 0.20)
    return random.choices(CONDITIONS, weights=weights, k=1)[0]


def generate_patient() -> GeneratedPatient:
    sex = random.choice(SEXES)
    birth_date = fake.date_of_birth(minimum_age=0, maximum_age=95)
    age = date.today().year - birth_date.year

    if sex == "male":
        full_name = fake.name_male()
    else:
        full_name = fake.name_female()

    return GeneratedPatient(
        full_name=full_name,
        national_id=_generate_national_id(),
        birth_date=birth_date,
        sex=sex,
        address=fake.address().replace("\n", ", "),
        condition=_pick_condition(age),
    )


def generate_patients(count: int) -> list[GeneratedPatient]:
    seen_national_ids: set[str] = set()
    patients: list[GeneratedPatient] = []

    while len(patients) < count:
        patient = generate_patient()
        if patient.national_id in seen_national_ids:
            continue
        seen_national_ids.add(patient.national_id)
        patients.append(patient)

    return patients
