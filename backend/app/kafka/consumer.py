import json
import time
import asyncio

from confluent_kafka import Consumer

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.alert import Alert
from app.models.vital import Vital

from app.websocket.manager import manager


def build_consumer():
    return Consumer(
        {
            "bootstrap.servers": settings.kafka_bootstrap_servers,
            "group.id": "medstream-vitals-consumer",
            "auto.offset.reset": "earliest",
        }
    )


def create_alerts(db, vital):
    alerts = []

    if vital.heart_rate > settings.heart_rate_alert_threshold:
        alerts.append(
            Alert(
                patient_id=vital.patient_id,
                vital_id=vital.id,
                alert_type="heart_rate",
                message=f"High heart rate detected: {vital.heart_rate} bpm",
                severity="high",
            )
        )

    if vital.oxygen_saturation < settings.oxygen_alert_threshold:
        alerts.append(
            Alert(
                patient_id=vital.patient_id,
                vital_id=vital.id,
                alert_type="oxygen_saturation",
                message=f"Low oxygen saturation detected: {vital.oxygen_saturation}%",
                severity="critical",
            )
        )

    if vital.temperature > settings.temperature_alert_threshold:
        alerts.append(
            Alert(
                patient_id=vital.patient_id,
                vital_id=vital.id,
                alert_type="temperature",
                message=f"High temperature detected: {vital.temperature} C",
                severity="high",
            )
        )

    for alert in alerts:
        db.add(alert)

    return alerts


def run():
    while True:
        consumer = None
        while True:
            try:
                consumer = build_consumer()
                consumer.subscribe([settings.kafka_vitals_topic])

                while True:
                    message = consumer.poll(1.0)

                    if message is None:
                        continue

                    if message.error():
                        print("Consumer error:", message.error())
                        raise RuntimeError(str(message.error()))

                    payload = json.loads(message.value().decode("utf-8"))

                    with SessionLocal() as db:
                        vital = Vital(**payload)
                        db.add(vital)
                        db.commit()
                        db.refresh(vital)

                        alerts = create_alerts(db, vital)
                        db.commit()

                        asyncio.run(
                            manager.broadcast(
                                {
                                    "type": "vital",
                                    "data": {
                                        "patient_id": vital.patient_id,
                                        "heart_rate": vital.heart_rate,
                                        "oxygen_saturation": vital.oxygen_saturation,
                                        "temperature": vital.temperature,
                                        "systolic_bp": vital.systolic_bp,
                                        "diastolic_bp": vital.diastolic_bp,
                                        "recorded_at": str(vital.recorded_at),
                                    },
                                }
                            )
                        )

                        for alert in alerts:
                            db.refresh(alert)

                            asyncio.run(
                                manager.broadcast(
                                    {
                                        "type": "alert",
                                        "data": {
                                            "id": alert.id,
                                            "patient_id": alert.patient_id,
                                            "vital_id": alert.vital_id,
                                            "alert_type": alert.alert_type,
                                            "message": alert.message,
                                            "severity": alert.severity,
                                            "created_at": alert.created_at.isoformat(),
                                        },
                                    }
                                )
                            )
            except Exception as e:
                print("Consumer reconnecting after error:", e)
                time.sleep(5)
            finally:
                if consumer is not None:
                    consumer.close()
            break


if __name__ == "__main__":
    run()
