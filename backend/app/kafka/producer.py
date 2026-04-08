import json

from confluent_kafka import Producer

from app.kafka.config import get_kafka_config

producer = Producer(get_kafka_config())


def send_message(topic: str, payload: dict):
    producer.produce(topic, json.dumps(payload).encode("utf-8"))
    producer.flush()
