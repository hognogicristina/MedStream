import time
from datetime import datetime

from app.core.config import settings
from app.kafka.producer import send_message

PATIENT_ID = 1

PHASES = [
    {
        "name": "ambulance_arrival",
        "event_type": "ambulance_arrival",
        "message": "Ambulance arrival: patient reports severe chest pain.",
        "samples": [
            {"heart_rate": 102, "oxygen_saturation": 96, "temperature": 37, "systolic_bp": 148, "diastolic_bp": 92},
            {"heart_rate": 106, "oxygen_saturation": 95, "temperature": 37, "systolic_bp": 150, "diastolic_bp": 94},
            {"heart_rate": 110, "oxygen_saturation": 95, "temperature": 37, "systolic_bp": 152, "diastolic_bp": 94},
            {"heart_rate": 114, "oxygen_saturation": 94, "temperature": 37, "systolic_bp": 154, "diastolic_bp": 96},
        ],
    },
    {
        "name": "er_intake",
        "event_type": "er_intake",
        "message": "ER intake started for chest pain evaluation.",
        "samples": [
            {"heart_rate": 112, "oxygen_saturation": 94, "temperature": 37, "systolic_bp": 150, "diastolic_bp": 92},
            {"heart_rate": 118, "oxygen_saturation": 93, "temperature": 37, "systolic_bp": 148, "diastolic_bp": 90},
            {"heart_rate": 122, "oxygen_saturation": 92, "temperature": 38, "systolic_bp": 146, "diastolic_bp": 90},
            {"heart_rate": 126, "oxygen_saturation": 92, "temperature": 38, "systolic_bp": 144, "diastolic_bp": 88},
        ],
    },
    {
        "name": "critical_vitals",
        "event_type": "critical_vitals",
        "message": "Critical vitals phase: worsening chest pain and hypoxia.",
        "samples": [
            {"heart_rate": 132, "oxygen_saturation": 91, "temperature": 38, "systolic_bp": 142, "diastolic_bp": 88},
            {"heart_rate": 138, "oxygen_saturation": 89, "temperature": 38, "systolic_bp": 140, "diastolic_bp": 86},
            {"heart_rate": 145, "oxygen_saturation": 88, "temperature": 39, "systolic_bp": 138, "diastolic_bp": 84},
            {"heart_rate": 148, "oxygen_saturation": 87, "temperature": 39, "systolic_bp": 136, "diastolic_bp": 82},
            {"heart_rate": 144, "oxygen_saturation": 88, "temperature": 39, "systolic_bp": 136, "diastolic_bp": 82},
            {"heart_rate": 140, "oxygen_saturation": 89, "temperature": 38, "systolic_bp": 138, "diastolic_bp": 84},
        ],
    },
    {
        "name": "treatment_started",
        "event_type": "treatment_started",
        "message": "Treatment started: oxygen, monitoring, and medication initiated.",
        "samples": [
            {"heart_rate": 136, "oxygen_saturation": 89, "temperature": 38, "systolic_bp": 138, "diastolic_bp": 84},
            {"heart_rate": 130, "oxygen_saturation": 90, "temperature": 38, "systolic_bp": 136, "diastolic_bp": 82},
            {"heart_rate": 124, "oxygen_saturation": 91, "temperature": 38, "systolic_bp": 134, "diastolic_bp": 82},
            {"heart_rate": 118, "oxygen_saturation": 92, "temperature": 38, "systolic_bp": 132, "diastolic_bp": 80},
            {"heart_rate": 112, "oxygen_saturation": 93, "temperature": 37, "systolic_bp": 130, "diastolic_bp": 80},
        ],
    },
    {
        "name": "icu_transfer",
        "event_type": "transferred_to_icu",
        "message": "Transferred to ICU for continued observation.",
        "samples": [
            {"heart_rate": 118, "oxygen_saturation": 92, "temperature": 37, "systolic_bp": 130, "diastolic_bp": 80},
            {"heart_rate": 116, "oxygen_saturation": 93, "temperature": 37, "systolic_bp": 128, "diastolic_bp": 78},
            {"heart_rate": 112, "oxygen_saturation": 94, "temperature": 37, "systolic_bp": 126, "diastolic_bp": 78},
            {"heart_rate": 108, "oxygen_saturation": 95, "temperature": 37, "systolic_bp": 124, "diastolic_bp": 76},
        ],
    },
    {
        "name": "stabilization",
        "event_type": "patient_stabilized",
        "message": "Patient stabilized with improving oxygenation and heart rate.",
        "samples": [
            {"heart_rate": 104, "oxygen_saturation": 95, "temperature": 37, "systolic_bp": 124, "diastolic_bp": 78},
            {"heart_rate": 100, "oxygen_saturation": 96, "temperature": 37, "systolic_bp": 122, "diastolic_bp": 76},
            {"heart_rate": 96, "oxygen_saturation": 97, "temperature": 37, "systolic_bp": 120, "diastolic_bp": 76},
            {"heart_rate": 92, "oxygen_saturation": 97, "temperature": 37, "systolic_bp": 118, "diastolic_bp": 74},
            {"heart_rate": 88, "oxygen_saturation": 98, "temperature": 37, "systolic_bp": 118, "diastolic_bp": 74},
        ],
    },
    {
        "name": "recovery",
        "event_type": "recovery",
        "message": "Recovery phase: chest pain resolved and vitals near baseline.",
        "samples": [
            {"heart_rate": 86, "oxygen_saturation": 98, "temperature": 37, "systolic_bp": 118, "diastolic_bp": 74},
            {"heart_rate": 84, "oxygen_saturation": 98, "temperature": 36, "systolic_bp": 116, "diastolic_bp": 72},
            {"heart_rate": 82, "oxygen_saturation": 99, "temperature": 36, "systolic_bp": 116, "diastolic_bp": 72},
            {"heart_rate": 80, "oxygen_saturation": 99, "temperature": 36, "systolic_bp": 114, "diastolic_bp": 70},
            {"heart_rate": 78, "oxygen_saturation": 99, "temperature": 36, "systolic_bp": 114, "diastolic_bp": 70},
        ],
    },
]


def send_event(event_type, message):
    payload = {
        "patient_id": PATIENT_ID,
        "event_type": event_type,
        "message": message,
        "timestamp": datetime.utcnow().isoformat(),
    }

    send_message(settings.kafka_events_topic, payload)
    print("Sent event:", payload)


def send_vital(sample):
    payload = {
        "patient_id": PATIENT_ID,
        **sample,
    }

    send_message(settings.kafka_vitals_topic, payload)
    print("Sent vital:", payload)


def should_transfer_to_icu(samples):
    return any(sample["heart_rate"] >= 140 or sample["oxygen_saturation"] <= 89 for sample in samples)


def run():
    print("Starting ambulance scenario simulation...")

    for phase in PHASES:
        if phase["name"] == "icu_transfer" and not should_transfer_to_icu(PHASES[2]["samples"]):
            continue

        print(f"Phase: {phase['name']}")
        send_event(phase["event_type"], phase["message"])

        for sample in phase["samples"]:
            send_vital(sample)
            time.sleep(1)

    print("Scenario completed")


if __name__ == "__main__":
    run()
