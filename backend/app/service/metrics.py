from collections import Counter, deque
from datetime import timedelta
from threading import Lock
from time import perf_counter

from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.batch.status import utc_now
from app.models.alert import Alert
from app.models.patient.patient import Patient
from app.models.patient.patient_diagnosis import PatientDiagnosis
from app.models.patient.patient_stats import PatientStats
from app.models.vital import Vital
from app.utils.datetime import to_utc

WINDOW_MINUTES = 5
WINDOW_DELTA = timedelta(minutes=WINDOW_MINUTES)


def comparison_window_start():
    return utc_now() - WINDOW_DELTA


def _round_metric(value):
    if value is None:
        return 0.0
    return round(float(value), 2)


def compute_batch_metrics(db: Session):
    started_at = perf_counter()
    window_start = comparison_window_start()

    vitals_result = db.execute(
        select(
            func.avg(Vital.heart_rate),
            func.avg(Vital.oxygen_saturation),
            func.avg(Vital.temperature),
            func.count(func.distinct(Vital.patient_id)),
        ).where(Vital.recorded_at >= window_start)
    ).one()

    total_alerts = db.execute(
        select(func.count(Alert.id)).where(Alert.created_at >= window_start)
    ).scalar_one()

    execution_time_ms = round((perf_counter() - started_at) * 1000, 2)

    return {
        "avg_heart_rate": _round_metric(vitals_result[0]),
        "avg_oxygen": _round_metric(vitals_result[1]),
        "avg_temperature": _round_metric(vitals_result[2]),
        "total_alerts": int(total_alerts or 0),
        "active_patients": int(vitals_result[3] or 0),
        "execution_time_ms": execution_time_ms,
    }


def _empty_metrics():
    return {
        "avg_heart_rate": 0.0,
        "avg_oxygen": 0.0,
        "avg_temperature": 0.0,
        "total_alerts": 0,
        "active_patients": 0,
        "execution_time_ms": 0.0,
    }


def _empty_batch_insights():
    return {
        "patients_per_department": [],
        "top_diagnosis": [],
        "computed_at": None,
    }


class StreamingMetricsStore:
    def __init__(self):
        self._lock = Lock()
        self._vitals = deque()
        self._recent_alerts = deque(maxlen=10)
        self._patient_counts = Counter()
        self._heart_rate_sum = 0.0
        self._oxygen_sum = 0.0
        self._temperature_sum = 0.0
        self._alerts_total = 0
        self._last_execution_time_ms = 0.0

    def record_vital(self, vital, alert_count: int):
        started_at = perf_counter()
        cutoff = utc_now() - WINDOW_DELTA

        with self._lock:
            self._vitals.append(
                (
                    to_utc(vital.recorded_at),
                    vital.patient_id,
                    vital.heart_rate,
                    vital.oxygen_saturation,
                    vital.temperature,
                    alert_count,
                )
            )
            self._heart_rate_sum += vital.heart_rate
            self._oxygen_sum += vital.oxygen_saturation
            self._temperature_sum += vital.temperature
            self._alerts_total += alert_count
            self._patient_counts[vital.patient_id] += 1

            self._purge_expired(cutoff)
            self._last_execution_time_ms = round((perf_counter() - started_at) * 1000, 2)

    def record_alert(self, alert):
        with self._lock:
            self._recent_alerts.appendleft(
                {
                    "id": alert.id,
                    "patient_id": alert.patient_id,
                    "vital_id": alert.vital_id,
                    "alert_type": alert.alert_type,
                    "message": alert.message,
                    "severity": alert.severity,
                    "created_at": to_utc(alert.created_at),
                }
            )

    def snapshot(self):
        cutoff = utc_now() - WINDOW_DELTA

        with self._lock:
            self._purge_expired(cutoff)
            count = len(self._vitals)

            return {
                "avg_heart_rate": _round_metric(self._heart_rate_sum / count) if count else 0.0,
                "avg_oxygen": _round_metric(self._oxygen_sum / count) if count else 0.0,
                "avg_temperature": _round_metric(self._temperature_sum / count) if count else 0.0,
                "total_alerts": self._alerts_total,
                "active_patients": len(self._patient_counts),
                "execution_time_ms": self._last_execution_time_ms,
            }

    def alerts_snapshot(self, page: int, page_size: int):
        with self._lock:
            items = list(self._recent_alerts)
            paginated = paginate_items(items, page, page_size)
            paginated["items"] = [
                {
                    **item,
                    "created_at": to_utc(item["created_at"]),
                }
                for item in paginated["items"]
            ]
            return paginated

    def _purge_expired(self, cutoff):
        while self._vitals and to_utc(self._vitals[0][0]) < cutoff:
            _, patient_id, heart_rate, oxygen, temperature, alert_count = self._vitals.popleft()
            self._heart_rate_sum -= heart_rate
            self._oxygen_sum -= oxygen
            self._temperature_sum -= temperature
            self._alerts_total -= alert_count
            self._patient_counts[patient_id] -= 1

            if self._patient_counts[patient_id] <= 0:
                del self._patient_counts[patient_id]


class BatchMetricsSnapshotStore:
    def __init__(self):
        self._lock = Lock()
        self._metrics = _empty_metrics()
        self._insights = _empty_batch_insights()

    def update(self, metrics, insights):
        with self._lock:
            self._metrics = dict(metrics)
            self._insights = dict(insights)

    def metrics_snapshot(self):
        with self._lock:
            return dict(self._metrics)

    def insights_snapshot(self):
        with self._lock:
            insights = dict(self._insights)
            insights["patients_per_department"] = list(self._insights["patients_per_department"])
            insights["top_diagnosis"] = list(self._insights["top_diagnosis"])
            insights["computed_at"] = to_utc(self._insights["computed_at"])
            return insights


def paginate_items(items, page: int, page_size: int):
    total = len(items)
    start = (page - 1) * page_size
    end = start + page_size
    return {
        "items": items[start:end],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


def refresh_batch_snapshot(db: Session, execution_time_ms: float):
    metrics_row = db.execute(
        select(
            func.avg(PatientStats.avg_heart_rate),
            func.avg(PatientStats.avg_oxygen),
            func.avg(PatientStats.avg_temperature),
            func.sum(PatientStats.alerts_count),
            func.count(PatientStats.patient_id),
        )
    ).one()

    department_rows = db.execute(
        select(Patient.department, func.count(PatientStats.patient_id))
        .join(PatientStats, PatientStats.patient_id == Patient.id)
        .group_by(Patient.department)
        .order_by(desc(func.count(PatientStats.patient_id)), Patient.department.asc())
    ).all()

    top_diagnosis_rows = db.execute(
        select(PatientDiagnosis.diagnosis, func.count(func.distinct(PatientDiagnosis.patient_id)).label("patient_count"))
        .join(PatientStats, PatientStats.patient_id == PatientDiagnosis.patient_id)
        .where(PatientDiagnosis.status == "active")
        .group_by(PatientDiagnosis.diagnosis)
        .order_by(desc("patient_count"), PatientDiagnosis.diagnosis.asc())
    ).all()

    batch_metrics_snapshot_store.update(
        {
            "avg_heart_rate": _round_metric(metrics_row[0]),
            "avg_oxygen": _round_metric(metrics_row[1]),
            "avg_temperature": _round_metric(metrics_row[2]),
            "total_alerts": int(metrics_row[3] or 0),
            "active_patients": int(metrics_row[4] or 0),
            "execution_time_ms": round(float(execution_time_ms or 0), 2),
        },
        {
            "patients_per_department": [
                {"department": department, "patients": int(patients)}
                for department, patients in department_rows
            ],
            "top_diagnosis": [
                {
                    "name": diagnosis,
                    "patients": int(patient_count),
                }
                for diagnosis, patient_count in top_diagnosis_rows
            ],
            "computed_at": utc_now(),
        },
    )


streaming_metrics_store = StreamingMetricsStore()
batch_metrics_snapshot_store = BatchMetricsSnapshotStore()
