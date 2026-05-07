from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import desc, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import joinedload, selectinload

from app.db.session import SessionLocal
from app.models.alert import Alert
from app.models.doctor.doctor import Doctor
from app.models.doctor.doctor_activity import DoctorActivity
from app.models.doctor.doctor_activity_patient import doctor_activity_patients
from app.models.patient.patient import Patient
from app.models.patient.patient_admission_history import PatientAdmissionHistory
from app.models.patient.patient_activity_doctor import patient_activity_doctors
from app.models.patient.patient_allergy import PatientAllergy
from app.models.patient.patient_condition import PatientCondition
from app.models.patient.patient_condition_assignment import PatientConditionAssignment
from app.models.patient.patient_diagnosis import PatientDiagnosis
from app.models.patient.patient_medication import PatientMedication
from app.models.vital import Vital
from app.repositories.address_repository import AddressRepository
from app.validators.doctor_validators import validate_doctor_patient_specialization
from app.validators.medical_validators import (
    validate_condition_status,
    validate_diagnosis_status,
    validate_discharge_type,
    validate_dosage,
    validate_frequency,
    validate_medication_name,
)
from app.validators.patient_validators import (
    ConflictError,
    NotFoundError,
    get_patient_or_raise,
    normalize_optional_text,
    normalize_phone_value,
    validate_arrival_method,
    validate_cnp_immutable,
    validate_cnp_value,
    validate_department_value,
    validate_non_empty_update,
    validate_patient_discharged_for_readmit,
    validate_patient_assignment,
    validate_patient_editable,
    validate_patient_identity_uniqueness,
    validate_patient_not_already_discharged,
    validate_required_text,
    validate_update_value_present,
)
from app.alerts.alert_catalog import normalize_alert_type, vital_for_alert_type
from app.core.errors import ValidationError
from app.utils.datetime import now_utc, to_utc


class PatientRepository:
    MEDICATION_NAME_MAX_LENGTH = 255
    MEDICATION_DOSAGE_MAX_LENGTH = 100
    MEDICATION_FREQUENCY_MAX_LENGTH = 100
    MIN_TREATMENT_ACTIONS_BEFORE_RECOVERY_DISCHARGE = 10
    HEART_RATE_STABLE_MAX = 110
    OXYGEN_STABLE_MIN = 92
    TEMPERATURE_STABLE_MAX = 38

    ABNORMAL_ALERT_TYPES = {
        "heart_rate_high",
        "heart_rate_critical",
        "oxygen_low",
        "oxygen_critical",
        "temperature_high",
        "temperature_critical",
    }
    RECOVERY_ALERT_TYPES = {
        "heart_rate_normalized",
        "heart_rate_stable",
        "heart_rate_normal",
        "oxygen_normalized",
        "oxygen_stable",
        "oxygen_normal",
        "temperature_normalized",
        "temperature_stable",
        "temperature_normal",
    }

    @classmethod
    def _classify_alert_state(cls, canonical_type: str) -> str:
        normalized = str(canonical_type or "").strip().lower()
        if not normalized:
            return "none"

        if normalized in cls.ABNORMAL_ALERT_TYPES:
            return "abnormal"
        if normalized in cls.RECOVERY_ALERT_TYPES:
            return "normalized"

        # Fallback classification for legacy/variant canonical values.
        if normalized.startswith(("heart_rate_", "oxygen_", "temperature_")):
            if normalized.endswith(("_high", "_critical", "_low")):
                return "abnormal"
            if normalized.endswith(("_normalized", "_normal", "_stable")):
                return "normalized"

        return "none"

    @classmethod
    def _classify_vital_alert_state(cls, canonical_type: str) -> str:
        return cls._classify_alert_state(canonical_type)

    @staticmethod
    def _extract_status_vitals(message: str | None) -> dict | None:
        import re

        alert_message = str(message or "")
        hr_match = re.search(r"(?:heart\s*rate|HR)\D*(-?\d+(?:\.\d+)?)", alert_message, re.IGNORECASE)
        o2_match = re.search(r"(?:SpO2|oxygen)\D*(-?\d+(?:\.\d+)?)", alert_message, re.IGNORECASE)
        temp_match = re.search(r"(?:temp(?:erature)?)\D*(-?\d+(?:\.\d+)?)", alert_message, re.IGNORECASE)

        if hr_match is None and o2_match is None and temp_match is None:
            return None

        def to_float(match):
            if match is None:
                return None
            try:
                return float(match.group(1))
            except ValueError:
                return None

        return {
            "heartRate": to_float(hr_match),
            "oxygen": to_float(o2_match),
            "temperature": to_float(temp_match),
        }

    @classmethod
    def _extract_alert_structured_fields(cls, alert_type: str | None, message: str | None, severity: str | None) -> tuple[
        str | None, float | None, str | None, dict | None]:
        canonical_type = normalize_alert_type(alert_type, severity)
        alert_message = str(message or "")

        if canonical_type.endswith("_normalized"):
            status_vitals = cls._extract_status_vitals(alert_message)
            base_vital = vital_for_alert_type(canonical_type)
            base_type = base_vital if base_vital != "oxygen" else "oxygen_saturation"
            value = None
            unit = None
            if status_vitals is not None:
                if base_vital == "heart_rate":
                    value = status_vitals.get("heartRate")
                    unit = "bpm"
                elif base_vital == "oxygen":
                    value = status_vitals.get("oxygen")
                    unit = "%"
                elif base_vital == "temperature":
                    value = status_vitals.get("temperature")
                    unit = "C"
            return base_type, value, unit, status_vitals

        vital = vital_for_alert_type(canonical_type)
        if vital is None:
            return None, None, None, None

        import re
        if vital == "heart_rate":
            match = re.search(r"(?:heart\s*rate|HR)\D*(-?\d+(?:\.\d+)?)", alert_message, re.IGNORECASE)
            unit = "bpm"
            result_type = "heart_rate"
        elif vital == "oxygen":
            match = re.search(r"(?:SpO2|oxygen)\D*(-?\d+(?:\.\d+)?)", alert_message, re.IGNORECASE)
            unit = "%"
            result_type = "oxygen_saturation"
        else:
            match = re.search(r"(?:temp(?:erature)?)\D*(-?\d+(?:\.\d+)?)", alert_message, re.IGNORECASE)
            unit = "C"
            result_type = "temperature"

        if match is None:
            return result_type, None, unit, None

        try:
            value = float(match.group(1))
        except ValueError:
            value = None
        return result_type, value, unit, None

    def __init__(self, address_repository: AddressRepository | None = None):
        self.address_repository = address_repository or AddressRepository()

    @staticmethod
    def _normalize_datetime_for_comparison(value: datetime | None) -> datetime | None:
        if value is None:
            return None
        return to_utc(value)

    @classmethod
    def _normalize_datetime_candidates(cls, values: list[datetime | None]) -> list[datetime]:
        normalized: list[datetime] = []
        for value in values:
            normalized_value = cls._normalize_datetime_for_comparison(value)
            if normalized_value is not None:
                normalized.append(normalized_value)
        return normalized

    @staticmethod
    def _stable_vital_count(vital: Vital | None) -> int:
        if vital is None:
            return 0
        stable_flags = [
            vital.heart_rate <= PatientRepository.HEART_RATE_STABLE_MAX,
            vital.oxygen_saturation >= PatientRepository.OXYGEN_STABLE_MIN,
            vital.temperature <= PatientRepository.TEMPERATURE_STABLE_MAX,
        ]
        return sum(1 for flag in stable_flags if flag)

    @classmethod
    def _build_treatment_actions(cls, medications: list[PatientMedication]) -> list[dict[str, Any]]:
        actions: list[dict[str, Any]] = []
        for medication in medications:
            created_at = cls._normalize_datetime_for_comparison(medication.created_at)
            updated_at = cls._normalize_datetime_for_comparison(medication.updated_at)
            actions.append(
                {
                    "action": "add",
                    "timestamp": created_at,
                    "medication": medication,
                }
            )
            if updated_at is not None and created_at is not None and updated_at > created_at:
                actions.append(
                    {
                        "action": "modify",
                        "timestamp": updated_at,
                        "medication": medication,
                    }
                )

        actions.sort(
            key=lambda item: (
                item["timestamp"],
                item["medication"].id,
                0 if item["action"] == "add" else 1,
            )
        )
        return actions

    @classmethod
    def _build_treatment_evaluation_window(
            cls,
            *,
            patient: Patient,
            action_index: int,
            treatment_actions: list[dict[str, Any]],
            sequence_vitals: list[Vital],
            sequence_alerts: list[Alert],
    ) -> tuple[datetime, datetime]:
        action_time = cls._normalize_datetime_for_comparison(treatment_actions[action_index]["timestamp"])
        if action_time is None:
            fallback_now = now_utc()
            return fallback_now, fallback_now
        is_final = action_index == len(treatment_actions) - 1
        if not is_final:
            next_action_time = cls._normalize_datetime_for_comparison(treatment_actions[action_index + 1]["timestamp"])
            if next_action_time is None:
                return action_time, action_time
            return action_time, next_action_time

        if patient.discharge_date is not None:
            discharge_time = cls._normalize_datetime_for_comparison(patient.discharge_date)
            if discharge_time is not None:
                return action_time, discharge_time

        latest_vital_time = cls._normalize_datetime_for_comparison(sequence_vitals[-1].recorded_at) if sequence_vitals else None
        latest_alert_time = cls._normalize_datetime_for_comparison(sequence_alerts[-1].created_at) if sequence_alerts else None
        candidates = cls._normalize_datetime_candidates([latest_vital_time, latest_alert_time, action_time])
        if not candidates:
            return action_time, action_time
        return action_time, max(candidates)

    @staticmethod
    def _get_latest_vital_state_for_window(
            *,
            sequence_vitals: list[Vital],
            window_start: datetime,
            window_end: datetime,
    ) -> tuple[Vital | None, str]:
        normalized_window_start = PatientRepository._normalize_datetime_for_comparison(window_start)
        normalized_window_end = PatientRepository._normalize_datetime_for_comparison(window_end)
        if normalized_window_start is None or normalized_window_end is None:
            return None, "no_vital_available"

        in_window = [
            vital for vital in sequence_vitals
            if (
                (normalized_vital_time := PatientRepository._normalize_datetime_for_comparison(vital.recorded_at)) is not None
                and normalized_window_start <= normalized_vital_time <= normalized_window_end
            )
        ]
        if in_window:
            return in_window[-1], "latest_vital_in_window"

        before_end = [
            vital for vital in sequence_vitals
            if (
                (normalized_vital_time := PatientRepository._normalize_datetime_for_comparison(vital.recorded_at)) is not None
                and normalized_vital_time <= normalized_window_end
            )
        ]
        if before_end:
            return before_end[-1], "latest_vital_before_window_end"
        return None, "no_vital_available"

    @staticmethod
    def _get_latest_vital_before_timestamp(
            *,
            sequence_vitals: list[Vital],
            timestamp: datetime | None,
    ) -> Vital | None:
        normalized_timestamp = PatientRepository._normalize_datetime_for_comparison(timestamp)
        if normalized_timestamp is None:
            return None

        for vital in reversed(sequence_vitals):
            vital_time = PatientRepository._normalize_datetime_for_comparison(vital.recorded_at)
            if vital_time is not None and vital_time < normalized_timestamp:
                return vital
        return None

    @classmethod
    def _get_vital_trend_improvements(
            cls,
            *,
            previous_vital: Vital | None,
            current_vital: Vital | None,
    ) -> list[str]:
        if previous_vital is None or current_vital is None:
            return []

        improvements: set[str] = set()

        if (
                previous_vital.heart_rate > cls.HEART_RATE_STABLE_MAX
                and (
                        current_vital.heart_rate <= cls.HEART_RATE_STABLE_MAX
                        or current_vital.heart_rate <= (previous_vital.heart_rate - 4)
                )
        ):
            improvements.add("heart_rate")

        if (
                previous_vital.oxygen_saturation < cls.OXYGEN_STABLE_MIN
                and (
                        current_vital.oxygen_saturation >= cls.OXYGEN_STABLE_MIN
                        or current_vital.oxygen_saturation >= (previous_vital.oxygen_saturation + 1)
                )
        ):
            improvements.add("oxygen_saturation")

        if (
                previous_vital.temperature > cls.TEMPERATURE_STABLE_MAX
                and (
                        current_vital.temperature <= cls.TEMPERATURE_STABLE_MAX
                        or current_vital.temperature <= (previous_vital.temperature - 0.2)
                )
        ):
            improvements.add("temperature")

        return sorted(improvements)

    @classmethod
    def _get_latest_vital_specific_alert_state(
            cls,
            *,
            sequence_alerts: list[Alert],
            window_start: datetime | None = None,
            window_end: datetime,
    ) -> dict[str, dict[str, Any]]:
        normalized_window_start = cls._normalize_datetime_for_comparison(window_start)
        normalized_window_end = cls._normalize_datetime_for_comparison(window_end)
        if normalized_window_end is None:
            return {
                "heart_rate": {"latest": None, "latest_abnormal": None, "latest_normalized": None, "latest_state": "none"},
                "oxygen_saturation": {"latest": None, "latest_abnormal": None, "latest_normalized": None, "latest_state": "none"},
                "temperature": {"latest": None, "latest_abnormal": None, "latest_normalized": None, "latest_state": "none"},
            }

        state = {
            "heart_rate": {"latest": None, "latest_abnormal": None, "latest_normalized": None, "latest_state": "none"},
            "oxygen_saturation": {"latest": None, "latest_abnormal": None, "latest_normalized": None, "latest_state": "none"},
            "temperature": {"latest": None, "latest_abnormal": None, "latest_normalized": None, "latest_state": "none"},
        }

        for alert in sequence_alerts:
            alert_created_at = cls._normalize_datetime_for_comparison(alert.created_at)
            if alert_created_at is None:
                continue
            if normalized_window_start is not None and alert_created_at < normalized_window_start:
                continue
            if alert_created_at > normalized_window_end:
                continue
            canonical_type = normalize_alert_type(alert.alert_type, alert.severity)
            vital_key = vital_for_alert_type(canonical_type)
            if vital_key is None:
                continue
            mapped_vital_key = "oxygen_saturation" if vital_key == "oxygen" else vital_key
            bucket = state.get(mapped_vital_key)
            if bucket is None:
                continue

            bucket["latest"] = alert
            alert_state = cls._classify_alert_state(canonical_type)
            if alert_state == "normalized":
                bucket["latest_normalized"] = alert
                bucket["latest_state"] = "normalized"
            elif alert_state == "abnormal":
                bucket["latest_abnormal"] = alert
                bucket["latest_state"] = "abnormal"

        return state

    @classmethod
    def _build_latest_alert_debug_payload(
            cls,
            alert_state: dict[str, dict[str, Any]],
    ) -> dict[str, dict[str, Any] | None]:
        payload: dict[str, dict[str, Any] | None] = {}
        for vital_key in ("heart_rate", "oxygen_saturation", "temperature"):
            bucket = alert_state.get(vital_key) or {}
            latest_alert = bucket.get("latest")
            if latest_alert is None:
                payload[vital_key] = None
                continue

            canonical_type = normalize_alert_type(latest_alert.alert_type, latest_alert.severity)
            _, value, _, _ = cls._extract_alert_structured_fields(
                latest_alert.alert_type,
                latest_alert.message,
                latest_alert.severity,
            )
            payload[vital_key] = {
                "id": latest_alert.id,
                "type": canonical_type,
                "severity": latest_alert.severity,
                "timestamp": latest_alert.created_at,
                "value": value,
                "message": latest_alert.message,
                "state": str(bucket.get("latest_state") or cls._classify_alert_state(canonical_type) or "none"),
            }
        return payload

    @staticmethod
    def _format_vital_label(vital_key: str) -> str:
        return str(vital_key or "").replace("_saturation", "").replace("_", " ")

    @classmethod
    def _get_unresolved_abnormal_vitals(
            cls,
            *,
            full_alert_state: dict[str, dict[str, Any]],
            unresolved_after_treatment_vitals: list[str],
    ) -> list[str]:
        unresolved_from_latest = [
            key
            for key, bucket in full_alert_state.items()
            if str((bucket or {}).get("latest_state") or "").strip().lower() == "abnormal"
        ]
        return sorted(set(unresolved_from_latest) | set(unresolved_after_treatment_vitals or []))

    @classmethod
    def _get_recovered_vitals_after_treatment(
            cls,
            *,
            sequence_alerts: list[Alert],
            window_start: datetime,
            window_end: datetime,
            post_treatment_alert_state: dict[str, dict[str, Any]],
            full_alert_state: dict[str, dict[str, Any]],
    ) -> list[str]:
        normalized_start = cls._normalize_datetime_for_comparison(window_start)
        normalized_end = cls._normalize_datetime_for_comparison(window_end)
        if normalized_start is None or normalized_end is None:
            return []

        latest_abnormal_at_or_before_end: dict[str, datetime] = {}
        for alert in sequence_alerts:
            alert_created_at = cls._normalize_datetime_for_comparison(alert.created_at)
            if alert_created_at is None or alert_created_at > normalized_end:
                continue
            canonical_type = normalize_alert_type(alert.alert_type, alert.severity)
            vital_key = vital_for_alert_type(canonical_type)
            if vital_key is None:
                continue
            mapped_vital_key = "oxygen_saturation" if vital_key == "oxygen" else vital_key
            if cls._classify_alert_state(canonical_type) == "abnormal":
                latest_abnormal_at_or_before_end[mapped_vital_key] = alert_created_at

        recovered: list[str] = []
        for vital_key in ("heart_rate", "oxygen_saturation", "temperature"):
            bucket = post_treatment_alert_state.get(vital_key) or {}
            latest_normalized = bucket.get("latest_normalized")
            if latest_normalized is None:
                continue

            normalized_at = cls._normalize_datetime_for_comparison(latest_normalized.created_at)
            if normalized_at is None or normalized_at <= normalized_start:
                continue

            latest_abnormal_at = latest_abnormal_at_or_before_end.get(vital_key)
            if latest_abnormal_at is None or latest_abnormal_at >= normalized_at:
                continue

            latest_full_state = str((full_alert_state.get(vital_key) or {}).get("latest_state") or "").strip().lower()
            if latest_full_state != "normalized":
                continue

            recovered.append(vital_key)

        return sorted(recovered)

    @classmethod
    def _has_unresolved_abnormal_alerts_after_in_sequence(
            cls,
            *,
            sequence_alerts: list[Alert],
            after_timestamp: datetime,
            up_to_timestamp: datetime | None = None,
    ) -> tuple[bool, dict[str, Any]]:
        normalized_after_timestamp = cls._normalize_datetime_for_comparison(after_timestamp)
        normalized_up_to_timestamp = cls._normalize_datetime_for_comparison(up_to_timestamp)
        if normalized_after_timestamp is None:
            return False, {
                "unresolved_vitals": [],
                "latest_abnormal_by_vital": {},
                "latest_recovery_by_vital": {},
            }

        unresolved_by_vital: dict[str, Alert] = {}
        latest_recovery_by_vital: dict[str, Alert] = {}
        latest_abnormal_by_vital: dict[str, Alert] = {}

        for alert in sequence_alerts:
            alert_created_at = cls._normalize_datetime_for_comparison(alert.created_at)
            if alert_created_at is None:
                continue
            if alert_created_at <= normalized_after_timestamp:
                continue
            if normalized_up_to_timestamp is not None and alert_created_at > normalized_up_to_timestamp:
                continue
            canonical_type = normalize_alert_type(alert.alert_type, alert.severity)
            vital_key = vital_for_alert_type(canonical_type)
            if vital_key is None:
                continue

            mapped_vital_key = "oxygen_saturation" if vital_key == "oxygen" else vital_key
            alert_state = cls._classify_alert_state(canonical_type)
            if alert_state == "abnormal":
                unresolved_by_vital[mapped_vital_key] = alert
                latest_abnormal_by_vital[mapped_vital_key] = alert
            elif alert_state == "normalized":
                latest_recovery_by_vital[mapped_vital_key] = alert
                unresolved_by_vital.pop(mapped_vital_key, None)

        return bool(unresolved_by_vital), {
            "unresolved_vitals": sorted(unresolved_by_vital.keys()),
            "latest_abnormal_by_vital": latest_abnormal_by_vital,
            "latest_recovery_by_vital": latest_recovery_by_vital,
        }

    @classmethod
    def get_latest_vital_state(
            cls,
            db,
            patient_id: int,
            *,
            up_to_timestamp: datetime | None = None,
    ) -> Vital | None:
        query = select(Vital).where(Vital.patient_id == patient_id)
        if up_to_timestamp is not None:
            query = query.where(Vital.recorded_at <= up_to_timestamp)
        return db.execute(
            query.order_by(Vital.recorded_at.desc(), Vital.id.desc()).limit(1)
        ).scalar_one_or_none()

    @classmethod
    def get_latest_vital_alert_state(
            cls,
            db,
            patient_id: int,
            *,
            up_to_timestamp: datetime | None = None,
    ) -> dict[str, dict[str, Any]]:
        alerts = db.execute(
            select(Alert)
            .where(Alert.patient_id == patient_id)
            .order_by(Alert.created_at.asc(), Alert.id.asc())
        ).scalars().all()
        end_time = up_to_timestamp or now_utc()
        return cls._get_latest_vital_specific_alert_state(
            sequence_alerts=alerts,
            window_end=end_time,
        )

    @classmethod
    def has_unresolved_abnormal_alerts_after(
            cls,
            db,
            patient_id: int,
            timestamp: datetime,
            *,
            up_to_timestamp: datetime | None = None,
    ) -> tuple[bool, dict[str, Any]]:
        alerts = db.execute(
            select(Alert)
            .where(Alert.patient_id == patient_id)
            .order_by(Alert.created_at.asc(), Alert.id.asc())
        ).scalars().all()
        return cls._has_unresolved_abnormal_alerts_after_in_sequence(
            sequence_alerts=alerts,
            after_timestamp=timestamp,
            up_to_timestamp=up_to_timestamp,
        )

    @classmethod
    def can_discharge_patient_as_recovered(
            cls,
            db,
            patient_id: int,
            final_treatment: dict[str, Any] | None,
            *,
            discharge_timestamp: datetime | None = None,
            required_stability_window_seconds: int = 0,
            stability_started_at: datetime | None = None,
            min_treatment_actions_required: int | None = None,
    ) -> tuple[bool, str, dict[str, Any]]:
        candidate_discharge_time = discharge_timestamp or now_utc()
        required_actions = (
            cls.MIN_TREATMENT_ACTIONS_BEFORE_RECOVERY_DISCHARGE
            if min_treatment_actions_required is None
            else max(0, int(min_treatment_actions_required))
        )
        treatment_outcome = str((final_treatment or {}).get("outcome") or "").strip()
        final_treatment_timestamp = (final_treatment or {}).get("action_timestamp")
        latest_vital = cls.get_latest_vital_state(
            db,
            patient_id,
            up_to_timestamp=candidate_discharge_time,
        )
        full_alert_state = cls.get_latest_vital_alert_state(
            db,
            patient_id,
            up_to_timestamp=candidate_discharge_time,
        )
        post_treatment_alert_state = full_alert_state
        if final_treatment_timestamp is not None:
            sequence_alerts = db.execute(
                select(Alert)
                .where(Alert.patient_id == patient_id)
                .order_by(Alert.created_at.asc(), Alert.id.asc())
            ).scalars().all()
            post_treatment_alert_state = cls._get_latest_vital_specific_alert_state(
                sequence_alerts=sequence_alerts,
                window_start=final_treatment_timestamp,
                window_end=candidate_discharge_time,
            )

        latest_alert_debug: dict[str, dict[str, Any] | None] = {}
        latest_abnormal_vitals: list[str] = []
        for vital_key, mapped_key in (
                ("heart_rate", "heart_rate"),
                ("oxygen_saturation", "oxygen_saturation"),
                ("temperature", "temperature"),
        ):
            latest_overall_bucket = full_alert_state.get(mapped_key) or {}
            latest_post_treatment_bucket = post_treatment_alert_state.get(mapped_key) or {}
            alert = latest_post_treatment_bucket.get("latest")
            state_source_bucket = latest_post_treatment_bucket
            if alert is None:
                alert = latest_overall_bucket.get("latest")
                state_source_bucket = latest_overall_bucket
            if alert is None:
                latest_alert_debug[vital_key] = None
                continue
            canonical_type = normalize_alert_type(alert.alert_type, alert.severity)
            inferred_state = cls._classify_alert_state(canonical_type)
            latest_state = state_source_bucket.get("latest_state")
            if latest_state not in {"abnormal", "normalized"}:
                latest_state = inferred_state
            if latest_state == "abnormal":
                latest_abnormal_vitals.append(vital_key)
            _, value, _, _ = cls._extract_alert_structured_fields(
                alert.alert_type,
                alert.message,
                alert.severity,
            )
            latest_alert_debug[vital_key] = {
                "type": canonical_type,
                "severity": alert.severity,
                "timestamp": alert.created_at,
                "value": value,
                "message": alert.message,
                "state": latest_state or "none",
            }

        debug_payload = {
            "patient_id": patient_id,
            "final_treatment_id": (final_treatment or {}).get("medication_id"),
            "final_treatment_timestamp": final_treatment_timestamp,
            "final_treatment_outcome": treatment_outcome,
            "evaluated_vital_timestamp": (final_treatment or {}).get("evaluated_vital_timestamp"),
            "evaluated_vital": (final_treatment or {}).get("evaluated_vital"),
            "latest_vital_timestamp": latest_vital.recorded_at if latest_vital is not None else None,
            "latest_vital": {
                "heart_rate": latest_vital.heart_rate if latest_vital is not None else None,
                "oxygen_saturation": latest_vital.oxygen_saturation if latest_vital is not None else None,
                "temperature": latest_vital.temperature if latest_vital is not None else None,
            },
            "latest_hr_vital_value": latest_vital.heart_rate if latest_vital is not None else None,
            "latest_hr_vital_timestamp": latest_vital.recorded_at if latest_vital is not None else None,
            "latest_oxygen_vital_value": latest_vital.oxygen_saturation if latest_vital is not None else None,
            "latest_oxygen_vital_timestamp": latest_vital.recorded_at if latest_vital is not None else None,
            "latest_temperature_vital_value": latest_vital.temperature if latest_vital is not None else None,
            "latest_temperature_vital_timestamp": latest_vital.recorded_at if latest_vital is not None else None,
            "discharge_timestamp_candidate": candidate_discharge_time,
            "latest_alerts": latest_alert_debug,
        }

        if treatment_outcome != "Effective":
            debug_payload["reason"] = "Blocked recovered discharge because final treatment outcome is not Effective."
            return False, "final_treatment_outcome_not_effective", debug_payload
        if final_treatment_timestamp is None:
            debug_payload["reason"] = "Blocked recovered discharge because final treatment timestamp is missing."
            return False, "final_treatment_timestamp_missing", debug_payload
        if latest_vital is None:
            debug_payload["reason"] = "Blocked recovered discharge because no latest vital snapshot is available."
            return False, "latest_vital_missing", debug_payload

        treatment_actions_count = 0
        if required_actions > 0:
            medications = db.execute(
                select(PatientMedication)
                .where(PatientMedication.patient_id == patient_id)
                .order_by(PatientMedication.created_at.asc(), PatientMedication.id.asc())
            ).scalars().all()
            treatment_actions_count = len(cls._build_treatment_actions(medications))
            debug_payload["treatment_actions_count"] = treatment_actions_count
            debug_payload["min_treatment_actions_required"] = required_actions
            if treatment_actions_count < required_actions:
                debug_payload["reason"] = (
                    "Blocked recovered discharge because treatment history is too short: "
                    f"{treatment_actions_count} action(s) recorded, minimum required is {required_actions}."
                )
                return False, "minimum_treatment_actions_not_met", debug_payload

        if latest_vital.heart_rate > cls.HEART_RATE_STABLE_MAX:
            debug_payload["reason"] = (
                f"Blocked recovered discharge because latest heart rate vital is {latest_vital.heart_rate} "
                f"(>{cls.HEART_RATE_STABLE_MAX})."
            )
            return False, "latest_heart_rate_unstable", debug_payload
        if latest_vital.oxygen_saturation < cls.OXYGEN_STABLE_MIN:
            debug_payload["reason"] = (
                f"Blocked recovered discharge because latest oxygen vital is {latest_vital.oxygen_saturation} "
                f"(<{cls.OXYGEN_STABLE_MIN})."
            )
            return False, "latest_oxygen_unstable", debug_payload
        if latest_vital.temperature > cls.TEMPERATURE_STABLE_MAX:
            debug_payload["reason"] = (
                f"Blocked recovered discharge because latest temperature vital is {latest_vital.temperature} "
                f"(>{cls.TEMPERATURE_STABLE_MAX})."
            )
            return False, "latest_temperature_unstable", debug_payload

        unresolved_after_treatment, unresolved_details = cls.has_unresolved_abnormal_alerts_after(
            db,
            patient_id,
            final_treatment_timestamp,
            up_to_timestamp=candidate_discharge_time,
        )
        unresolved_vitals = sorted(
            set(unresolved_details.get("unresolved_vitals", []))
            | set(latest_abnormal_vitals)
        )
        debug_payload["unresolved_alerts_after_final_treatment"] = {
            "exists": bool(unresolved_vitals),
            "unresolved_vitals": unresolved_vitals,
        }
        debug_payload["unresolved_abnormal_vitals"] = unresolved_vitals
        if unresolved_vitals:
            reason_lines = []
            for vital_key in unresolved_vitals:
                latest_abnormal = (unresolved_details.get("latest_abnormal_by_vital") or {}).get(vital_key)
                debug_alert = latest_alert_debug.get(vital_key) if isinstance(latest_alert_debug.get(vital_key), dict) else None
                canonical = (
                    normalize_alert_type(latest_abnormal.alert_type, latest_abnormal.severity)
                    if latest_abnormal is not None
                    else (debug_alert or {}).get("type", "unknown")
                )
                ts = (
                    latest_abnormal.created_at.isoformat()
                    if latest_abnormal is not None
                    else (((debug_alert or {}).get("timestamp") or "unknown"))
                )
                vital_label = vital_key.replace("_saturation", "")
                reason_lines.append(
                    f"Blocked recovered discharge because latest {vital_label} alert is {canonical} at {ts} and no newer normalized alert exists."
                )
            debug_payload["reason"] = " ".join(reason_lines)
            return False, "unresolved_abnormal_alerts_after_effective_treatment", debug_payload

        if required_stability_window_seconds > 0:
            if stability_started_at is None:
                debug_payload["reason"] = "Blocked recovered discharge because the stability window start is missing."
                return False, "stability_window_missing_start", debug_payload
            stable_seconds = (candidate_discharge_time - stability_started_at).total_seconds()
            debug_payload["stable_window_seconds"] = stable_seconds
            if stable_seconds < required_stability_window_seconds:
                debug_payload["reason"] = (
                    f"Blocked recovered discharge because stable window is {stable_seconds:.2f}s "
                    f"(<{required_stability_window_seconds}s)."
                )
                return False, "stability_window_not_satisfied", debug_payload

        debug_payload["reason"] = "Recovered discharge allowed: final treatment and latest vital/alert states are stable."
        return True, "ok", debug_payload

    @staticmethod
    def _is_treatment_escalation_due_to_worsening(
            *,
            next_action: dict[str, Any] | None,
    ) -> bool:
        if next_action is None:
            return False

        next_medication = next_action["medication"]
        notes = " ".join(
            [
                str(next_medication.notes or ""),
                str(next_medication.last_updated_note or ""),
            ]
        ).strip().lower()
        if not notes:
            return False

        escalation_markers = [
            "persistent alert",
            "treatment not working",
            "worse",
            "worsen",
            "ineffective",
            "dose",
            "frequency adjusted",
            "escalat",
        ]
        return any(marker in notes for marker in escalation_markers)

    @classmethod
    def _derive_treatment_outcome_from_window(
            cls,
            *,
            action_index: int,
            total_actions: int,
            pre_treatment_vital: Vital | None,
            evaluated_vital: Vital | None,
            full_alert_state: dict[str, dict[str, Any]],
            post_treatment_alert_state: dict[str, dict[str, Any]],
            sequence_alerts: list[Alert],
            treatment_timestamp: datetime | None,
            window_end: datetime,
            unresolved_after_treatment_vitals: list[str],
            next_action: dict[str, Any] | None,
    ) -> tuple[str, str, dict[str, Any]]:
        vital_rules = {
            "heart_rate": {
                "label": "heart_rate",
                "threshold_text": f"<= {cls.HEART_RATE_STABLE_MAX}",
                "is_stable": lambda value: value <= cls.HEART_RATE_STABLE_MAX,
            },
            "oxygen_saturation": {
                "label": "oxygen_saturation",
                "threshold_text": f">= {cls.OXYGEN_STABLE_MIN}",
                "is_stable": lambda value: value >= cls.OXYGEN_STABLE_MIN,
            },
            "temperature": {
                "label": "temperature",
                "threshold_text": f"<= {cls.TEMPERATURE_STABLE_MAX}",
                "is_stable": lambda value: value <= cls.TEMPERATURE_STABLE_MAX,
            },
        }

        stable_reasons: list[str] = []
        vital_unstable_signals: list[str] = []
        vital_evidence: dict[str, Any] = {}
        all_latest_vitals_stable = evaluated_vital is not None

        for key, rule in vital_rules.items():
            value = getattr(evaluated_vital, key) if evaluated_vital is not None else None
            vital_alert_state = full_alert_state.get(key, {})
            latest_state = str(vital_alert_state.get("latest_state") or "none")
            latest_alert = vital_alert_state.get("latest")
            latest_alert_payload = (
                {
                    "id": latest_alert.id,
                    "alert_type": normalize_alert_type(latest_alert.alert_type, latest_alert.severity),
                    "severity": latest_alert.severity,
                    "message": latest_alert.message,
                    "created_at": latest_alert.created_at,
                } if latest_alert is not None else None
            )

            threshold_stable = None
            if value is not None:
                threshold_stable = bool(rule["is_stable"](value))
                if threshold_stable:
                    stable_reasons.append(f"{rule['label']}={value} satisfies {rule['threshold_text']}")
                else:
                    all_latest_vitals_stable = False
                    vital_unstable_signals.append(f"{rule['label']}={value} violates {rule['threshold_text']}")
            else:
                all_latest_vitals_stable = False
                vital_unstable_signals.append(f"{rule['label']} has no latest vital value for evaluation")

            vital_evidence[key] = {
                "value": value,
                "threshold": rule["threshold_text"],
                "threshold_stable": threshold_stable,
                "latest_alert_state": latest_state,
                "latest_alert": latest_alert_payload,
            }

        if treatment_timestamp is None:
            recovered_vitals: list[str] = []
        else:
            recovered_vitals = cls._get_recovered_vitals_after_treatment(
                sequence_alerts=sequence_alerts,
                window_start=treatment_timestamp,
                window_end=window_end,
                post_treatment_alert_state=post_treatment_alert_state,
                full_alert_state=full_alert_state,
            )

        unresolved_vitals = cls._get_unresolved_abnormal_vitals(
            full_alert_state=full_alert_state,
            unresolved_after_treatment_vitals=unresolved_after_treatment_vitals,
        )

        next_treatment_escalation = cls._is_treatment_escalation_due_to_worsening(
            next_action=next_action,
        )
        latest_alerts = cls._build_latest_alert_debug_payload(full_alert_state)

        trend_improved_vitals = cls._get_vital_trend_improvements(
            previous_vital=pre_treatment_vital,
            current_vital=evaluated_vital,
        )
        recovery_signals_vitals = sorted(set(recovered_vitals) | set(trend_improved_vitals))
        stable_vital_count_before = cls._stable_vital_count(pre_treatment_vital)
        stable_vital_count_after = cls._stable_vital_count(evaluated_vital)
        stable_vital_count_gain = max(0, stable_vital_count_after - stable_vital_count_before)

        has_unresolved = bool(unresolved_vitals)
        has_recovery = bool(recovery_signals_vitals)
        has_unstable_values = not all_latest_vitals_stable

        unstable_signals: list[str] = [*vital_unstable_signals]
        if has_unresolved:
            unstable_signals.append(
                "Unresolved abnormal alerts remain for: "
                + ", ".join(cls._format_vital_label(item) for item in unresolved_vitals)
            )
        if has_unstable_values:
            unstable_signals.append(
                "Latest vital values are not fully stable (heart_rate, oxygen_saturation, temperature)."
            )
        if next_treatment_escalation:
            unstable_signals.append(
                "A follow-up treatment escalation indicates persistent or worsening clinical instability."
            )

        evidence = {
            "vitals": vital_evidence,
            "stable_signals": stable_reasons,
            "unstable_signals": unstable_signals,
            "recovered_vitals": recovered_vitals,
            "trend_improved_vitals": trend_improved_vitals,
            "recovery_signals_vitals": recovery_signals_vitals,
            "unresolved_vitals": unresolved_vitals,
            "has_unresolved_abnormal_alerts": has_unresolved,
            "next_treatment_escalation_detected": next_treatment_escalation,
            "action_index": action_index + 1,
            "total_actions": total_actions,
            "stable_vital_count_before": stable_vital_count_before,
            "stable_vital_count_after": stable_vital_count_after,
            "stable_vital_count_gain": stable_vital_count_gain,
            "latest_alerts": latest_alerts,
        }

        if all_latest_vitals_stable and not has_unresolved and not next_treatment_escalation:
            if recovered_vitals:
                reason = (
                    "Treatment is effective because "
                    + ", ".join(cls._format_vital_label(item) for item in recovered_vitals)
                    + " normalized after treatment and no unresolved abnormal alerts remain."
                )
            else:
                reason = "Treatment is effective because latest vital values are stable and no unresolved abnormal alerts remain."
            return "Effective", reason, evidence

        treatment_number = action_index + 1
        phase_bonus = 0
        if 4 <= treatment_number <= 7:
            phase_bonus = 1
        elif treatment_number >= 8:
            phase_bonus = 2

        improving_threshold = 3
        if 4 <= treatment_number <= 7:
            improving_threshold = 2
        elif treatment_number >= 8:
            improving_threshold = 1

        progression_score = 0
        if has_recovery:
            progression_score += 2
        if stable_vital_count_gain > 0:
            progression_score += 1
        if not has_unresolved:
            progression_score += 1
        if not has_unstable_values:
            progression_score += 1
        if next_treatment_escalation:
            progression_score -= 1
        if phase_bonus > 0 and (has_recovery or stable_vital_count_gain > 0):
            progression_score += phase_bonus

        if (
                (has_recovery and (has_unresolved or has_unstable_values or next_treatment_escalation))
                or progression_score >= improving_threshold
                or (
                    treatment_number >= 4
                    and not next_treatment_escalation
                    and stable_vital_count_after >= stable_vital_count_before
                    and (has_recovery or stable_vital_count_after >= 2)
                )
        ):
            recovery_labels = recovery_signals_vitals or recovered_vitals
            unresolved_phrase = (
                ", and "
                + ", ".join(cls._format_vital_label(item) for item in unresolved_vitals)
                + " remains unresolved"
                if unresolved_vitals
                else ""
            )
            if recovery_labels:
                reason = (
                    "Treatment is improving because "
                    + ", ".join(cls._format_vital_label(item) for item in recovery_labels)
                    + " shows recovery after treatment"
                    + unresolved_phrase
                    + "."
                )
            else:
                reason = (
                    "Treatment is improving because clinical stability indicators are increasing, "
                    "but the patient is not fully recovered yet."
                )
            return "Improving", reason, evidence

        reason = "Treatment is ineffective because abnormal states remain unresolved and no meaningful post-treatment recovery evidence is present."
        return "Ineffective", reason, evidence

    @classmethod
    def _derive_treatment_outcome_from_alert_recovery(
            cls,
            *,
            action_index: int,
            total_actions: int,
            pre_treatment_vital: Vital | None,
            evaluated_vital: Vital | None,
            full_alert_state: dict[str, dict[str, Any]],
            post_treatment_alert_state: dict[str, dict[str, Any]],
            sequence_alerts: list[Alert],
            treatment_timestamp: datetime | None,
            window_end: datetime,
            unresolved_after_treatment_vitals: list[str],
            next_action: dict[str, Any] | None,
    ) -> tuple[str, str, dict[str, Any]]:
        return cls._derive_treatment_outcome_from_window(
            action_index=action_index,
            total_actions=total_actions,
            pre_treatment_vital=pre_treatment_vital,
            evaluated_vital=evaluated_vital,
            full_alert_state=full_alert_state,
            post_treatment_alert_state=post_treatment_alert_state,
            sequence_alerts=sequence_alerts,
            treatment_timestamp=treatment_timestamp,
            window_end=window_end,
            unresolved_after_treatment_vitals=unresolved_after_treatment_vitals,
            next_action=next_action,
        )

    @classmethod
    def _evaluate_treatment_action(
            cls,
            *,
            patient: Patient,
            action_index: int,
            treatment_actions: list[dict[str, Any]],
            sequence_vitals: list[Vital],
            sequence_alerts: list[Alert],
    ) -> dict[str, Any]:
        current_action = treatment_actions[action_index]
        next_action = treatment_actions[action_index + 1] if action_index + 1 < len(treatment_actions) else None
        pre_treatment_vital = cls._get_latest_vital_before_timestamp(
            sequence_vitals=sequence_vitals,
            timestamp=current_action["timestamp"],
        )
        window_start, window_end = cls._build_treatment_evaluation_window(
            patient=patient,
            action_index=action_index,
            treatment_actions=treatment_actions,
            sequence_vitals=sequence_vitals,
            sequence_alerts=sequence_alerts,
        )
        evaluated_vital, evaluated_vital_source = cls._get_latest_vital_state_for_window(
            sequence_vitals=sequence_vitals,
            window_start=window_start,
            window_end=window_end,
        )
        vital_alert_state = cls._get_latest_vital_specific_alert_state(
            sequence_alerts=sequence_alerts,
            window_start=current_action["timestamp"],
            window_end=window_end,
        )
        _, unresolved_after_treatment_details = cls._has_unresolved_abnormal_alerts_after_in_sequence(
            sequence_alerts=sequence_alerts,
            after_timestamp=current_action["timestamp"],
            up_to_timestamp=window_end,
        )

        outcome, outcome_reason, outcome_evidence = cls._derive_treatment_outcome_from_alert_recovery(
            action_index=action_index,
            total_actions=len(treatment_actions),
            pre_treatment_vital=pre_treatment_vital,
            evaluated_vital=evaluated_vital,
            full_alert_state=cls._get_latest_vital_specific_alert_state(
                sequence_alerts=sequence_alerts,
                window_end=window_end,
            ),
            post_treatment_alert_state=vital_alert_state,
            sequence_alerts=sequence_alerts,
            treatment_timestamp=current_action["timestamp"],
            window_end=window_end,
            unresolved_after_treatment_vitals=unresolved_after_treatment_details.get("unresolved_vitals", []),
            next_action=next_action,
        )

        evaluated_vital_payload = (
            {
                "heart_rate": evaluated_vital.heart_rate,
                "oxygen_saturation": evaluated_vital.oxygen_saturation,
                "temperature": evaluated_vital.temperature,
            } if evaluated_vital is not None else None
        )
        return {
            "outcome": outcome,
            "selected_vital_source": evaluated_vital_source,
            "selected_vital_timestamp": evaluated_vital.recorded_at if evaluated_vital is not None else None,
            "selected_vital": evaluated_vital_payload,
            "evaluation_start": window_start,
            "evaluation_end": window_end,
            "evaluated_vital_timestamp": evaluated_vital.recorded_at if evaluated_vital is not None else None,
            "evaluated_vital": evaluated_vital_payload,
            "outcome_reason": outcome_reason,
            "outcome_evidence": outcome_evidence,
            "recovered_vitals": list((outcome_evidence or {}).get("recovered_vitals") or []),
            "unresolved_vitals": list((outcome_evidence or {}).get("unresolved_vitals") or []),
            "latest_alerts": (outcome_evidence or {}).get("latest_alerts"),
        }

    @classmethod
    def _latest_treatment_action_outcome(cls, db, patient_id: int) -> dict | None:
        patient = db.get(Patient, patient_id)
        if patient is None:
            return None

        medications = db.execute(
            select(PatientMedication)
            .where(PatientMedication.patient_id == patient_id)
            .order_by(PatientMedication.created_at.asc(), PatientMedication.id.asc())
        ).scalars().all()
        if not medications:
            return None

        vitals = db.execute(
            select(Vital)
            .where(Vital.patient_id == patient_id)
            .order_by(Vital.recorded_at.asc(), Vital.id.asc())
        ).scalars().all()
        alerts = db.execute(
            select(Alert)
            .where(Alert.patient_id == patient_id)
            .order_by(Alert.created_at.asc(), Alert.id.asc())
        ).scalars().all()
        treatment_actions = cls._build_treatment_actions(medications)
        if not treatment_actions:
            return None

        latest_action = treatment_actions[-1]
        latest_index = len(treatment_actions) - 1
        evaluation = cls._evaluate_treatment_action(
            patient=patient,
            action_index=latest_index,
            treatment_actions=treatment_actions,
            sequence_vitals=vitals,
            sequence_alerts=alerts,
        )

        medication = latest_action["medication"]
        return {
            "medication_id": medication.id,
            "medication_name": medication.name,
            "action_type": latest_action["action"],
            "action_timestamp": latest_action["timestamp"],
            **evaluation,
        }

    @staticmethod
    def _clamp_text(value: str, max_length: int) -> str:
        return (value or "")[:max_length]

    def _load_patient_with_address(self, db, patient_id: int) -> Patient:
        patient = db.execute(
            select(Patient)
            .options(joinedload(Patient.address))
            .where(Patient.id == patient_id)
        ).scalar_one_or_none()
        if patient is None:
            raise NotFoundError("PATIENT_NOT_FOUND")
        return patient

    @staticmethod
    def _admission_note_from_arrival_method(arrival_method: str) -> str:
        if arrival_method == "ambulance":
            return "Arrived by ambulance"
        return "Arrived by themselves"

    @staticmethod
    def _cancel_incoming_patient_activities(db, patient_id: int) -> None:
        activities = (
            db.query(DoctorActivity)
            .filter(
                DoctorActivity.patient_id == patient_id,
                DoctorActivity.status == "incoming",
            )
            .all()
        )
        for activity in activities:
            activity.status = "canceled"

    def assign_doctor_to_patient_with_session(self, db, doctor_id: int, patient_id: int) -> None:
        exists = db.execute(
            doctor_activity_patients.select().where(
                (doctor_activity_patients.c.doctor_id == doctor_id)
                & (doctor_activity_patients.c.patient_id == patient_id)
            )
        ).first()

        if not exists:
            db.execute(
                doctor_activity_patients.insert().values(
                    doctor_id=doctor_id,
                    patient_id=patient_id,
                )
            )

    def _prepare_create_payload(self, payload: dict) -> tuple[dict, dict]:
        patient_data = {
            "first_name": validate_required_text(payload.get("first_name"), "First Name"),
            "last_name": validate_required_text(payload.get("last_name"), "Last Name"),
            "department": validate_department_value(payload.get("department")),
            "cnp": validate_cnp_value(payload.get("cnp")),
            "phone_number": normalize_phone_value(payload.get("phone_number")),
            "birth_date": payload.get("birth_date"),
            "gender": validate_required_text(payload.get("gender"), "Gender"),
            "arrival_method": validate_arrival_method(payload.get("arrival_method")),
            "is_pregnant": bool(payload.get("is_pregnant", False)),
        }
        return patient_data, payload.get("address")

    def _prepare_update_payload(self, payload: dict) -> tuple[dict, dict | None]:
        updates: dict = {}

        if "first_name" in payload:
            updates["first_name"] = validate_required_text(payload.get("first_name"), "First Name")
        if "last_name" in payload:
            updates["last_name"] = validate_required_text(payload.get("last_name"), "Last Name")
        if "department" in payload:
            updates["department"] = validate_department_value(payload.get("department"))
        if "cnp" in payload:
            updates["cnp"] = validate_cnp_value(payload.get("cnp"))
        if "phone_number" in payload:
            updates["phone_number"] = normalize_phone_value(payload.get("phone_number"))
        if "gender" in payload:
            updates["gender"] = validate_required_text(payload.get("gender"), "Gender")
        if "arrival_method" in payload:
            updates["arrival_method"] = validate_arrival_method(payload.get("arrival_method"))
        if "birth_date" in payload:
            updates["birth_date"] = payload.get("birth_date")
        if "is_pregnant" in payload:
            updates["is_pregnant"] = payload.get("is_pregnant")

        address_updates = payload.get("address") if "address" in payload else None
        return updates, address_updates

    def list_patients(self, condition_id: int | None = None) -> list[Patient]:
        with SessionLocal() as db:
            patient_query = select(Patient).options(joinedload(Patient.address))

            if condition_id is not None:
                patient_query = patient_query.join(
                    PatientConditionAssignment,
                    PatientConditionAssignment.patient_id == Patient.id,
                ).where(PatientConditionAssignment.condition_id == condition_id)

            return db.execute(patient_query.order_by(desc(Patient.id))).scalars().all()

    def search_patients_by_cnp(self, cnp: str, limit: int = 10) -> list[Patient]:
        normalized_cnp = (cnp or "").strip()
        if not normalized_cnp:
            return []

        with SessionLocal() as db:
            return db.execute(
                select(Patient)
                .options(joinedload(Patient.address))
                .where(Patient.cnp.like(f"%{normalized_cnp}%"))
                .order_by(Patient.cnp.asc(), Patient.id.asc())
                .limit(max(1, min(limit, 20)))
            ).scalars().all()

    def get_patient(self, patient_id: int) -> Patient:
        with SessionLocal() as db:
            return self._load_patient_with_address(db, patient_id)

    @staticmethod
    def _build_treatment_reasoning_payload(
            *,
            medication: PatientMedication,
            alerts: list[Alert],
            diagnosis_labels: list[str],
            condition_labels: list[str],
    ) -> dict:
        medication_time = medication.created_at
        closest_alerts = sorted(
            alerts,
            key=lambda item: abs((item.created_at - medication_time).total_seconds()),
        )[:3]

        alert_labels = [f"{normalize_alert_type(item.alert_type, item.severity)}: {item.message}" for item in closest_alerts]

        if not alert_labels and alerts:
            recent_alerts = sorted(alerts, key=lambda item: item.created_at, reverse=True)[:3]
            alert_labels = [f"{normalize_alert_type(item.alert_type, item.severity)}: {item.message}" for item in recent_alerts]

        return {
            "alerts": alert_labels,
            "diagnoses": diagnosis_labels,
            "conditions": condition_labels,
        }

    def get_patient_treatment_analysis(self, patient_id: int) -> dict:
        with SessionLocal() as db:
            patient = get_patient_or_raise(db, patient_id)

            medications = db.execute(
                select(PatientMedication)
                .where(PatientMedication.patient_id == patient_id)
                .order_by(PatientMedication.created_at.asc(), PatientMedication.id.asc())
            ).scalars().all()

            diagnoses = db.execute(
                select(PatientDiagnosis)
                .where(PatientDiagnosis.patient_id == patient_id)
                .order_by(PatientDiagnosis.created_at.asc(), PatientDiagnosis.id.asc())
            ).scalars().all()

            condition_rows = db.execute(
                select(PatientCondition, PatientConditionAssignment)
                .join(PatientConditionAssignment, PatientConditionAssignment.condition_id == PatientCondition.id)
                .where(PatientConditionAssignment.patient_id == patient_id)
                .order_by(PatientConditionAssignment.created_at.asc(), PatientCondition.id.asc())
            ).all()

            alerts = db.execute(
                select(Alert)
                .where(Alert.patient_id == patient_id)
                .order_by(Alert.created_at.asc(), Alert.id.asc())
            ).scalars().all()
            vitals = db.execute(
                select(Vital)
                .where(Vital.patient_id == patient_id)
                .order_by(Vital.recorded_at.asc(), Vital.id.asc())
            ).scalars().all()
            diagnosis_labels = [entry.diagnosis for entry in diagnoses if entry.diagnosis]
            condition_labels = [
                f"{condition.name} ({assignment.status})"
                for condition, assignment in condition_rows
                if condition.name
            ]

            sequence_alerts = sorted(alerts, key=lambda item: (item.created_at, item.id))
            sequence_vitals = sorted(vitals, key=lambda item: (item.recorded_at, item.id))

            treatment_actions = self._build_treatment_actions(medications)

            medications_payload = []
            for action_index, action_entry in enumerate(treatment_actions):
                medication = action_entry["medication"]
                action_type = action_entry["action"]
                action_time = action_entry["timestamp"]
                index = action_index + 1
                doctor_name = None
                doctor = db.get(Doctor, medication.doctor_id)
                if doctor is not None:
                    doctor_name = f"{doctor.last_name} {doctor.first_name}".strip()
                evaluation = self._evaluate_treatment_action(
                    patient=patient,
                    action_index=action_index,
                    treatment_actions=treatment_actions,
                    sequence_vitals=sequence_vitals,
                    sequence_alerts=sequence_alerts,
                )

                previous_alert = next(
                    (
                        alert
                        for alert in reversed(sequence_alerts)
                        if (
                            (alert_time := self._normalize_datetime_for_comparison(alert.created_at)) is not None
                            and action_time is not None
                            and alert_time <= action_time
                        )
                    ),
                    None,
                )

                medications_payload.append(
                    {
                        "id": medication.id,
                        "action": action_type,
                        "name": medication.name,
                        "dosage": medication.dosage,
                        "frequency": medication.frequency,
                        "created_at": medication.created_at,
                        "prescribed_at": action_time,
                        "timestamp": action_time,
                        "updated_at": medication.updated_at,
                        "notes": medication.notes,
                        "last_updated_note": medication.last_updated_note,
                        "modified_by": doctor_name,
                        "treatment_index": index,
                        **evaluation,
                        "previous_alert": (
                            {
                                "alert_type": normalize_alert_type(previous_alert.alert_type, previous_alert.severity),
                                "severity": previous_alert.severity,
                                "message": previous_alert.message,
                                "created_at": previous_alert.created_at,
                            } if previous_alert is not None else None
                        ),
                        "next_alert": None,
                        "reasoning": self._build_treatment_reasoning_payload(
                            medication=medication,
                            alerts=alerts,
                            diagnosis_labels=diagnosis_labels,
                            condition_labels=condition_labels,
                        ),
                    }
                )

            diagnoses_payload = [
                {
                    "id": diagnosis.id,
                    "diagnosis": diagnosis.diagnosis,
                    "status": diagnosis.status,
                    "notes": diagnosis.notes,
                    "status_note": diagnosis.status_note,
                    "modified_by": (
                        f"{doctor.last_name} {doctor.first_name}".strip()
                        if (doctor := db.get(Doctor, diagnosis.doctor_id)) is not None
                        else None
                    ),
                    "created_at": diagnosis.created_at,
                }
                for diagnosis in diagnoses
            ]

            conditions_payload = [
                {
                    "id": condition.id,
                    "name": condition.name,
                    "status": assignment.status,
                    "notes": assignment.notes,
                    "modified_by": (
                        f"{doctor.last_name} {doctor.first_name}".strip()
                        if (doctor := db.get(Doctor, assignment.doctor_id)) is not None
                        else None
                    ),
                    "diagnosed_at": assignment.diagnosed_at,
                    "updated_at": assignment.updated_at,
                }
                for condition, assignment in condition_rows
            ]

            alerts_payload = []
            for alert in alerts:
                alert_type, value, unit, vitals = self._extract_alert_structured_fields(
                    alert.alert_type,
                    alert.message,
                    alert.severity,
                )
                alerts_payload.append(
                    {
                        "id": alert.id,
                        "alert_type": normalize_alert_type(alert.alert_type, alert.severity),
                        "type": alert_type,
                        "value": value,
                        "unit": unit,
                        "vitals": vitals,
                        "message": alert.message,
                        "severity": alert.severity,
                        "created_at": alert.created_at,
                    }
                )

            timeline_events = []
            for medication in medications:
                timeline_events.append(
                    {
                        "timestamp": medication.created_at,
                        "event_type": "medication",
                        "title": medication.name,
                        "details": f"{medication.dosage}, {medication.frequency}",
                        "related_medication_id": medication.id,
                    }
                )

            for alert in alerts:
                timeline_events.append(
                    {
                        "timestamp": alert.created_at,
                        "event_type": "alert",
                        "title": normalize_alert_type(alert.alert_type, alert.severity),
                        "details": alert.message,
                        "related_medication_id": None,
                    }
                )

            if medications:
                first_medication = medications[0].created_at - timedelta(days=30)
                last_medication = medications[-1].created_at + timedelta(days=30)
                timeline_events = [
                    event
                    for event in timeline_events
                    if first_medication <= event["timestamp"] <= last_medication or event["event_type"] == "medication"
                ]

            timeline_events.sort(key=lambda event: (event["timestamp"], event["event_type"]))

            return {
                "medications": medications_payload,
                "diagnoses": diagnoses_payload,
                "conditions": conditions_payload,
                "alerts": alerts_payload,
                "timeline": timeline_events,
            }

    def get_patient_doctors(self, patient_id: int) -> list[Doctor]:
        with SessionLocal() as db:
            patient = db.execute(
                select(Patient).options(selectinload(Patient.doctors)).where(Patient.id == patient_id)
            ).scalar_one_or_none()
            if patient is None:
                raise NotFoundError("PATIENT_NOT_FOUND")
            return sorted(patient.doctors, key=lambda doctor: doctor.id, reverse=True)

    def create_patient(self, payload: dict, doctor_id: int | None = None) -> Patient:
        with SessionLocal() as db:
            patient_data, address_payload = self._prepare_create_payload(payload)
            validate_patient_identity_uniqueness(
                db,
                cnp=patient_data["cnp"],
                phone_number=patient_data["phone_number"],
            )

            address = self.address_repository.create_address_with_session(db, address_payload)

            patient = Patient(**patient_data, address_id=address.id)
            db.add(patient)

            try:
                db.flush()
                if doctor_id is not None:
                    self.assign_doctor_to_patient_with_session(db, doctor_id, patient.id)

                db.add(
                    PatientAdmissionHistory(
                        patient_id=patient.id,
                        doctor_id=doctor_id,
                        type="admission",
                        reason=None,
                        note=self._admission_note_from_arrival_method(patient.arrival_method),
                        created_at=datetime.now(timezone.utc),
                    )
                )
                db.commit()
                return self._load_patient_with_address(db, patient.id)
            except IntegrityError as error:
                db.rollback()
                raise ConflictError("PATIENT_IDENTITY_FIELDS_UNIQUE") from error

    def update_patient(self, patient_id: int, doctor_id: int, payload: dict) -> Patient:
        with SessionLocal() as db:
            patient = get_patient_or_raise(db, patient_id)
            validate_patient_assignment(db, doctor_id, patient.id)
            validate_patient_editable(patient)

            updates, address_updates = self._prepare_update_payload(payload)

            if "cnp" in updates:
                validate_cnp_immutable(patient.cnp, updates["cnp"])
                updates.pop("cnp")

            if "phone_number" in updates:
                validate_patient_identity_uniqueness(
                    db,
                    phone_number=updates.get("phone_number"),
                    patient_id=patient.id,
                )

            for field, value in updates.items():
                setattr(patient, field, value)

            updated_address = self.address_repository.upsert_address_with_session(db, patient.address, address_updates)
            if updated_address is not None:
                patient.address_id = updated_address.id

            try:
                db.commit()
                return self._load_patient_with_address(db, patient.id)
            except IntegrityError as error:
                db.rollback()
                raise ConflictError("PATIENT_IDENTITY_FIELDS_UNIQUE") from error

    def update_patient_department(self, patient_id: int, doctor_id: int, department: str, reason: str) -> Patient:
        with SessionLocal() as db:
            patient = get_patient_or_raise(db, patient_id)
            validate_patient_assignment(db, doctor_id, patient.id)
            validate_patient_editable(patient)

            patient.department = validate_department_value(department)
            validate_required_text(reason, "Reason")

            db.commit()
            return self._load_patient_with_address(db, patient.id)

    def discharge_patient(self, patient_id: int, doctor_id: int, discharge_type: str, reason: str) -> Patient:
        with SessionLocal() as db:
            patient = get_patient_or_raise(db, patient_id)
            validate_patient_assignment(db, doctor_id, patient.id)

            validate_patient_not_already_discharged(patient.is_discharged)

            normalized_type = validate_discharge_type(discharge_type)
            normalized_reason = validate_required_text(reason, "Reason")
            latest_treatment = self._latest_treatment_action_outcome(db, patient.id)
            latest_outcome = latest_treatment["outcome"] if latest_treatment is not None else "Ineffective"
            discharge_timestamp = datetime.now(timezone.utc)
            if latest_outcome == "Improving":
                raise ValidationError("DISCHARGE_NOT_ALLOWED_FOR_IMPROVING_OUTCOME")
            if normalized_type == "Recovered":
                if latest_outcome != "Effective":
                    raise ValidationError("DISCHARGE_RECOVERED_REQUIRES_EFFECTIVE_FINAL_TREATMENT")
                can_discharge, reason_code, debug_payload = self.can_discharge_patient_as_recovered(
                    db,
                    patient.id,
                    latest_treatment,
                    discharge_timestamp=discharge_timestamp,
                )
                print(
                    f"[RECOVERED_DISCHARGE_GUARD] patient_id={patient.id} patient_name={patient.last_name} {patient.first_name} "
                    f"allowed={can_discharge} reason={reason_code} payload={debug_payload}"
                )
                if not can_discharge:
                    raise ValidationError("DISCHARGE_RECOVERED_REQUIRES_STABLE_LATEST_STATE")
            elif normalized_type == "Transferred" and latest_outcome != "Ineffective":
                raise ValidationError("TRANSFER_DISCHARGE_REQUIRES_INEFFECTIVE_FINAL_TREATMENT")
            self._cancel_incoming_patient_activities(db, patient.id)

            patient.is_discharged = True
            patient.discharge_reason = normalized_reason
            patient.discharge_date = discharge_timestamp

            db.add(
                PatientAdmissionHistory(
                    patient_id=patient.id,
                    doctor_id=doctor_id,
                    type=normalized_type,
                    reason=normalized_reason,
                    created_at=patient.discharge_date,
                )
            )

            db.commit()
            return self._load_patient_with_address(db, patient.id)

    def readmit_patient(self, patient_id: int, doctor_id: int, doctor_specialization: str, arrival_method: str) -> Patient:
        with SessionLocal() as db:
            patient = get_patient_or_raise(db, patient_id)

            validate_patient_discharged_for_readmit(patient.is_discharged)
            normalized_arrival_method = validate_arrival_method(arrival_method)

            if patient.department != doctor_specialization:
                patient.department = doctor_specialization

            patient.arrival_method = normalized_arrival_method
            patient.is_discharged = False
            patient.discharge_reason = None
            patient.discharge_date = None

            self.assign_doctor_to_patient_with_session(db, doctor_id, patient.id)

            db.add(
                PatientAdmissionHistory(
                    patient_id=patient.id,
                    doctor_id=doctor_id,
                    type="admission",
                    reason=None,
                    note=self._admission_note_from_arrival_method(normalized_arrival_method),
                    created_at=datetime.now(timezone.utc),
                )
            )

            db.commit()
            return self._load_patient_with_address(db, patient.id)

    def transfer_patient_assignment(
            self,
            patient_id: int,
            current_doctor_id: int,
            from_doctor_id: int,
            to_doctor_id: int,
    ) -> Patient:
        with SessionLocal() as db:
            patient = db.execute(
                select(Patient)
                .options(selectinload(Patient.doctors), joinedload(Patient.address))
                .where(Patient.id == patient_id)
            ).scalar_one_or_none()
            if patient is None:
                raise NotFoundError("PATIENT_NOT_FOUND")

            validate_patient_assignment(db, current_doctor_id, patient.id)
            validate_patient_editable(patient)

            if to_doctor_id <= 0:
                raise ValidationError("TRANSFER_TARGET_REQUIRED")
            if from_doctor_id == to_doctor_id:
                raise ValidationError("TRANSFER_TO_SELF_NOT_ALLOWED")

            from_doctor = db.get(Doctor, from_doctor_id)
            if from_doctor is None:
                raise NotFoundError("DOCTOR_NOT_FOUND")
            validate_patient_assignment(db, from_doctor.id, patient.id)

            available_doctors = db.execute(
                select(Doctor)
                .where(
                    Doctor.is_active.is_(True),
                    Doctor.specialization == patient.department,
                    Doctor.id != from_doctor_id,
                )
            ).scalars().all()

            replacement_doctor = next((doctor for doctor in available_doctors if doctor.id == to_doctor_id), None)
            if replacement_doctor is None:
                raise ValidationError("TRANSFER_TARGET_NOT_AVAILABLE")

            validate_doctor_patient_specialization(replacement_doctor, patient)

            incoming_activities = (
                db.query(DoctorActivity)
                .filter(
                    DoctorActivity.patient_id == patient.id,
                    DoctorActivity.status == "incoming",
                )
                .all()
            )

            for activity in incoming_activities:
                activity.status = "canceled"

                migrated_activity = DoctorActivity(
                    doctor_id=replacement_doctor.id,
                    patient_id=patient.id,
                    type=activity.type,
                    title=activity.title,
                    description=activity.description,
                    status="incoming",
                    scheduled_at=activity.scheduled_at,
                )
                migrated_activity.patients = [patient]
                migrated_activity.doctors = [replacement_doctor]
                db.add(migrated_activity)

            if not any(doctor.id == replacement_doctor.id for doctor in patient.doctors):
                patient.doctors.append(replacement_doctor)

            source_doctor = next((doctor for doctor in patient.doctors if doctor.id == from_doctor_id), None)
            if source_doctor is not None:
                patient.doctors.remove(source_doctor)

            db.commit()
            return self._load_patient_with_address(db, patient.id)

    def get_patient_admission_history(self, patient_id: int, page: int, page_size: int) -> tuple[list[PatientAdmissionHistory], int]:
        with SessionLocal() as db:
            get_patient_or_raise(db, patient_id)

            total = db.execute(
                select(func.count()).select_from(PatientAdmissionHistory).where(PatientAdmissionHistory.patient_id == patient_id)
            ).scalar_one()

            entries = db.execute(
                select(PatientAdmissionHistory)
                .where(PatientAdmissionHistory.patient_id == patient_id)
                .order_by(desc(PatientAdmissionHistory.created_at), desc(PatientAdmissionHistory.id))
                .offset((page - 1) * page_size)
                .limit(page_size)
            ).scalars().all()

            return entries, total

    def get_patient_conditions(self, patient_id: int):
        with SessionLocal() as db:
            get_patient_or_raise(db, patient_id)
            rows = db.execute(
                select(PatientCondition, PatientConditionAssignment)
                .join(PatientConditionAssignment, PatientConditionAssignment.condition_id == PatientCondition.id)
                .where(PatientConditionAssignment.patient_id == patient_id)
                .order_by(PatientCondition.name.asc(), PatientCondition.id.asc())
            ).all()
            doctor_ids = {
                assignment.doctor_id
                for _, assignment in rows
                if assignment.doctor_id is not None
            }
            doctor_names = {}
            if doctor_ids:
                doctors = db.execute(
                    select(Doctor).where(Doctor.id.in_(doctor_ids))
                ).scalars().all()
                doctor_names = {
                    doctor.id: f"{doctor.last_name} {doctor.first_name}".strip()
                    for doctor in doctors
                }
            for _, assignment in rows:
                setattr(assignment, "modified_by", doctor_names.get(assignment.doctor_id))
            return rows

    def assign_patient_condition(self, patient_id: int, condition_id: int, doctor_id: int):
        with SessionLocal() as db:
            patient = get_patient_or_raise(db, patient_id)
            validate_patient_assignment(db, doctor_id, patient.id)
            validate_patient_editable(patient)

            condition = db.get(PatientCondition, condition_id)
            if condition is None:
                raise NotFoundError("CONDITION_NOT_FOUND")

            existing_assignment = db.execute(
                select(PatientConditionAssignment).where(
                    PatientConditionAssignment.patient_id == patient.id,
                    PatientConditionAssignment.condition_id == condition.id,
                )
            ).scalar_one_or_none()

            if existing_assignment is None:
                db.add(
                    PatientConditionAssignment(
                        patient_id=patient.id,
                        condition_id=condition.id,
                        doctor_id=doctor_id,
                    )
                )
                db.commit()

            rows = db.execute(
                select(PatientCondition, PatientConditionAssignment)
                .join(PatientConditionAssignment, PatientConditionAssignment.condition_id == PatientCondition.id)
                .where(PatientConditionAssignment.patient_id == patient.id)
                .order_by(PatientCondition.name.asc(), PatientCondition.id.asc())
            ).all()
            doctor_ids = {
                assignment.doctor_id
                for _, assignment in rows
                if assignment.doctor_id is not None
            }
            doctor_names = {}
            if doctor_ids:
                doctors = db.execute(
                    select(Doctor).where(Doctor.id.in_(doctor_ids))
                ).scalars().all()
                doctor_names = {
                    doctor.id: f"{doctor.last_name} {doctor.first_name}".strip()
                    for doctor in doctors
                }
            for _, assignment in rows:
                setattr(assignment, "modified_by", doctor_names.get(assignment.doctor_id))
            return rows

    def update_condition_assignment(self, assignment_id: int, doctor_id: int, status: str | None, notes: str | None):
        with SessionLocal() as db:
            assignment = db.get(PatientConditionAssignment, assignment_id)
            if assignment is None:
                raise NotFoundError("ASSIGNMENT_NOT_FOUND")

            validate_patient_assignment(db, doctor_id, assignment.patient_id)
            validate_patient_editable(get_patient_or_raise(db, assignment.patient_id))

            if status is not None:
                normalized_status = validate_condition_status(status)
                if normalized_status in {"resolved", "improving"}:
                    latest_treatment = self._latest_treatment_action_outcome(db, assignment.patient_id)
                    latest_outcome = latest_treatment["outcome"] if latest_treatment is not None else "Ineffective"
                    if normalized_status == "resolved" and latest_outcome != "Effective":
                        raise ValidationError("CONDITION_RESOLVE_REQUIRES_EFFECTIVE_FINAL_TREATMENT")
                    if normalized_status == "improving" and latest_outcome not in {"Effective", "Improving"}:
                        raise ValidationError("CONDITION_IMPROVING_REQUIRES_EFFECTIVE_FINAL_TREATMENT")
                    if normalized_status == "resolved":
                        can_resolve, _, _ = self.can_discharge_patient_as_recovered(
                            db,
                            assignment.patient_id,
                            latest_treatment,
                            discharge_timestamp=now_utc(),
                        )
                        if not can_resolve:
                            raise ValidationError("CONDITION_RESOLVE_REQUIRES_STABLE_LATEST_STATE")
                assignment.status = normalized_status
                assignment.doctor_id = doctor_id

            if notes is not None:
                assignment.notes = normalize_optional_text(notes)

            assignment.updated_at = now_utc()
            db.commit()
            db.refresh(assignment)
            return assignment

    def get_patient_allergies(self, patient_id: int, page: int, page_size: int) -> tuple[list[PatientAllergy], int]:
        with SessionLocal() as db:
            get_patient_or_raise(db, patient_id)

            total = db.execute(
                select(func.count()).select_from(PatientAllergy).where(PatientAllergy.patient_id == patient_id)
            ).scalar_one()

            allergies = db.execute(
                select(PatientAllergy)
                .where(PatientAllergy.patient_id == patient_id)
                .order_by(desc(PatientAllergy.updated_at), desc(PatientAllergy.id))
                .offset((page - 1) * page_size)
                .limit(page_size)
            ).scalars().all()

            return allergies, total

    def create_patient_allergy(self, patient_id: int, doctor_id: int, allergy_name: str, severity: str) -> PatientAllergy:
        with SessionLocal() as db:
            patient = get_patient_or_raise(db, patient_id)
            validate_patient_assignment(db, doctor_id, patient.id)
            validate_patient_editable(patient)

            allergy = PatientAllergy(
                patient_id=patient.id,
                doctor_id=doctor_id,
                allergy_name=validate_required_text(allergy_name, "Allergy Name"),
                severity=validate_required_text(severity, "Severity"),
            )
            db.add(allergy)
            db.commit()
            db.refresh(allergy)
            return allergy

    def update_patient_allergy(self, allergy_id: int, doctor_id: int, severity: str | None) -> PatientAllergy:
        with SessionLocal() as db:
            allergy = db.get(PatientAllergy, allergy_id)
            if allergy is None:
                raise NotFoundError("ALLERGY_NOT_FOUND")

            validate_patient_assignment(db, doctor_id, allergy.patient_id)
            validate_patient_editable(get_patient_or_raise(db, allergy.patient_id))

            validate_update_value_present(severity, "NO_ALLERGY_UPDATES")

            allergy.severity = validate_required_text(severity, "Severity")
            allergy.updated_at = now_utc()
            db.commit()
            db.refresh(allergy)
            return allergy

    def get_patient_diagnosis(self, patient_id: int, page: int, page_size: int) -> tuple[list[PatientDiagnosis], int]:
        with SessionLocal() as db:
            get_patient_or_raise(db, patient_id)

            total = db.execute(
                select(func.count()).select_from(PatientDiagnosis).where(PatientDiagnosis.patient_id == patient_id)
            ).scalar_one()

            diagnosis_entries = db.execute(
                select(PatientDiagnosis)
                .where(PatientDiagnosis.patient_id == patient_id)
                .order_by(desc(PatientDiagnosis.updated_at), desc(PatientDiagnosis.id))
                .offset((page - 1) * page_size)
                .limit(page_size)
            ).scalars().all()
            doctor_ids = {
                diagnosis_entry.doctor_id
                for diagnosis_entry in diagnosis_entries
                if diagnosis_entry.doctor_id is not None
            }
            doctor_names = {}
            if doctor_ids:
                doctors = db.execute(
                    select(Doctor).where(Doctor.id.in_(doctor_ids))
                ).scalars().all()
                doctor_names = {
                    doctor.id: f"{doctor.last_name} {doctor.first_name}".strip()
                    for doctor in doctors
                }
            for diagnosis_entry in diagnosis_entries:
                setattr(diagnosis_entry, "modified_by", doctor_names.get(diagnosis_entry.doctor_id))

            return diagnosis_entries, total

    def create_patient_diagnosis(self, patient_id: int, doctor_id: int, diagnosis: str, notes: str | None) -> PatientDiagnosis:
        with SessionLocal() as db:
            patient = get_patient_or_raise(db, patient_id)
            validate_patient_assignment(db, doctor_id, patient.id)
            validate_patient_editable(patient)

            diagnosis_entry = PatientDiagnosis(
                patient_id=patient.id,
                doctor_id=doctor_id,
                diagnosis=validate_required_text(diagnosis, "Diagnosis"),
                notes=normalize_optional_text(notes),
            )
            db.add(diagnosis_entry)
            db.commit()
            db.refresh(diagnosis_entry)
            doctor = db.get(Doctor, doctor_id)
            setattr(
                diagnosis_entry,
                "modified_by",
                f"{doctor.last_name} {doctor.first_name}".strip() if doctor is not None else None,
            )
            return diagnosis_entry

    def update_patient_diagnosis(self, diagnosis_id: int, doctor_id: int, status: str | None, note: str | None) -> PatientDiagnosis:
        with SessionLocal() as db:
            diagnosis = db.get(PatientDiagnosis, diagnosis_id)
            if diagnosis is None:
                raise NotFoundError("DIAGNOSIS_NOT_FOUND")

            validate_patient_assignment(db, doctor_id, diagnosis.patient_id)
            validate_patient_editable(get_patient_or_raise(db, diagnosis.patient_id))

            updated = False

            if status is not None:
                normalized_status = validate_diagnosis_status(status)
                if normalized_status == "resolved":
                    latest_treatment = self._latest_treatment_action_outcome(db, diagnosis.patient_id)
                    latest_outcome = latest_treatment["outcome"] if latest_treatment is not None else "Ineffective"
                    if latest_outcome != "Effective":
                        raise ValidationError("DIAGNOSIS_RESOLVE_REQUIRES_EFFECTIVE_FINAL_TREATMENT")
                    can_resolve, _, _ = self.can_discharge_patient_as_recovered(
                        db,
                        diagnosis.patient_id,
                        latest_treatment,
                        discharge_timestamp=now_utc(),
                    )
                    if not can_resolve:
                        raise ValidationError("DIAGNOSIS_RESOLVE_REQUIRES_STABLE_LATEST_STATE")
                diagnosis.status = normalized_status
                diagnosis.doctor_id = doctor_id
                updated = True

            if note is not None:
                diagnosis.status_note = validate_required_text(note, "Note")
                updated = True

            validate_non_empty_update(updated, "NO_DIAGNOSIS_UPDATES")

            diagnosis.updated_at = now_utc()
            db.commit()
            db.refresh(diagnosis)
            doctor = db.get(Doctor, diagnosis.doctor_id)
            setattr(
                diagnosis,
                "modified_by",
                f"{doctor.last_name} {doctor.first_name}".strip() if doctor is not None else None,
            )
            return diagnosis

    def administer_medication(
            self,
            patient_id: int,
            doctor_id: int,
            name: str,
            dosage: str,
            frequency: str,
            notes: str | None,
    ) -> PatientMedication:
        with SessionLocal() as db:
            patient = get_patient_or_raise(db, patient_id)
            validate_patient_assignment(db, doctor_id, patient.id)
            validate_patient_editable(patient)

            medication = PatientMedication(
                patient_id=patient.id,
                doctor_id=doctor_id,
                name=self._clamp_text(
                    validate_medication_name(name, is_pregnant=patient.is_pregnant),
                    self.MEDICATION_NAME_MAX_LENGTH,
                ),
                dosage=self._clamp_text(validate_dosage(dosage), self.MEDICATION_DOSAGE_MAX_LENGTH),
                frequency=self._clamp_text(validate_frequency(frequency), self.MEDICATION_FREQUENCY_MAX_LENGTH),
                notes=normalize_optional_text(notes),
            )

            db.add(medication)
            db.commit()
            db.refresh(medication)
            return medication

    def get_patient_medications(self, patient_id: int) -> list[PatientMedication]:
        with SessionLocal() as db:
            get_patient_or_raise(db, patient_id)
            return db.execute(
                select(PatientMedication)
                .where(PatientMedication.patient_id == patient_id)
                .order_by(
                    desc(func.coalesce(PatientMedication.updated_at, PatientMedication.created_at)),
                    desc(PatientMedication.id),
                )
            ).scalars().all()

    def update_medication(self, medication_id: int, doctor_id: int, dosage: str | None, frequency: str | None,
                          note: str) -> PatientMedication:
        with SessionLocal() as db:
            medication = db.get(PatientMedication, medication_id)
            if medication is None:
                raise NotFoundError("MEDICATION_NOT_FOUND")

            validate_patient_assignment(db, doctor_id, medication.patient_id)
            validate_patient_editable(get_patient_or_raise(db, medication.patient_id))

            latest_medication = db.execute(
                select(PatientMedication)
                .where(PatientMedication.patient_id == medication.patient_id)
                .order_by(
                    desc(func.coalesce(PatientMedication.updated_at, PatientMedication.created_at)),
                    desc(PatientMedication.id),
                )
                .limit(1)
            ).scalar_one_or_none()
            if latest_medication is None:
                raise NotFoundError("MEDICATION_NOT_FOUND")

            updated = False
            if dosage is not None:
                latest_medication.dosage = self._clamp_text(
                    validate_dosage(dosage),
                    self.MEDICATION_DOSAGE_MAX_LENGTH,
                )
                updated = True

            if frequency is not None:
                latest_medication.frequency = self._clamp_text(
                    validate_frequency(frequency),
                    self.MEDICATION_FREQUENCY_MAX_LENGTH,
                )
                updated = True

            validate_non_empty_update(updated, "NO_MEDICATION_UPDATES")

            latest_medication.last_updated_note = validate_required_text(note, "Note")
            latest_medication.updated_at = now_utc()

            db.commit()
            db.refresh(latest_medication)
            return latest_medication

    def get_patient_activities(self, patient_id: int) -> list[DoctorActivity]:
        with SessionLocal() as db:
            get_patient_or_raise(db, patient_id)
            return db.execute(
                select(DoctorActivity)
                .join(patient_activity_doctors, patient_activity_doctors.c.activity_id == DoctorActivity.id)
                .where(patient_activity_doctors.c.patient_id == patient_id)
                .options(
                    selectinload(DoctorActivity.doctors),
                    selectinload(DoctorActivity.patients),
                )
                .order_by(desc(DoctorActivity.scheduled_at), desc(DoctorActivity.id))
            ).scalars().all()

    def get_condition_options(self) -> list[PatientCondition]:
        with SessionLocal() as db:
            return db.query(PatientCondition).all()
