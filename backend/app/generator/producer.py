import json
import random
import time
from datetime import datetime, timezone

from faker import Faker
from kafka import KafkaProducer


fake = Faker()
TOPIC_NAME = "vital_signs"
KAFKA_BOOTSTRAP_SERVERS = ["localhost:9092"]
PATIENT_COUNT = 10


def generate_patient(patient_id: int) -> dict:
    condition = random.choices(
        ["cardiac", "respiratory", "normal"],
        weights=[0.25, 0.25, 0.5],
        k=1,
    )[0]

    return {
        "patient_id": patient_id,
        "name": fake.name(),
        "age": random.randint(18, 90),
        "condition": condition,
    }


def generate_vital_signs(condition: str) -> dict:
    if condition == "cardiac":
        heart_rate = random.randint(100, 130)
        oxygen = random.randint(95, 100)
        temperature = round(random.uniform(36.8, 37.8), 1)
    elif condition == "respiratory":
        heart_rate = random.randint(80, 105)
        oxygen = random.randint(88, 94)
        temperature = round(random.uniform(36.7, 38.0), 1)
    else:
        heart_rate = random.randint(65, 85)
        oxygen = random.randint(97, 100)
        temperature = round(random.uniform(36.5, 37.2), 1)

    return {
        "heart_rate": heart_rate,
        "oxygen": oxygen,
        "temperature": temperature,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def build_message(patient: dict) -> dict:
    vital_signs = generate_vital_signs(patient["condition"])

    return {
        "patient_id": patient["patient_id"],
        "heart_rate": vital_signs["heart_rate"],
        "oxygen": vital_signs["oxygen"],
        "temperature": vital_signs["temperature"],
        "condition": patient["condition"],
        "timestamp": vital_signs["timestamp"],
    }


def main() -> None:
    patients = [generate_patient(patient_id=index) for index in range(1, PATIENT_COUNT + 1)]

    producer = KafkaProducer(
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        value_serializer=lambda value: json.dumps(value).encode("utf-8"),
    )

    print(f"Sending vital signs to Kafka topic '{TOPIC_NAME}' on localhost:9092")

    try:
        while True:
            patient = random.choice(patients)
            message = build_message(patient)
            producer.send(TOPIC_NAME, value=message).get(timeout=10)
            print(json.dumps(message))
            time.sleep(1)
    except KeyboardInterrupt:
        print("Producer stopped.")
    finally:
        producer.flush()
        producer.close()


if __name__ == "__main__":
    main()
