import json
import time
import asyncio
import traceback

from confluent_kafka import Consumer

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.alert import Alert
from app.models.patient.patient import Patient
from app.models.vital import Vital

from app.service.metrics import streaming_metrics_store
from app.utils.datetime import to_utc
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
    if vital is None or getattr(vital, "patient_id", None) is None:
        return alerts

    patient = db.get(Patient, vital.patient_id)
    if patient is None:
        return alerts

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


def schedule_broadcast(app_loop: asyncio.AbstractEventLoop, message: dict):
    future = asyncio.run_coroutine_threadsafe(manager.broadcast(message), app_loop)
    future.add_done_callback(lambda f: f.exception())


def run(app_loop: asyncio.AbstractEventLoop):
    while True:
        consumer = None
        while True:
            try:
                consumer = build_consumer()
                consumer.subscribe([settings.kafka_vitals_topic])

                while True:
                    try:
                        message = consumer.poll(1.0)

                        if message is None:
                            continue

                        if message.error():
                            print("Consumer error:", message.error())
                            raise RuntimeError(str(message.error()))

                        payload = json.loads(message.value().decode("utf-8"))
                        payload = payload.get("data", payload)
                        allowed_fields = {
                            "patient_id",
                            "heart_rate",
                            "oxygen_saturation",
                            "temperature",
                            "systolic_bp",
                            "diastolic_bp",
                        }

                        clean_payload = {k: v for k, v in payload.items() if k in allowed_fields}
                        with SessionLocal() as db:
                            patient_id = clean_payload.get("patient_id")
                            if patient_id is None:
                                print("Skipping vital event: missing patient_id")
                                continue

                            patient = db.get(Patient, patient_id)
                            if patient is None:
                                print(f"Skipping vital event: patient {patient_id} does not exist")
                                continue
                            if patient.is_discharged:
                                print(f"Skipping vital event: patient {patient_id} is discharged")
                                continue

                            vital = Vital(**clean_payload)
                            db.add(vital)
                            db.commit()
                            db.refresh(vital)

                            alerts = create_alerts(db, vital)
                            db.commit()
                            streaming_metrics_store.record_vital(vital, len(alerts))

                            schedule_broadcast(
                                app_loop,
                                {
                                    "type": "vital",
                                    "data": {
                                        "patient_id": vital.patient_id,
                                        "heart_rate": vital.heart_rate,
                                        "oxygen_saturation": vital.oxygen_saturation,
                                        "temperature": vital.temperature,
                                        "systolic_bp": vital.systolic_bp,
                                        "diastolic_bp": vital.diastolic_bp,
                                        "recorded_at": to_utc(vital.recorded_at).isoformat(),
                                    },
                                },
                            )

                            for alert in alerts:
                                db.refresh(alert)
                                streaming_metrics_store.record_alert(alert)

                                schedule_broadcast(
                                    app_loop,
                                    {
                                        "type": "alert",
                                        "data": {
                                            "id": alert.id,
                                            "patient_id": alert.patient_id,
                                            "vital_id": alert.vital_id,
                                            "alert_type": alert.alert_type,
                                            "message": alert.message,
                                            "severity": alert.severity,
                                            "created_at": to_utc(alert.created_at).isoformat(),
                                        },
                                    },
                                )
                    except Exception:
                        traceback.print_exc()
                        raise
            except Exception as e:
                print("Consumer reconnecting after error:", e)
                time.sleep(5)
            finally:
                if consumer is not None:
                    consumer.close()
            break


if __name__ == "__main__":
    raise SystemExit("Run consumer via FastAPI startup lifecycle.")
