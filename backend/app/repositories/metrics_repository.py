from collections import Counter, deque
from datetime import timedelta
from threading import Lock
from time import perf_counter

from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.batch.status import batch_status_store, utc_now
from app.models.alert import Alert
from app.models.batch_analytics import BatchAnalytics
from app.models.batch_treatment_analytics import BatchTreatmentAnalytics
from app.models.patient.patient import Patient
from app.models.patient.patient_condition_assignment import PatientConditionAssignment
from app.models.patient.patient_diagnosis import PatientDiagnosis
from app.models.patient.patient_medication import PatientMedication
from app.models.patient.patient_stats import PatientStats
from app.models.vital import Vital
from app.utils.datetime import to_utc
from app.validators.metrics_validators import validate_metric_value

WINDOW_MINUTES = 5
WINDOW_DELTA = timedelta(minutes=WINDOW_MINUTES)
EFFICIENT_STATUSES = {"improving", "stable", "resolved"}
INEFFICIENT_STATUSES = {"worsening", "critical"}


def comparison_window_start():
    return utc_now() - WINDOW_DELTA


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
        "avg_heart_rate": validate_metric_value(vitals_result[0]),
        "avg_oxygen": validate_metric_value(vitals_result[1]),
        "avg_temperature": validate_metric_value(vitals_result[2]),
        "total_alerts": int(total_alerts or 0),
        "active_patients": int(vitals_result[3] or 0),
        "execution_time_ms": execution_time_ms,
    }


def _empty_metrics():
    return {
        "avg_heart_rate": 0.0,
        "avg_oxygen": 0.0,
        "avg_temperature": 0.0,
        "avg_systolic_bp": None,
        "avg_diastolic_bp": None,
        "total_alerts": 0,
        "active_patients": 0,
        "execution_time_ms": 0.0,
        "timestamp": None,
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
                "avg_heart_rate": validate_metric_value(self._heart_rate_sum / count) if count else 0.0,
                "avg_oxygen": validate_metric_value(self._oxygen_sum / count) if count else 0.0,
                "avg_temperature": validate_metric_value(self._temperature_sum / count) if count else 0.0,
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


def _compute_treatment_efficiency_counts(db: Session) -> tuple[list[dict], list[dict]]:
    latest_condition_status = (
        select(
            PatientConditionAssignment.patient_id.label("patient_id"),
            PatientConditionAssignment.status.label("status"),
            func.row_number()
            .over(
                partition_by=PatientConditionAssignment.patient_id,
                order_by=PatientConditionAssignment.created_at.desc(),
            )
            .label("rank"),
        )
        .subquery()
    )

    rows = db.execute(
        select(
            PatientMedication.name,
            latest_condition_status.c.status,
            func.count(PatientMedication.id).label("count"),
        )
        .join(
            latest_condition_status,
            latest_condition_status.c.patient_id == PatientMedication.patient_id,
        )
        .where(latest_condition_status.c.rank == 1)
        .group_by(PatientMedication.name, latest_condition_status.c.status)
    ).all()

    efficient_counts: Counter[str] = Counter()
    inefficient_counts: Counter[str] = Counter()

    for treatment_name, status, count in rows:
        normalized_status = (status or "").strip().lower()
        if normalized_status in EFFICIENT_STATUSES:
            efficient_counts[treatment_name] += int(count or 0)
        elif normalized_status in INEFFICIENT_STATUSES:
            inefficient_counts[treatment_name] += int(count or 0)

    def to_sorted_list(counter: Counter[str]) -> list[dict]:
        items = sorted(counter.items(), key=lambda item: (-item[1], item[0]))
        return [{"name": name, "count": value} for name, value in items if value > 0]

    return to_sorted_list(efficient_counts), to_sorted_list(inefficient_counts)


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
    bp_row = db.execute(
        select(
            func.avg(Vital.systolic_bp),
            func.avg(Vital.diastolic_bp),
        )
    ).one()

    snapshot_timestamp = utc_now()
    batch_row = BatchAnalytics(
        timestamp=snapshot_timestamp,
        avg_heart_rate=validate_metric_value(metrics_row[0]),
        avg_oxygen=validate_metric_value(metrics_row[1]),
        avg_temperature=validate_metric_value(metrics_row[2]),
        avg_systolic_bp=float(bp_row[0]) if bp_row[0] is not None else None,
        avg_diastolic_bp=float(bp_row[1]) if bp_row[1] is not None else None,
        alerts_count=int(metrics_row[3] or 0),
        patients_count=int(metrics_row[4] or 0),
    )
    db.add(batch_row)
    db.flush()

    efficient_treatments, inefficient_treatments = _compute_treatment_efficiency_counts(db)

    treatment_rows = [
        BatchTreatmentAnalytics(
            batch_analytics_id=batch_row.id,
            efficiency_type="efficient",
            treatment_name=item["name"],
            count=item["count"],
        )
        for item in efficient_treatments
    ]
    treatment_rows.extend(
        BatchTreatmentAnalytics(
            batch_analytics_id=batch_row.id,
            efficiency_type="inefficient",
            treatment_name=item["name"],
            count=item["count"],
        )
        for item in inefficient_treatments
    )
    if treatment_rows:
        db.add_all(treatment_rows)

    db.commit()

    return {
        "avg_heart_rate": batch_row.avg_heart_rate,
        "avg_oxygen": batch_row.avg_oxygen,
        "avg_temperature": batch_row.avg_temperature,
        "avg_systolic_bp": batch_row.avg_systolic_bp,
        "avg_diastolic_bp": batch_row.avg_diastolic_bp,
        "total_alerts": batch_row.alerts_count,
        "active_patients": batch_row.patients_count,
        "execution_time_ms": round(float(execution_time_ms or 0), 2),
        "timestamp": snapshot_timestamp,
        "efficient_treatments": efficient_treatments,
        "inefficient_treatments": inefficient_treatments,
    }


def get_latest_batch_analytics(db: Session) -> BatchAnalytics | None:
    return db.execute(
        select(BatchAnalytics)
        .order_by(BatchAnalytics.timestamp.desc(), BatchAnalytics.id.desc())
        .limit(1)
    ).scalar_one_or_none()


def get_latest_batch_metrics(db: Session) -> dict:
    latest = get_latest_batch_analytics(db)
    if latest is None:
        return _empty_metrics()

    status_snapshot = batch_status_store.snapshot()

    return {
        "avg_heart_rate": validate_metric_value(latest.avg_heart_rate),
        "avg_oxygen": validate_metric_value(latest.avg_oxygen),
        "avg_temperature": validate_metric_value(latest.avg_temperature),
        "avg_systolic_bp": float(latest.avg_systolic_bp) if latest.avg_systolic_bp is not None else None,
        "avg_diastolic_bp": float(latest.avg_diastolic_bp) if latest.avg_diastolic_bp is not None else None,
        "total_alerts": int(latest.alerts_count or 0),
        "active_patients": int(latest.patients_count or 0),
        "execution_time_ms": round(float(status_snapshot.get("last_run_duration_ms") or 0), 2),
        "timestamp": to_utc(latest.timestamp),
    }


def get_latest_treatment_efficiency(db: Session, batch_analytics_id: int) -> dict:
    rows = db.execute(
        select(
            BatchTreatmentAnalytics.efficiency_type,
            BatchTreatmentAnalytics.treatment_name,
            BatchTreatmentAnalytics.count,
        )
        .where(BatchTreatmentAnalytics.batch_analytics_id == batch_analytics_id)
        .order_by(
            BatchTreatmentAnalytics.efficiency_type.asc(),
            BatchTreatmentAnalytics.count.desc(),
            BatchTreatmentAnalytics.treatment_name.asc(),
        )
    ).all()

    efficient_treatments = []
    inefficient_treatments = []

    for efficiency_type, treatment_name, count in rows:
        payload = {
            "name": treatment_name,
            "count": int(count or 0),
        }
        if efficiency_type == "efficient":
            efficient_treatments.append(payload)
        elif efficiency_type == "inefficient":
            inefficient_treatments.append(payload)

    return {
        "efficient_treatments": efficient_treatments,
        "inefficient_treatments": inefficient_treatments,
    }


def get_batch_insights_repo(db: Session, *, departments_page: int, diagnoses_page: int, page_size: int) -> dict:
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

    latest = get_latest_batch_analytics(db)
    treatment_payload = {
        "efficient_treatments": [],
        "inefficient_treatments": [],
    }
    if latest is not None:
        treatment_payload = get_latest_treatment_efficiency(db, latest.id)
    medication_distribution_map: Counter[str] = Counter()
    for entry in treatment_payload["efficient_treatments"]:
        medication_distribution_map[entry["name"]] += int(entry["count"] or 0)
    for entry in treatment_payload["inefficient_treatments"]:
        medication_distribution_map[entry["name"]] += int(entry["count"] or 0)

    medication_distribution = [
        {"name": name, "count": count}
        for name, count in sorted(
            medication_distribution_map.items(),
            key=lambda item: (-item[1], item[0]),
        )
        if count > 0
    ]
    treatment_effectiveness = {
        "effective": int(sum(item["count"] for item in treatment_payload["efficient_treatments"])),
        "ineffective": int(sum(item["count"] for item in treatment_payload["inefficient_treatments"])),
    }

    return {
        "patients_per_department": paginate_items(
            [
                {"department": department, "patients": int(patients)}
                for department, patients in department_rows
            ],
            departments_page,
            page_size,
        ),
        "top_diagnosis": paginate_items(
            [
                {
                    "name": diagnosis,
                    "patients": int(patient_count),
                }
                for diagnosis, patient_count in top_diagnosis_rows
            ],
            diagnoses_page,
            page_size,
        ),
        "medication_distribution": medication_distribution,
        "treatment_effectiveness": treatment_effectiveness,
    }


streaming_metrics_store = StreamingMetricsStore()
