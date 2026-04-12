from sqlalchemy import func

from app.db.session import SessionLocal
from app.models.alert import Alert
from app.models.patient.patient_stats import PatientStats
from app.models.vital import Vital


def run():
    with SessionLocal() as db:
        db.query(PatientStats).delete()

        patient_ids = db.query(Vital.patient_id).distinct().all()

        for (patient_id,) in patient_ids:
            avg_heart_rate = db.query(func.avg(Vital.heart_rate)).filter(Vital.patient_id == patient_id).scalar()
            avg_temp = db.query(func.avg(Vital.temperature)).filter(Vital.patient_id == patient_id).scalar()
            avg_oxygen = db.query(func.avg(Vital.oxygen_saturation)).filter(Vital.patient_id == patient_id).scalar()

            alerts_count = db.query(Alert).filter(Alert.patient_id == patient_id).count()

            stat = PatientStats(
                patient_id=patient_id,
                avg_heart_rate=avg_heart_rate or 0,
                avg_temperature=avg_temp or 0,
                avg_oxygen=avg_oxygen or 0,
                alerts_count=alerts_count,
            )

            db.add(stat)

        db.commit()
