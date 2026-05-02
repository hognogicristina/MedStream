from __future__ import annotations

import random
from datetime import datetime, timedelta

from passlib.context import CryptContext

from app.repositories import medical_repository
from app.simulator.buffers.buffers import SimulatorBuffers
from app.simulator.config.simulator_config import SimulatorConfig
from app.simulator.generators.activity_generator import generate_activity
from app.simulator.generators.doctor_generator import generate_doctor_payloads
from app.simulator.generators.patient_generator import (
    choose_medication_profile,
    generate_address,
    generate_patient_identity,
    generate_patient_profile,
    generate_phone_candidate,
)
from app.simulator.generators.vitals_generator import generate_vitals
from app.simulator.logic.activity_logic import (
    create_critical_flow,
    create_warning_flow,
    random_activity_probability_for_state,
)
from app.simulator.logic.discharge_logic import (
    derive_outcome_from_alert_evolution,
    is_patient_discharge_eligible,
)
from app.simulator.logic.patient_state_logic import evaluate_patient_state, handle_state_transition
from app.simulator.logic.transfer_logic import transfer_patient
from app.simulator.messaging.kafka_producer import SimulatorKafkaProducer
from app.simulator.repositories.simulator_repository import SimulatorRepository
from app.utils.datetime import now_utc


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


ALERT_SEVERITY_SCORE = {
    "critical": 4,
    "high": 3,
    "medium": 2,
    "low": 1,
    "normal": 0,
}

BASE_LOOKBACK_DAYS_RANGE = (30, 730)
VITAL_STEP_MINUTES_RANGE = (4, 12)
ACTIVITY_STEP_HOURS_RANGE = (6, 48)
MEDICATION_STEP_DAYS_RANGE = (5, 28)
HISTORICAL_VITAL_SAMPLES_RANGE = (48, 180)
MAX_OUTCOME_HISTORY = 400
ALERT_COOLDOWN_MINUTES_RANGE = (5, 15)
ALERT_PROBABILITY_BY_SEVERITY = {
    "critical": 0.04,
    "high": 0.12,
    "normal": 0.25,
}


class SimulatorService:
    def __init__(
        self,
        *,
        config: SimulatorConfig,
        buffers: SimulatorBuffers,
        repository: SimulatorRepository,
        producer: SimulatorKafkaProducer,
    ):
        self.config = config
        self.buffers = buffers
        self.repository = repository
        self.producer = producer
        self.active_patients: list[dict] = []
        self.counter = 1

    def initialize(self) -> None:
        departments = medical_repository.get_all_departments()
        if not departments:
            return

        with self.repository.session_scope() as db:
            if self.repository.get_doctor_count(db) > 0:
                return

            password_hash = pwd_context.hash("password123")
            for payload in generate_doctor_payloads(count=40, departments=departments, password_hash=password_hash):
                self.repository.create_doctor(db, payload)

    def run_cycle(self) -> None:
        with self.repository.session_scope() as db:
            activities_created_in_cycle: set[int] = set()

            if random.random() < self.config.patient_spawn_probability:
                patient_data = self._create_patient(db, self.counter)
                if patient_data is not None:
                    db.commit()
                    self.active_patients.append(patient_data)
                    self.counter += 1

            next_active_patients: list[dict] = []
            for patient_data in self.active_patients:
                should_keep = self._process_patient(db, patient_data, activities_created_in_cycle)
                if should_keep:
                    next_active_patients.append(patient_data)

            self.active_patients = next_active_patients

    def _create_patient(self, db, index: int) -> dict | None:
        counties = medical_repository.get_all_counties()
        drugs = medical_repository.get_all_medications()
        diagnoses = medical_repository.get_all_diagnoses()
        conditions = medical_repository.get_all_conditions()
        allergies = medical_repository.get_all_allergies()
        dosages = medical_repository.get_all_dosages()
        frequencies = medical_repository.get_all_frequencies()
        if not counties or not drugs or not diagnoses or not conditions or not dosages or not frequencies:
            return None

        doctor = self.repository.get_random_doctor(db)
        if doctor is None:
            return None

        identity = generate_patient_identity(index, doctor.specialization)
        address_payload = generate_address(counties)
        medication_profile = choose_medication_profile(drugs, identity["is_pregnant"])
        if medication_profile is None:
            return None

        now = now_utc()
        base_time = self._generate_base_time(now)
        segment = self._pick_patient_segment()
        admission_date = self._build_admission_date(base_time=base_time, now=now, segment=segment)

        diagnosis_seed = next(
            (label for label in diagnoses if medication_profile["condition_name"].lower() in label.lower()),
            None,
        )

        address = self.repository.create_address(db, address_payload)
        patient = self.repository.create_patient(
            db,
            {
                **identity,
                "phone_number": self._generate_unique_phone(db),
                "discharge_date": None,
                "discharge_reason": None,
                "address_id": address.id,
            },
        )

        self.repository.assign_doctor_to_patient(db, doctor.id, patient.id)
        self.repository.create_encounter(
            db,
            patient_id=patient.id,
            doctor_id=doctor.id,
            encounter_type="admission",
            chief_complaint="Auto generated",
            created_at=admission_date,
        )
        self.repository.create_admission_history(
            db,
            patient_id=patient.id,
            doctor_id=doctor.id,
            entry_type="admission",
            reason=None,
            note=self._admission_note_from_arrival_method(patient.arrival_method),
            created_at=admission_date,
        )

        if patient.is_pregnant:
            pregnancy_doctors = self.repository.get_assigned_doctors_for_patient_department(db, patient.id, patient.department)
            if pregnancy_doctors:
                pregnancy_doctor = random.choice(pregnancy_doctors)
                scheduled_at = self._clamp_to_now(admission_date + timedelta(days=1))
                self.repository.add_doctor_activity(
                    db,
                    doctor_id=pregnancy_doctor.id,
                    patient_id=patient.id,
                    activity_type="PROCEDURE",
                    title="Childbirth preparation",
                    description="Pregnancy monitoring and delivery planning",
                    status="incoming",
                    scheduled_at=scheduled_at,
                    created_at=admission_date + timedelta(hours=2),
                )

        self._seed_patient_medical_records(
            db,
            patient_id=patient.id,
            doctor_id=doctor.id,
            base_condition=medication_profile["condition_name"],
            diagnosis_seed=diagnosis_seed,
            medication_name=medication_profile["medication_name"],
            base_time=base_time,
            admission_date=admission_date,
            now=now,
            all_conditions=conditions,
            all_diagnoses=diagnoses,
            all_allergies=allergies,
            dosages=dosages,
            frequencies=frequencies,
        )

        patient_data = {
            "id": patient.id,
            "condition": medication_profile["condition_name"],
            "diagnosis": diagnosis_seed,
            "segment": segment,
            "base_time": base_time,
            "admission_date": admission_date,
            "timeline_cursor": admission_date,
            "patient_outcome_history": [],
            "last_alert_evaluation": {"count": 0, "severity_score": 0},
            "alert_cooldown_minutes": random.randint(*ALERT_COOLDOWN_MINUTES_RANGE),
            "last_alert_timestamp": None,
            "last_alert_by_type": {},
        }

        self._seed_historical_activities(db, patient, patient_data)
        self._seed_historical_vitals_and_alerts(db, patient, patient_data)

        return patient_data

    def _seed_patient_medical_records(
        self,
        db,
        *,
        patient_id: int,
        doctor_id: int,
        base_condition: str,
        diagnosis_seed: str | None,
        medication_name: str,
        base_time: datetime,
        admission_date: datetime,
        now: datetime,
        all_conditions: list[str],
        all_diagnoses: list[str],
        all_allergies: list[str],
        dosages: list[str],
        frequencies: list[str],
    ) -> None:
        profile = generate_patient_profile(
            base_condition=base_condition,
            diagnosis_seed=diagnosis_seed,
            all_conditions=all_conditions,
            all_diagnoses=all_diagnoses,
            all_allergies=all_allergies,
            dosages=dosages,
            frequencies=frequencies,
        )

        diagnosis_cursor = max(base_time, admission_date - timedelta(days=random.randint(5, 30)))
        for diagnosis in profile["diagnoses"]:
            diagnosis_cursor = self._advance_time(diagnosis_cursor, timedelta(days=1), timedelta(days=12))
            diagnosed_at = self._clamp_to_now(diagnosis_cursor)
            self.repository.create_patient_diagnosis(
                db,
                patient_id=patient_id,
                doctor_id=doctor_id,
                diagnosis=diagnosis,
                status=random.choice(["active", "improving", "stable", "worsening", "chronic"]),
                created_at=diagnosed_at,
            )

        condition_cursor = max(base_time, admission_date - timedelta(days=random.randint(3, 20)))
        for label in profile["conditions"]:
            condition = self.repository.get_or_create_condition(
                db,
                name=label,
                status=random.choice(["active", "stable", "worsening", "chronic"]),
            )
            if self.repository.has_condition_assignment(db, patient_id=patient_id, condition_id=condition.id):
                continue

            condition_cursor = self._advance_time(condition_cursor, timedelta(days=1), timedelta(days=10))
            diagnosed_at = self._clamp_to_now(condition_cursor)
            self.repository.create_condition_assignment(
                db,
                patient_id=patient_id,
                condition_id=condition.id,
                doctor_id=doctor_id,
                status=random.choice(["active", "monitoring", "stable", "chronic"]),
                diagnosed_at=diagnosed_at,
            )

        medication_cursor = max(admission_date, base_time)
        medication_count = random.randint(2, 5)
        medication_candidates = [
            medication_name,
            *random.sample(profile.get("medications", []), k=min(2, len(profile.get("medications", [])))),
        ]
        for medication_index in range(medication_count):
            medication_cursor = self._advance_time(
                medication_cursor,
                timedelta(days=MEDICATION_STEP_DAYS_RANGE[0]),
                timedelta(days=MEDICATION_STEP_DAYS_RANGE[1]),
            )
            created_at = self._clamp_to_now(medication_cursor)
            if created_at >= now:
                break

            selected_medication = medication_candidates[min(medication_index, len(medication_candidates) - 1)]
            self.repository.create_patient_medication(
                db,
                patient_id=patient_id,
                doctor_id=doctor_id,
                name=selected_medication,
                dosage=profile["dosage"],
                frequency=profile["frequency"],
                created_at=created_at,
            )

        allergy_cursor = base_time
        for allergy in profile["allergies"]:
            allergy_cursor = self._advance_time(allergy_cursor, timedelta(days=7), timedelta(days=45))
            created_at = self._clamp_to_now(allergy_cursor)
            self.repository.create_patient_allergy(
                db,
                patient_id=patient_id,
                doctor_id=doctor_id,
                allergy_name=allergy,
                severity=random.choice(["mild", "moderate", "severe"]),
                created_at=created_at,
            )

    def _seed_historical_activities(self, db, patient, patient_data: dict) -> None:
        doctors = self.repository.get_assigned_doctors_for_patient_department(db, patient.id, patient.department)
        if not doctors:
            return

        doctor = random.choice(doctors)
        now = now_utc()
        base_time = patient_data["base_time"]
        activity_cursor = max(base_time, patient_data["admission_date"])
        segment = patient_data["segment"]

        completed_count = random.randint(2, 5)
        for _ in range(completed_count):
            activity_cursor = self._advance_time(
                activity_cursor,
                timedelta(hours=ACTIVITY_STEP_HOURS_RANGE[0]),
                timedelta(hours=ACTIVITY_STEP_HOURS_RANGE[1]),
            )
            created_at = self._clamp_to_now(activity_cursor)
            scheduled_at = self._clamp_to_now(created_at + timedelta(hours=random.randint(1, 6)))
            self.repository.add_doctor_activity(
                db,
                doctor_id=doctor.id,
                patient_id=patient.id,
                activity_type=random.choice(["Consultation", "Procedure", "Lab test"]),
                title="Follow-up care",
                description="Scheduled follow-up based on patient progression",
                status="completed",
                scheduled_at=scheduled_at,
                created_at=created_at,
            )

        if segment in {"active", "critical"}:
            incoming_count = 1 if segment == "active" else random.randint(2, 3)
            for _ in range(incoming_count):
                created_at = self._clamp_to_now(now - timedelta(hours=random.randint(1, 48)))
                scheduled_at = self._clamp_to_now(created_at + timedelta(hours=random.randint(1, 12)))
                self.repository.add_doctor_activity(
                    db,
                    doctor_id=doctor.id,
                    patient_id=patient.id,
                    activity_type=random.choice(["Procedure", "Consultation", "Lab test", "Surgery"]),
                    title="Pending intervention",
                    description="Queued based on latest patient evolution",
                    status="incoming",
                    scheduled_at=scheduled_at,
                    created_at=created_at,
                )
        else:
            canceled_created_at = self._clamp_to_now(now - timedelta(days=random.randint(2, 15)))
            self.repository.add_doctor_activity(
                db,
                doctor_id=doctor.id,
                patient_id=patient.id,
                activity_type="Consultation",
                title="Canceled reassessment",
                description="No longer needed due to recovery progression",
                status="canceled",
                scheduled_at=canceled_created_at,
                created_at=canceled_created_at,
            )

    def _seed_historical_vitals_and_alerts(self, db, patient, patient_data: dict) -> None:
        now = now_utc()
        admission_date = patient_data["admission_date"]
        vital_count = random.randint(*HISTORICAL_VITAL_SAMPLES_RANGE)
        cursor = admission_date

        for index in range(vital_count):
            cursor = self._advance_time(
                cursor,
                timedelta(minutes=VITAL_STEP_MINUTES_RANGE[0]),
                timedelta(minutes=VITAL_STEP_MINUTES_RANGE[1]),
            )
            recorded_at = self._clamp_to_now(cursor)
            if recorded_at >= now:
                break

            progress = (index + 1) / max(vital_count, 1)
            vitals = self._generate_vitals_for_segment(patient_data["segment"], progress)
            vital = self.repository.create_vital_safe(db, patient.id, vitals, recorded_at=recorded_at)
            if vital is None:
                break

            alert_stats = self._create_alerts(
                db,
                patient.id,
                vital.id,
                vitals,
                patient_data=patient_data,
                recorded_at=recorded_at,
                emit_events=False,
                include_buffer=False,
            )
            self._record_outcome_evaluation(patient_data, recorded_at=recorded_at, alert_stats=alert_stats)

        patient_data["timeline_cursor"] = min(self._clamp_to_now(cursor), now - timedelta(minutes=1))

    def _process_patient(self, db, patient_data: dict, activities_created_in_cycle: set[int]) -> bool:
        patient_id = patient_data.get("id")
        if patient_id is None:
            return False

        patient = self.repository.get_patient(db, patient_id)
        if patient is None or patient.is_discharged:
            return False

        timeline_cursor = patient_data.get("timeline_cursor") or now_utc()
        timeline_cursor = self._advance_time(
            timeline_cursor,
            timedelta(minutes=VITAL_STEP_MINUTES_RANGE[0]),
            timedelta(minutes=VITAL_STEP_MINUTES_RANGE[1]),
        )
        event_time = self._clamp_to_now(timeline_cursor)
        patient_data["timeline_cursor"] = event_time

        progress_total = max(1.0, (now_utc() - patient_data["admission_date"]).total_seconds())
        progress_done = max(0.0, (event_time - patient_data["admission_date"]).total_seconds())
        progress_ratio = min(1.0, progress_done / progress_total)

        vitals = self._generate_vitals_for_segment(patient_data.get("segment", "active"), progress_ratio)
        vital = self.repository.create_vital_safe(db, patient.id, vitals, recorded_at=event_time)
        if vital is None:
            return False

        self.buffers.append_vital_sample(patient.id, vitals)

        new_state = evaluate_patient_state(vitals)
        _, transitioned_state = handle_state_transition(patient.id, new_state, self.buffers.patient_states)

        if transitioned_state == "critical":
            self._handle_critical_flow(db, patient, activities_created_in_cycle, reference_time=event_time)
        elif transitioned_state == "warning":
            self._handle_warning_flow(db, patient, activities_created_in_cycle, reference_time=event_time)

        alert_stats = self._create_alerts(
            db,
            patient.id,
            vital.id,
            vitals,
            patient_data=patient_data,
            recorded_at=event_time,
        )
        self._record_outcome_evaluation(patient_data, recorded_at=event_time, alert_stats=alert_stats)

        if self.buffers.should_stream_patient_vitals(patient.id):
            self.producer.send_vital(
                {
                    "event": "vital",
                    "patient_id": patient.id,
                    **vitals,
                }
            )

        probability = random_activity_probability_for_state(
            new_state,
            self.config.base_random_activity_probability,
            self.config.random_activity_state_multiplier or {},
        )
        if random.random() < probability:
            self._maybe_generate_random_activity(
                db,
                patient_id=patient.id,
                patient_department=patient.department,
                source_condition=patient_data.get("condition"),
                source_diagnosis=patient_data.get("diagnosis"),
                activities_created_in_cycle=activities_created_in_cycle,
                reference_time=event_time,
            )

        if not patient.is_discharged:
            self._handle_stable_flow(db, patient, patient_data, current_state=new_state, event_time=event_time)

        return not patient.is_discharged

    def _handle_critical_flow(self, db, patient, activities_created_in_cycle: set[int], *, reference_time: datetime) -> None:
        if not self._can_create_patient_activity(db, patient.id, activities_created_in_cycle):
            return

        if patient.is_discharged:
            return

        doctors = self.repository.get_assigned_doctors_for_patient_department(db, patient.id, patient.department)
        if not doctors:
            self._transfer_patient(db, patient, reference_time=reference_time)
            return
        doctor = random.choice(doctors)

        activity = create_critical_flow(reference_time)
        created_activity = self.repository.add_doctor_activity(
            db,
            doctor_id=doctor.id,
            patient_id=patient.id,
            activity_type=activity["type"],
            title=activity["title"],
            description=activity["description"],
            status=activity["status"],
            scheduled_at=self._clamp_to_now(activity["scheduled_at"]),
            created_at=reference_time,
        )
        if created_activity is not None:
            self.buffers.mark_activity_created(patient.id, activities_created_in_cycle)

    def _handle_warning_flow(self, db, patient, activities_created_in_cycle: set[int], *, reference_time: datetime) -> None:
        if not self._can_create_patient_activity(db, patient.id, activities_created_in_cycle):
            return

        if patient.is_discharged:
            return

        doctors = self.repository.get_assigned_doctors_for_patient_department(db, patient.id, patient.department)
        if not doctors:
            return
        doctor = random.choice(doctors)

        activity = create_warning_flow(reference_time)
        created_activity = self.repository.add_doctor_activity(
            db,
            doctor_id=doctor.id,
            patient_id=patient.id,
            activity_type=activity["type"],
            title=activity["title"],
            description=activity["description"],
            status=activity["status"],
            scheduled_at=self._clamp_to_now(activity["scheduled_at"]),
            created_at=reference_time,
        )
        if created_activity is not None:
            self.buffers.mark_activity_created(patient.id, activities_created_in_cycle)

    def _handle_stable_flow(self, db, patient, patient_data: dict, *, current_state: str, event_time: datetime) -> None:
        has_pending = self.repository.count_incoming_activities(db, patient.id) > 0
        outcome_history = patient_data.get("patient_outcome_history", [])
        admission_date = patient_data.get("admission_date")

        if not is_patient_discharge_eligible(
            now=event_time,
            admission_date=admission_date,
            outcome_history=outcome_history,
            has_incoming_activities=has_pending,
            patient_state=current_state,
        ):
            return

        self.repository.mark_patient_discharged(db, patient, "Recovered", event_time)
        doctor_id = self.repository.get_first_assigned_doctor_id(db, patient.id)
        if doctor_id is not None:
            self.repository.create_admission_history(
                db,
                patient_id=patient.id,
                doctor_id=doctor_id,
                entry_type="discharge",
                reason="Recovered",
                note=None,
                created_at=event_time,
            )

    def _transfer_patient(self, db, patient, *, reference_time: datetime) -> None:
        assigned_doctors = self.repository.get_assigned_doctors_for_patient_department(db, patient.id, patient.department)
        if any(self.repository.doctor_has_incoming_activities(db, doctor.id) for doctor in assigned_doctors):
            return

        departments = medical_repository.get_all_departments()
        candidate_departments = [dept for dept in departments if dept != patient.department]
        if not candidate_departments:
            return

        new_department = random.choice(candidate_departments)
        new_doctor = self.repository.get_random_doctor_for_department(db, new_department)
        if new_doctor is None:
            return

        transfer_details = transfer_patient(new_department)
        patient.department = transfer_details["new_department"]

        self.repository.remove_patient_assignments(db, patient.id)
        self.repository.assign_doctor_to_patient(db, new_doctor.id, patient.id)

        activity = transfer_details["activity"]
        self.repository.add_doctor_activity(
            db,
            doctor_id=new_doctor.id,
            patient_id=patient.id,
            activity_type=activity["type"],
            title=activity["title"],
            description=activity["description"],
            status=activity["status"],
            scheduled_at=activity["scheduled_at"],
            created_at=reference_time,
        )

    def _create_alerts(
        self,
        db,
        patient_id: int,
        vital_id: int,
        vitals: dict,
        *,
        patient_data: dict,
        recorded_at: datetime,
        emit_events: bool = True,
        include_buffer: bool = True,
    ) -> dict:
        count = 0
        severity_score = 0

        def maybe_create_alert(*, alert_type: str, value: int, severity: str, message: str) -> bool:
            probability = ALERT_PROBABILITY_BY_SEVERITY.get(severity, 0.1)
            if random.random() >= probability:
                return False

            cooldown_minutes = int(patient_data.get("alert_cooldown_minutes", 10))
            cooldown = timedelta(minutes=max(1, cooldown_minutes))
            last_alert_timestamp = patient_data.get("last_alert_timestamp")
            if isinstance(last_alert_timestamp, datetime) and recorded_at - last_alert_timestamp < cooldown:
                return False

            dedupe_key = f"{alert_type}:{value}"
            last_by_type = patient_data.setdefault("last_alert_by_type", {})
            last_seen = last_by_type.get(alert_type)
            if last_seen == dedupe_key:
                return False

            if emit_events:
                self.producer.send_alert(
                    {
                        "event": "alert",
                        "patient_id": patient_id,
                        "type": alert_type,
                        "value": value,
                        "severity": severity,
                    }
                )
            self.repository.create_alert(
                db,
                patient_id=patient_id,
                vital_id=vital_id,
                alert_type=alert_type,
                message=message,
                severity=severity,
                created_at=recorded_at,
            )
            if include_buffer:
                self.buffers.append_alert_sample(patient_id, alert_type)

            patient_data["last_alert_timestamp"] = recorded_at
            last_by_type[alert_type] = dedupe_key
            return True

        if vitals["heart_rate"] > 120 and maybe_create_alert(
            alert_type="heart_rate",
            value=vitals["heart_rate"],
            severity="high",
            message=f"High heart rate detected: {vitals['heart_rate']} bpm",
        ):
            count += 1
            severity_score += ALERT_SEVERITY_SCORE["high"]

        if vitals["oxygen_saturation"] < 90 and maybe_create_alert(
            alert_type="oxygen",
            value=vitals["oxygen_saturation"],
            severity="critical",
            message=f"Low oxygen saturation detected: {vitals['oxygen_saturation']}%",
        ):
            count += 1
            severity_score += ALERT_SEVERITY_SCORE["critical"]

        if vitals["temperature"] > 38 and maybe_create_alert(
            alert_type="temperature",
            value=vitals["temperature"],
            severity="high",
            message=f"Elevated temperature detected: {vitals['temperature']}°C",
        ):
            count += 1
            severity_score += ALERT_SEVERITY_SCORE["high"]

        if count == 0 and maybe_create_alert(
            alert_type="status",
            value=vitals["heart_rate"],
            severity="normal",
            message=(
                "Vitals within normal ranges: "
                f"HR {vitals['heart_rate']} bpm, "
                f"SpO2 {vitals['oxygen_saturation']}%, "
                f"Temp {vitals['temperature']}°C"
            ),
        ):
            pass

        return {
            "count": count,
            "severity_score": severity_score,
        }

    def _record_outcome_evaluation(self, patient_data: dict, *, recorded_at: datetime, alert_stats: dict) -> None:
        previous = patient_data.get("last_alert_evaluation") or {"count": 0, "severity_score": 0}
        outcome = derive_outcome_from_alert_evolution(
            before_count=int(previous.get("count", 0)),
            after_count=int(alert_stats.get("count", 0)),
            before_severity_score=int(previous.get("severity_score", 0)),
            after_severity_score=int(alert_stats.get("severity_score", 0)),
        )

        history = patient_data.setdefault("patient_outcome_history", [])
        history.append(
            {
                "timestamp": recorded_at,
                "outcome": outcome,
            }
        )
        if len(history) > MAX_OUTCOME_HISTORY:
            del history[:-MAX_OUTCOME_HISTORY]

        patient_data["last_alert_evaluation"] = {
            "count": int(alert_stats.get("count", 0)),
            "severity_score": int(alert_stats.get("severity_score", 0)),
        }

    def _can_create_patient_activity(self, db, patient_id: int, activities_created_in_cycle: set[int]) -> bool:
        incoming_count = self.repository.count_incoming_activities(db, patient_id)
        return self.buffers.can_create_activity_for_patient(
            patient_id,
            incoming_count,
            activities_created_in_cycle,
        )

    def _maybe_generate_random_activity(
        self,
        db,
        *,
        patient_id: int,
        patient_department: str,
        source_condition: str | None,
        source_diagnosis: str | None,
        activities_created_in_cycle: set[int],
        reference_time: datetime,
    ) -> None:
        if not self._can_create_patient_activity(db, patient_id, activities_created_in_cycle):
            return

        patient = self.repository.get_patient(db, patient_id)
        if patient is None or patient.is_discharged:
            return

        doctors = self.repository.get_assigned_doctors_for_patient_department(db, patient_id, patient_department)
        if not doctors:
            return

        activity_types = medical_repository.get_all_activity_types()
        if not activity_types:
            return

        doctor = random.choice(doctors)
        activity_type = random.choice(activity_types)
        source = source_condition or source_diagnosis or "medical condition"
        activity = generate_activity(activity_type, source, reference_time=reference_time)

        created_activity = self.repository.add_doctor_activity(
            db,
            doctor_id=doctor.id,
            patient_id=patient_id,
            activity_type=activity["type"],
            title=activity["title"],
            description=activity["description"],
            status=activity["status"],
            scheduled_at=self._clamp_to_now(activity["scheduled_at"]),
            created_at=reference_time,
        )
        if created_activity is not None:
            self.buffers.mark_activity_created(patient_id, activities_created_in_cycle)

    def _generate_unique_phone(self, db) -> str:
        while True:
            candidate = generate_phone_candidate()
            if self.repository.is_phone_available(db, candidate):
                return candidate

    @staticmethod
    def _admission_note_from_arrival_method(arrival_method: str) -> str:
        if arrival_method == "ambulance":
            return "Arrived by ambulance"
        return "Arrived by themselves"

    @staticmethod
    def _generate_base_time(now: datetime) -> datetime:
        lookback_days = random.randint(*BASE_LOOKBACK_DAYS_RANGE)
        lookback_hours = random.randint(0, 23)
        lookback_minutes = random.randint(0, 59)
        return now - timedelta(days=lookback_days, hours=lookback_hours, minutes=lookback_minutes)

    @staticmethod
    def _pick_patient_segment() -> str:
        bucket = random.random()
        if bucket < 0.30:
            return "discharge_candidate"
        if bucket < 0.80:
            return "active"
        return "critical"

    def _build_admission_date(self, *, base_time: datetime, now: datetime, segment: str) -> datetime:
        if segment == "discharge_candidate":
            stay_days = random.randint(30, 240)
        elif segment == "critical":
            stay_days = random.randint(1, 40)
        else:
            stay_days = random.randint(10, 120)

        tentative_admission = now - timedelta(days=stay_days, hours=random.randint(0, 23))
        minimum_admission = base_time + timedelta(days=1)
        admission = max(tentative_admission, minimum_admission)
        return self._clamp_to_now(admission)

    def _generate_vitals_for_segment(self, segment: str, progress: float) -> dict:
        vitals = generate_vitals()

        if segment == "discharge_candidate":
            stabilization = min(1.0, max(0.0, progress))
            vitals["heart_rate"] = random.randint(76, 96)
            vitals["oxygen_saturation"] = random.randint(95, 99)
            vitals["temperature"] = random.randint(36, 37)
            vitals["systolic_bp"] = random.randint(112, 128)
            vitals["diastolic_bp"] = random.randint(72, 84)
            if stabilization < 0.25 and random.random() < 0.2:
                vitals["heart_rate"] = random.randint(102, 118)

        elif segment == "critical":
            vitals["heart_rate"] = random.randint(122, 145)
            vitals["oxygen_saturation"] = random.randint(84, 91)
            vitals["temperature"] = random.randint(38, 40)
            vitals["systolic_bp"] = random.randint(140, 170)
            vitals["diastolic_bp"] = random.randint(90, 110)

        else:
            if random.random() < 0.55:
                vitals["heart_rate"] = random.randint(78, 105)
                vitals["oxygen_saturation"] = random.randint(92, 98)
                vitals["temperature"] = random.randint(36, 38)
                vitals["systolic_bp"] = random.randint(115, 140)
                vitals["diastolic_bp"] = random.randint(74, 92)
            else:
                vitals["heart_rate"] = random.randint(108, 130)
                vitals["oxygen_saturation"] = random.randint(88, 94)
                vitals["temperature"] = random.randint(37, 39)
                vitals["systolic_bp"] = random.randint(130, 160)
                vitals["diastolic_bp"] = random.randint(84, 104)

        return vitals

    @staticmethod
    def _advance_time(current: datetime, min_delta: timedelta, max_delta: timedelta) -> datetime:
        delta_seconds = random.randint(int(min_delta.total_seconds()), int(max_delta.total_seconds()))
        return current + timedelta(seconds=delta_seconds)

    @staticmethod
    def _clamp_to_now(candidate: datetime) -> datetime:
        return min(candidate, now_utc())
