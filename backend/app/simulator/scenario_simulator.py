import time

from app.core.config import settings
from app.kafka.producer import send_message


PATIENT_ID = 1


PHASES = [
    {
        "name": "arrival",
        "duration": 5,
        "vitals": lambda: {
            "heart_rate": 120,
            "oxygen_saturation": 92,
            "temperature": 38,
        },
    },
    {
        "name": "critical",
        "duration": 10,
        "vitals": lambda: {
            "heart_rate": 145,
            "oxygen_saturation": 88,
            "temperature": 39,
        },
    },
    {
        "name": "treatment",
        "duration": 10,
        "vitals": lambda: {
            "heart_rate": 110,
            "oxygen_saturation": 93,
            "temperature": 38,
        },
    },
    {
        "name": "stabilizing",
        "duration": 10,
        "vitals": lambda: {
            "heart_rate": 95,
            "oxygen_saturation": 96,
            "temperature": 37,
        },
    },
    {
        "name": "recovery",
        "duration": 10,
        "vitals": lambda: {
            "heart_rate": 80,
            "oxygen_saturation": 98,
            "temperature": 36,
        },
    },
]


def run():
    print("Starting scenario simulation...")

    for phase in PHASES:
        print(f"Phase: {phase['name']}")

        for _ in range(phase["duration"]):
            vitals = phase["vitals"]()

            payload = {
                "patient_id": PATIENT_ID,
                **vitals,
                "systolic_bp": 130,
                "diastolic_bp": 85,
            }

            send_message(settings.kafka_vitals_topic, payload)

            print("Sent:", payload)

            time.sleep(1)

    print("Scenario completed")


if __name__ == "__main__":
    run()