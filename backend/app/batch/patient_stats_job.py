from sqlalchemy import func

from app.batch.status import utc_now
from app.db.session import SessionLocal
from app.models.alert import Alert
from app.models.patient.patient_stats import PatientStats
from app.models.vital import Vital
from app.service.metrics import WINDOW_DELTA


def run():
    with SessionLocal() as db:
        window_start = utc_now() - WINDOW_DELTA
        db.query(PatientStats).delete()

        patient_vitals = (
            db.query(
                Vital.patient_id,
                func.avg(Vital.heart_rate).label("avg_heart_rate"),
                func.avg(Vital.temperature).label("avg_temperature"),
                func.avg(Vital.oxygen_saturation).label("avg_oxygen"),
            )
            .filter(Vital.recorded_at >= window_start)
            .group_by(Vital.patient_id)
            .all()
        )

        alert_counts = {
            patient_id: alerts_count
            for patient_id, alerts_count in (
                db.query(Alert.patient_id, func.count(Alert.id))
                .filter(Alert.created_at >= window_start)
                .group_by(Alert.patient_id)
                .all()
            )
        }

        for patient_vital in patient_vitals:
            stat = PatientStats(
                patient_id=patient_vital.patient_id,
                avg_heart_rate=patient_vital.avg_heart_rate or 0,
                avg_temperature=patient_vital.avg_temperature or 0,
                avg_oxygen=patient_vital.avg_oxygen or 0,
                alerts_count=alert_counts.get(patient_vital.patient_id, 0),
            )

            db.add(stat)

        db.commit()
