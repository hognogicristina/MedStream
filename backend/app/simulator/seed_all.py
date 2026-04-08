from app.db.init_db import init_db
from app.simulator.seed import run as run_patient_seed
from app.simulator.seed_doctors import run as run_doctor_seed


def run():
    init_db()
    run_doctor_seed()
    run_patient_seed()
    print("Seeded MedStream demo data")


if __name__ == "__main__":
    run()
