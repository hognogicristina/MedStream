from collections import Counter, deque
from datetime import timedelta
from threading import Lock
from time import perf_counter

from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.batch.status import batch_status_store, utc_now
from app.models.alert import Alert
from app.models.batch_analytics import BatchAnalytics
from app.models.patient.patient import Patient
from app.models.patient.patient_condition_assignment import PatientConditionAssignment
from app.models.patient.patient_diagnosis import PatientDiagnosis
from app.models.patient.patient_medication import PatientMedication
from app.models.patient.patient_stats import PatientStats
from app.models.vital import Vital
from app.repositories.patient_repository import PatientRepository
from app.utils.datetime import to_utc
from app.validators.metrics_validators import validate_metric_value

WINDOW_MINUTES = 60
WINDOW_DELTA = timedelta(minutes=WINDOW_MINUTES)


def _empty_metrics():
    return {
        "avg_heart_rate": 0.0,
        "avg_oxygen": 0.0,
        "avg_temperature": 0.0,
        "avg_systolic_bp": None,
        "avg_diastolic_bp": None,
        "total_alerts": 0,
        "alerts_critical_count": 0,
        "alerts_high_count": 0,
        "alerts_stable_count": 0,
        "active_patients": 0,
        "execution_time_ms": 0.0,
        "timestamp": None,
    }


class StreamingMetricsStore:
    def __init__(self):
        self._lock = Lock()
        self._vitals = deque()
        self._alerts = deque()
        self._recent_alerts = deque(maxlen=10)
        self._patient_counts = Counter()
        self._heart_rate_sum = 0.0
        self._oxygen_sum = 0.0
        self._temperature_sum = 0.0
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
            self._patient_counts[vital.patient_id] += 1

            self._purge_expired(cutoff)
            self._last_execution_time_ms = round((perf_counter() - started_at) * 1000, 2)

    def record_alert(self, alert):
        cutoff = utc_now() - WINDOW_DELTA

        with self._lock:
            self._alerts.append(to_utc(alert.created_at))
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
            self._purge_expired_alerts(cutoff)

    def snapshot(self):
        cutoff = utc_now() - WINDOW_DELTA

        with self._lock:
            self._purge_expired(cutoff)
            self._purge_expired_alerts(cutoff)
            count = len(self._vitals)

            return {
                "avg_heart_rate": validate_metric_value(self._heart_rate_sum / count) if count else 0.0,
                "avg_oxygen": validate_metric_value(self._oxygen_sum / count) if count else 0.0,
                "avg_temperature": validate_metric_value(self._temperature_sum / count) if count else 0.0,
                "total_alerts": len(self._alerts),
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
            _, patient_id, heart_rate, oxygen, temperature, _ = self._vitals.popleft()
            self._heart_rate_sum -= heart_rate
            self._oxygen_sum -= oxygen
            self._temperature_sum -= temperature
            self._patient_counts[patient_id] -= 1

            if self._patient_counts[patient_id] <= 0:
                del self._patient_counts[patient_id]

    def _purge_expired_alerts(self, cutoff):
        while self._alerts and to_utc(self._alerts[0]) < cutoff:
            self._alerts.popleft()


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
    snapshot_timestamp = utc_now()
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
    alert_severity_rows = db.execute(
        select(Alert.severity, func.count(Alert.id))
        .where(
            Alert.created_at >= (snapshot_timestamp - WINDOW_DELTA),
            Alert.created_at <= snapshot_timestamp,
        )
        .group_by(Alert.severity)
    ).all()

    severity_counts = {"critical": 0, "high": 0, "stable": 0}
    for severity, count in alert_severity_rows:
        normalized = str(severity or "").strip().lower()
        if normalized == "critical":
            severity_counts["critical"] += int(count or 0)
        elif normalized == "high":
            severity_counts["high"] += int(count or 0)
        else:
            severity_counts["stable"] += int(count or 0)

    batch_row = BatchAnalytics(
        timestamp=snapshot_timestamp,
        avg_heart_rate=validate_metric_value(metrics_row[0]),
        avg_oxygen=validate_metric_value(metrics_row[1]),
        avg_temperature=validate_metric_value(metrics_row[2]),
        avg_systolic_bp=float(bp_row[0]) if bp_row[0] is not None else None,
        avg_diastolic_bp=float(bp_row[1]) if bp_row[1] is not None else None,
        alerts_count=int(metrics_row[3] or 0),
        alerts_critical_count=severity_counts["critical"],
        alerts_high_count=severity_counts["high"],
        alerts_stable_count=severity_counts["stable"],
        patients_count=int(metrics_row[4] or 0),
    )
    db.add(batch_row)

    db.commit()

    return {
        "avg_heart_rate": batch_row.avg_heart_rate,
        "avg_oxygen": batch_row.avg_oxygen,
        "avg_temperature": batch_row.avg_temperature,
        "avg_systolic_bp": batch_row.avg_systolic_bp,
        "avg_diastolic_bp": batch_row.avg_diastolic_bp,
        "total_alerts": batch_row.alerts_count,
        "alerts_critical_count": batch_row.alerts_critical_count,
        "alerts_high_count": batch_row.alerts_high_count,
        "alerts_stable_count": batch_row.alerts_stable_count,
        "active_patients": batch_row.patients_count,
        "execution_time_ms": round(float(execution_time_ms or 0), 2),
        "timestamp": snapshot_timestamp,
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
        "alerts_critical_count": int(latest.alerts_critical_count or 0),
        "alerts_high_count": int(latest.alerts_high_count or 0),
        "alerts_stable_count": int(latest.alerts_stable_count or 0),
        "active_patients": int(latest.patients_count or 0),
        "execution_time_ms": round(float(status_snapshot.get("last_run_duration_ms") or 0), 2),
        "timestamp": to_utc(latest.timestamp),
    }


def get_batch_alerts_history(db: Session, *, limit: int = 24) -> list[dict]:
    rows = db.execute(
        select(BatchAnalytics)
        .order_by(BatchAnalytics.timestamp.desc(), BatchAnalytics.id.desc())
        .limit(limit)
    ).scalars().all()

    ordered = list(reversed(rows))
    return [
        {
            "timestamp": to_utc(row.timestamp),
            "critical": int(row.alerts_critical_count or 0),
            "high": int(row.alerts_high_count or 0),
            "stable": int(row.alerts_stable_count or 0),
            "normalized": int(row.alerts_stable_count or 0),
            "total": int(row.alerts_count or 0),
        }
        for row in ordered
    ]


def get_comparison_metrics(db: Session) -> dict:
    now = utc_now()
    window_start = now - WINDOW_DELTA
    window_seconds = max(1, int(WINDOW_DELTA.total_seconds()))

    total_events = int(
        db.execute(
            select(func.count(Vital.id)).where(Vital.recorded_at >= window_start)
        ).scalar_one()
        or 0
    )
    total_alerts = int(
        db.execute(
            select(func.count(Alert.id)).where(Alert.created_at >= window_start)
        ).scalar_one()
        or 0
    )

    streaming_latency_seconds = db.execute(
        select(
            func.avg(
                func.extract(
                    "epoch",
                    Alert.created_at - Vital.recorded_at,
                )
            )
        )
        .select_from(Alert)
        .join(Vital, Vital.id == Alert.vital_id)
        .where(
            Alert.created_at >= window_start,
            Vital.recorded_at.is_not(None),
        )
    ).scalar_one()

    latest_batch = get_latest_batch_analytics(db)
    batch_latency_seconds = None
    if latest_batch and latest_batch.timestamp:
        batch_latency_seconds = db.execute(
            select(
                func.avg(
                    func.extract(
                        "epoch",
                        latest_batch.timestamp - Vital.recorded_at,
                    )
                )
            )
            .select_from(Vital)
            .where(
                Vital.recorded_at >= (latest_batch.timestamp - WINDOW_DELTA),
                Vital.recorded_at <= latest_batch.timestamp,
            )
        ).scalar_one()

    return {
        "streaming_latency_avg": round(float((streaming_latency_seconds or 0) * 1000), 2),
        "batch_latency_avg": round(float(batch_latency_seconds or 0), 2),
        "total_events": total_events,
        "total_alerts": total_alerts,
        "events_per_second": round(total_events / window_seconds, 4),
        "alert_rate": round((total_alerts / total_events), 4) if total_events > 0 else 0.0,
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

    medications = db.execute(
        select(PatientMedication)
        .order_by(PatientMedication.created_at.asc(), PatientMedication.id.asc())
    ).scalars().all()
    alerts = db.execute(
        select(Alert)
        .order_by(Alert.created_at.asc(), Alert.id.asc())
    ).scalars().all()
    vitals = db.execute(
        select(Vital)
        .order_by(Vital.recorded_at.asc(), Vital.id.asc())
    ).scalars().all()
    diagnosis_rows = db.execute(
        select(PatientDiagnosis.patient_id)
    ).all()
    condition_rows = db.execute(
        select(PatientConditionAssignment.patient_id)
    ).all()

    diagnoses_by_patient = {patient_id for (patient_id,) in diagnosis_rows}
    conditions_by_patient = {patient_id for (patient_id,) in condition_rows}
    patient_ids = sorted(
        set(int(item.patient_id) for item in medications if item.patient_id is not None)
        | set(int(item.patient_id) for item in alerts if item.patient_id is not None)
        | set(int(item.patient_id) for item in vitals if item.patient_id is not None)
    )
    patients_by_id = {}
    if patient_ids:
        patients = db.execute(
            select(Patient).where(Patient.id.in_(patient_ids))
        ).scalars().all()
        patients_by_id = {int(patient.id): patient for patient in patients}

    medications_by_patient: dict[int, list[PatientMedication]] = {}
    for medication in medications:
        medications_by_patient.setdefault(int(medication.patient_id), []).append(medication)

    alerts_by_patient: dict[int, list[Alert]] = {}
    for alert in alerts:
        alerts_by_patient.setdefault(int(alert.patient_id), []).append(alert)

    vitals_by_patient: dict[int, list[Vital]] = {}
    for vital in vitals:
        vitals_by_patient.setdefault(int(vital.patient_id), []).append(vital)

    medication_effectiveness: dict[str, dict] = {}
    treatment_effective_total = 0
    treatment_improving_total = 0
    treatment_ineffective_total = 0
    for patient_id, patient_medications in medications_by_patient.items():
        if not patient_medications:
            continue
        patient = patients_by_id.get(patient_id)
        if patient is None:
            continue

        patient_alerts = alerts_by_patient.get(patient_id, [])
        patient_vitals = vitals_by_patient.get(patient_id, [])
        treatment_actions = PatientRepository._build_treatment_actions(patient_medications)
        if not treatment_actions:
            continue

        for action_index, action_entry in enumerate(treatment_actions):
            medication = action_entry["medication"]
            medication_name = str(medication.name or "").strip()
            if not medication_name:
                continue

            evaluation = PatientRepository._evaluate_treatment_action(
                patient=patient,
                action_index=action_index,
                treatment_actions=treatment_actions,
                sequence_vitals=patient_vitals,
                sequence_alerts=patient_alerts,
            )
            outcome = str(evaluation.get("outcome") or "Ineffective").strip()

            if medication_name not in medication_effectiveness:
                medication_effectiveness[medication_name] = {
                    "effective": 0,
                    "improving": 0,
                    "ineffective": 0,
                    "patients": set(),
                    "alert_triggered_count": 0,
                    "diagnosis_triggered_count": 0,
                    "condition_triggered_count": 0,
                    "dosage_breakdown": {},
                }

            entry = medication_effectiveness[medication_name]
            entry["patients"].add(patient_id)

            dosage_key = (medication.dosage or "--", medication.frequency or "--")
            entry["dosage_breakdown"][dosage_key] = entry["dosage_breakdown"].get(dosage_key, 0) + 1

            if outcome != "Effective":
                entry["alert_triggered_count"] += 1
            if patient_id in diagnoses_by_patient:
                entry["diagnosis_triggered_count"] += 1
            if patient_id in conditions_by_patient:
                entry["condition_triggered_count"] += 1

            if outcome == "Effective":
                entry["effective"] += 1
                treatment_effective_total += 1
            elif outcome == "Improving":
                entry["improving"] += 1
                treatment_improving_total += 1
            else:
                entry["ineffective"] += 1
                treatment_ineffective_total += 1

    total_treatments = treatment_effective_total + treatment_improving_total + treatment_ineffective_total

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
        "treatment_effectiveness": {
            "effective": treatment_effective_total,
            "improving": treatment_improving_total,
            "ineffective": treatment_ineffective_total,
            "effective_rate": round((treatment_effective_total / total_treatments) * 100, 2) if total_treatments else 0.0,
            "improving_rate": round((treatment_improving_total / total_treatments) * 100, 2) if total_treatments else 0.0,
            "ineffective_rate": round((treatment_ineffective_total / total_treatments) * 100, 2) if total_treatments else 0.0,
        },
        "medication_effectiveness": sorted(
            [
                {
                    "name": name,
                    "effective": values["effective"],
                    "improving": values["improving"],
                    "ineffective": values["ineffective"],
                    "total": values["effective"] + values["improving"] + values["ineffective"],
                    "effective_rate": round(
                        (values["effective"] / max(1, values["effective"] + values["improving"] + values["ineffective"])) * 100,
                        2,
                    ),
                    "improving_rate": round(
                        (values["improving"] / max(1, values["effective"] + values["improving"] + values["ineffective"])) * 100,
                        2,
                    ),
                    "ineffective_rate": round(
                        (values["ineffective"] / max(1, values["effective"] + values["improving"] + values["ineffective"])) * 100,
                        2,
                    ),
                    "total_patients": len(values["patients"]),
                    "alert_triggered_count": values["alert_triggered_count"],
                    "diagnosis_triggered_count": values["diagnosis_triggered_count"],
                    "condition_triggered_count": values["condition_triggered_count"],
                    "dosage_breakdown": [
                        {
                            "dosage": dosage,
                            "frequency": frequency,
                            "count": count,
                        }
                        for (dosage, frequency), count in values["dosage_breakdown"].items()
                    ],
                }
                for name, values in medication_effectiveness.items()
            ],
            key=lambda item: (-item["total"], item["name"]),
        ),
    }


streaming_metrics_store = StreamingMetricsStore()
