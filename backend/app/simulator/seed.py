from datetime import date

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.encounter import Encounter
from app.models.patient import Patient

SEED_PATIENTS = [
    {"first_name": "Ion", "last_name": "Marinescu", "department": "ER", "cnp": "6010101123451", "birth_date": date(1960, 1, 1),
     "gender": "male", "condition": "cardiac risk", "encounter_type": "emergency", "chief_complaint": "Acute chest pain and diaphoresis"},
    {"first_name": "Ana", "last_name": "Dobre", "department": "ER", "cnp": "6940305223452", "birth_date": date(1994, 3, 5),
     "gender": "female", "condition": "fever/infection", "encounter_type": "emergency",
     "chief_complaint": "High fever with productive cough"},
    {"first_name": "Mihai", "last_name": "Stoica", "department": "ER", "cnp": "5850729143453", "birth_date": date(1985, 7, 29),
     "gender": "male", "condition": "respiratory distress", "encounter_type": "emergency",
     "chief_complaint": "Shortness of breath and wheezing"},
    {"first_name": "Elena", "last_name": "Barbu", "department": "ER", "cnp": "7021112183454", "birth_date": date(2002, 11, 12),
     "gender": "female", "condition": "healthy monitoring", "encounter_type": "observation",
     "chief_complaint": "Post-fall observation with stable vitals"},
    {"first_name": "Vasile", "last_name": "Toma", "department": "ER", "cnp": "5780415263455", "birth_date": date(1978, 4, 15),
     "gender": "male", "condition": "cardiac risk", "encounter_type": "emergency",
     "chief_complaint": "Palpitations and uncontrolled hypertension"},
    {"first_name": "Ioana", "last_name": "Rusu", "department": "ER", "cnp": "6990921333456", "birth_date": date(1999, 9, 21),
     "gender": "female", "condition": "fever/infection", "encounter_type": "emergency",
     "chief_complaint": "Persistent fever and flank pain"},
    {"first_name": "Sorin", "last_name": "Dima", "department": "ICU", "cnp": "5710219073457", "birth_date": date(1971, 2, 19),
     "gender": "male", "condition": "respiratory distress", "encounter_type": "critical_care",
     "chief_complaint": "Acute hypoxemic respiratory failure"},
    {"first_name": "Gabriela", "last_name": "Ilie", "department": "ICU", "cnp": "6630616143458", "birth_date": date(1963, 6, 16),
     "gender": "female", "condition": "post-treatment stabilization", "encounter_type": "critical_care",
     "chief_complaint": "Hemodynamic monitoring after sepsis treatment"},
    {"first_name": "Petru", "last_name": "Nistor", "department": "ICU", "cnp": "5541220053459", "birth_date": date(1954, 12, 20),
     "gender": "male", "condition": "cardiac risk", "encounter_type": "critical_care",
     "chief_complaint": "Post-infarction monitoring with arrhythmia risk"},
    {"first_name": "Cristina", "last_name": "Enache", "department": "ICU", "cnp": "6880811273460", "birth_date": date(1988, 8, 11),
     "gender": "female", "condition": "post-treatment stabilization", "encounter_type": "critical_care",
     "chief_complaint": "Post-operative stabilization after abdominal surgery"},
    {"first_name": "Nicolae", "last_name": "Stan", "department": "ICU", "cnp": "5490310323461", "birth_date": date(1949, 3, 10),
     "gender": "male", "condition": "respiratory distress", "encounter_type": "critical_care",
     "chief_complaint": "COPD exacerbation requiring high-flow oxygen"},
    {"first_name": "Raluca", "last_name": "Munteanu", "department": "ICU", "cnp": "6911019443462", "birth_date": date(1991, 10, 19),
     "gender": "female", "condition": "fever/infection", "encounter_type": "critical_care",
     "chief_complaint": "Complicated pneumonia with oxygen support"},
    {"first_name": "Andrei", "last_name": "Gheorghe", "department": "Cardiology", "cnp": "5760506083463", "birth_date": date(1976, 5, 6),
     "gender": "male", "condition": "cardiac risk", "encounter_type": "specialty_admission",
     "chief_complaint": "Telemetry admission for unstable angina"},
    {"first_name": "Monica", "last_name": "Preda", "department": "Cardiology", "cnp": "6681217153464", "birth_date": date(1968, 12, 17),
     "gender": "female", "condition": "post-treatment stabilization", "encounter_type": "specialty_admission",
     "chief_complaint": "Recovery after coronary intervention"},
    {"first_name": "Florin", "last_name": "Luca", "department": "Cardiology", "cnp": "5580704213465", "birth_date": date(1958, 7, 4),
     "gender": "male", "condition": "cardiac risk", "encounter_type": "specialty_admission",
     "chief_complaint": "Heart failure optimization and telemetry"},
    {"first_name": "Daniela", "last_name": "Sandu", "department": "Cardiology", "cnp": "6970222283466", "birth_date": date(1997, 2, 22),
     "gender": "female", "condition": "healthy monitoring", "encounter_type": "observation",
     "chief_complaint": "Palpitation workup with stable observation"},
    {"first_name": "Tudor", "last_name": "Voicu", "department": "Cardiology", "cnp": "5620918393467", "birth_date": date(1962, 9, 18),
     "gender": "male", "condition": "cardiac risk", "encounter_type": "specialty_admission",
     "chief_complaint": "Atrial fibrillation rate control monitoring"},
    {"first_name": "Bianca", "last_name": "Cojocaru", "department": "Cardiology", "cnp": "6840411463468", "birth_date": date(1984, 4, 11),
     "gender": "female", "condition": "post-treatment stabilization", "encounter_type": "specialty_admission",
     "chief_complaint": "Observation after syncope evaluation"},
    {"first_name": "Victor", "last_name": "Pavel", "department": "Internal Medicine", "cnp": "5700109533469",
     "birth_date": date(1970, 1, 9), "gender": "male", "condition": "fever/infection", "encounter_type": "medical_admission",
     "chief_complaint": "Pyelonephritis with dehydration"},
    {"first_name": "Adina", "last_name": "Petrescu", "department": "Internal Medicine", "cnp": "6750823603470",
     "birth_date": date(1975, 8, 23), "gender": "female", "condition": "healthy monitoring", "encounter_type": "medical_admission",
     "chief_complaint": "Electrolyte monitoring after medication adjustment"},
    {"first_name": "Marius", "last_name": "Dragan", "department": "Internal Medicine", "cnp": "5601117713471",
     "birth_date": date(1960, 11, 17), "gender": "male", "condition": "post-treatment stabilization", "encounter_type": "medical_admission",
     "chief_complaint": "Recovery after treated gastrointestinal bleed"},
    {"first_name": "Simona", "last_name": "Lazarescu", "department": "Internal Medicine", "cnp": "6930610823472",
     "birth_date": date(1993, 6, 10), "gender": "female", "condition": "fever/infection", "encounter_type": "medical_admission",
     "chief_complaint": "Cellulitis requiring IV antibiotics"},
    {"first_name": "Cornel", "last_name": "Neagu", "department": "Internal Medicine", "cnp": "5511224933473",
     "birth_date": date(1951, 12, 24), "gender": "male", "condition": "cardiac risk", "encounter_type": "medical_admission",
     "chief_complaint": "Blood pressure instability with renal disease"},
    {"first_name": "Larisa", "last_name": "Stefan", "department": "Internal Medicine", "cnp": "6860311043474",
     "birth_date": date(1986, 3, 11), "gender": "female", "condition": "healthy monitoring", "encounter_type": "observation",
     "chief_complaint": "Observation for anemia workup and hydration"},
    {"first_name": "Bogdan", "last_name": "Avram", "department": "Neurology", "cnp": "5590717153475", "birth_date": date(1959, 7, 17),
     "gender": "male", "condition": "post-treatment stabilization", "encounter_type": "specialty_admission",
     "chief_complaint": "Post-stroke neuro checks after thrombolysis"},
    {"first_name": "Oana", "last_name": "Manole", "department": "Neurology", "cnp": "6920213263476", "birth_date": date(1992, 2, 13),
     "gender": "female", "condition": "healthy monitoring", "encounter_type": "observation",
     "chief_complaint": "Migraine observation with stable examination"},
    {"first_name": "Dorin", "last_name": "Apostol", "department": "Neurology", "cnp": "5641002373477", "birth_date": date(1964, 10, 2),
     "gender": "male", "condition": "cardiac risk", "encounter_type": "specialty_admission",
     "chief_complaint": "TIA observation with secondary prevention workup"},
    {"first_name": "Camelia", "last_name": "Florea", "department": "Neurology", "cnp": "6810408483478", "birth_date": date(1981, 4, 8),
     "gender": "female", "condition": "fever/infection", "encounter_type": "specialty_admission",
     "chief_complaint": "Meningeal symptoms under infectious evaluation"},
    {"first_name": "Ilie", "last_name": "Serban", "department": "Neurology", "cnp": "5530915593479", "birth_date": date(1953, 9, 15),
     "gender": "male", "condition": "post-treatment stabilization", "encounter_type": "specialty_admission",
     "chief_complaint": "Seizure monitoring after medication loading"},
    {"first_name": "Teodora", "last_name": "Mateescu", "department": "Neurology", "cnp": "6961227703480", "birth_date": date(1996, 12, 27),
     "gender": "female", "condition": "healthy monitoring", "encounter_type": "observation",
     "chief_complaint": "Concussion observation with serial neuro exams"},
    {"first_name": "Gheorghe", "last_name": "Iacob", "department": "Ward", "cnp": "5480511813481", "birth_date": date(1948, 5, 11),
     "gender": "male", "condition": "post-treatment stabilization", "encounter_type": "inpatient",
     "chief_complaint": "Step-down recovery after pneumonia treatment"},
    {"first_name": "Alina", "last_name": "Mocanu", "department": "Ward", "cnp": "6900818923482", "birth_date": date(1990, 8, 18),
     "gender": "female", "condition": "healthy monitoring", "encounter_type": "inpatient",
     "chief_complaint": "Routine postpartum monitoring"},
    {"first_name": "George", "last_name": "Pop", "department": "Ward", "cnp": "5570222033483", "birth_date": date(1957, 2, 22),
     "gender": "male", "condition": "cardiac risk", "encounter_type": "inpatient",
     "chief_complaint": "Step-down telemetry after hypertensive urgency"},
    {"first_name": "Madalina", "last_name": "Balan", "department": "Ward", "cnp": "6850615143484", "birth_date": date(1985, 6, 15),
     "gender": "female", "condition": "fever/infection", "encounter_type": "inpatient",
     "chief_complaint": "Observation after treated urinary infection"},
    {"first_name": "Paul", "last_name": "Ciobanu", "department": "Ward", "cnp": "5611119253485", "birth_date": date(1961, 11, 19),
     "gender": "male", "condition": "post-treatment stabilization", "encounter_type": "inpatient",
     "chief_complaint": "Recovery after abdominal infection control"},
    {"first_name": "Irina", "last_name": "Toader", "department": "Ward", "cnp": "6980320363486", "birth_date": date(1998, 3, 20),
     "gender": "female", "condition": "healthy monitoring", "encounter_type": "observation",
     "chief_complaint": "Hydration and reassessment after resolved gastroenteritis"},
]


def upsert_patient(db, payload):
    patient = db.execute(select(Patient).where(Patient.cnp == payload["cnp"])).scalar_one_or_none()
    patient_fields = {
        "first_name": payload["first_name"],
        "last_name": payload["last_name"],
        "department": payload["department"],
        "cnp": payload["cnp"],
        "birth_date": payload["birth_date"],
        "gender": payload["gender"],
    }

    if patient is None:
        patient = Patient(**patient_fields)
        db.add(patient)
        db.flush()
    else:
        for field, value in patient_fields.items():
            setattr(patient, field, value)

    return patient


def upsert_encounter(db, patient, payload):
    encounter = db.execute(select(Encounter).where(Encounter.patient_id == patient.id)).scalar_one_or_none()

    if encounter is None:
        encounter = Encounter(
            patient_id=patient.id,
            doctor_id=None,
            encounter_type=payload["encounter_type"],
            chief_complaint=f'{payload["condition"].title()}: {payload["chief_complaint"]}',
            status="open",
        )
        db.add(encounter)
        return

    encounter.encounter_type = payload["encounter_type"]
    encounter.chief_complaint = f'{payload["condition"].title()}: {payload["chief_complaint"]}'
    encounter.status = "open"


def run():
    with SessionLocal() as db:
        for payload in SEED_PATIENTS:
            patient = upsert_patient(db, payload)
            upsert_encounter(db, patient, payload)

        db.commit()

    print(f"Seeded {len(SEED_PATIENTS)} patients")


if __name__ == "__main__":
    run()
