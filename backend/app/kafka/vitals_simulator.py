import random
import time

from app.core.config import settings
from app.kafka.producer import send_message

PATIENT_IDS = [1]


def generate_vital(patient_id: int):
    return {
        "patient_id": patient_id,
        "heart_rate": random.randint(70, 140),
        "oxygen_saturation": random.randint(88, 100),
        "temperature": random.randint(36, 40),
        "systolic_bp": random.randint(100, 170),
        "diastolic_bp": random.randint(65, 110),
    }


def run():
    while True:
        for patient_id in PATIENT_IDS:
            payload = generate_vital(patient_id)
            send_message(settings.kafka_vitals_topic, payload)
            print("Produced:", payload)
        time.sleep(2)


if __name__ == "__main__":
    run()
