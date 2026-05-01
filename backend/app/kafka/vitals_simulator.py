import time

from app.core.config import settings
from app.db.session import SessionLocal
from app.kafka.producer import send_message
from app.models.patient import Patient
from app.simulator.patient_profiles import build_patient_state, generate_vitals


def load_patients():
    with SessionLocal() as db:
        return db.query(Patient).filter(Patient.is_discharged.is_(False)).all()


def run():
    while True:
        try:
            patients = load_patients()

            patient_states = {
                p.id: build_patient_state(p) for p in patients
            }

            while True:
                try:
                    refreshed_patients = load_patients()

                    patients = refreshed_patients
                    current_patient_ids = {patient.id for patient in patients}

                    patient_states = {
                        patient_id: state
                        for patient_id, state in patient_states.items()
                        if patient_id in current_patient_ids
                    }

                    for patient in patients:
                        if patient.id not in patient_states:
                            patient_states[patient.id] = build_patient_state(patient)
                            continue

                        if patient_states[patient.id]["department"] != patient.department:
                            patient_states[patient.id] = build_patient_state(patient)

                    for patient in patients:
                        if patient.is_discharged:
                            continue
                        state = patient_states[patient.id]

                        vitals = generate_vitals(state, patient.id)

                        payload = {
                            "patient_id": patient.id,
                            **vitals,
                        }

                        send_message(settings.kafka_vitals_topic, payload)

                    time.sleep(2)
                except Exception as e:
                    print("Simulator error:", e)
                    time.sleep(2)
        except Exception as e:
            print("Simulator restart after error:", e)
            time.sleep(5)


if __name__ == "__main__":
    run()
