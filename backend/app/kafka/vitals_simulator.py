import time

from app.core.config import settings
from app.db.session import SessionLocal
from app.kafka.producer import send_message
from app.models.patient import Patient
from app.simulator.patient_profiles import generate_vitals, pick_profile


def load_patients():
    with SessionLocal() as db:
        return db.query(Patient).all()


def run():
    while True:
        try:
            patients = load_patients()

            patient_profiles = {
                p.id: pick_profile() for p in patients
            }

            print("Assigned profiles:")
            for pid, profile in patient_profiles.items():
                print(f"Patient {pid}: {profile['name']}")

            while True:
                try:
                    refreshed_patients = load_patients()

                    if len(refreshed_patients) != len(patients):
                        patients = refreshed_patients
                        for patient in patients:
                            if patient.id not in patient_profiles:
                                patient_profiles[patient.id] = pick_profile()
                    else:
                        patients = refreshed_patients

                    for patient in patients:
                        profile = patient_profiles[patient.id]

                        vitals = generate_vitals(profile)

                        payload = {
                            "patient_id": patient.id,
                            **vitals,
                        }

                        send_message(settings.kafka_vitals_topic, payload)

                        print(f"P{patient.id} ({profile['name']}):", payload)

                    time.sleep(2)
                except Exception as e:
                    print("Simulator error:", e)
                    time.sleep(2)
        except Exception as e:
            print("Simulator restart after error:", e)
            time.sleep(5)


if __name__ == "__main__":
    run()
