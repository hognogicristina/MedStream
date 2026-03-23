import json
from typing import Any

from kafka import KafkaConsumer

from app.streaming.alert_engine import AlertEngine


TOPIC_NAME = "vital_signs"
KAFKA_BOOTSTRAP_SERVERS = ["localhost:9092"]
CONSUMER_GROUP_ID = "medstream-alert-consumer"


def parse_event(raw_message: bytes | None) -> dict[str, Any] | None:
    if raw_message is None:
        return None

    try:
        event = json.loads(raw_message.decode("utf-8"))
        if not isinstance(event, dict):
            print("Skipping Kafka message because it is not a JSON object.")
            return None
        return event
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        print(f"Failed to parse Kafka message: {exc}")
        return None


def main() -> None:
    print(f"Connecting to Kafka at {KAFKA_BOOTSTRAP_SERVERS[0]}")
    consumer = KafkaConsumer(
        TOPIC_NAME,
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        group_id=CONSUMER_GROUP_ID,
        auto_offset_reset="latest",
        enable_auto_commit=True,
    )
    alert_engine = AlertEngine()

    print(f"Subscribed to topic '{TOPIC_NAME}'. Waiting for vital signs...")

    try:
        for message in consumer:
            event = parse_event(message.value)
            if event is None:
                continue

            print(f"Received event: {event}")
            alerts = alert_engine.process_event(event)

            for alert in alerts:
                print(f"ALERT TRIGGERED: {alert}")
    except KeyboardInterrupt:
        print("Consumer stopped.")
    finally:
        consumer.close()
        print("Kafka consumer connection closed.")


if __name__ == "__main__":
    main()
