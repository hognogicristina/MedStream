from __future__ import annotations

import random
from datetime import timedelta

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
    handle_stable_flow,
    maybe_random_discharge,
    pick_discharge_reason,
    try_discharge_patient,
)
from app.simulator.logic.patient_state_logic import evaluate_patient_state, handle_state_transition
from app.simulator.logic.transfer_logic import transfer_patient
from app.simulator.messaging.kafka_producer import SimulatorKafkaProducer
from app.simulator.repositories.simulator_repository import SimulatorRepository
from app.utils.datetime import now_utc


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


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
        )
        self.repository.create_admission_history(
            db,
            patient_id=patient.id,
            doctor_id=doctor.id,
            entry_type="admission",
            reason=None,
            note=self._admission_note_from_arrival_method(patient.arrival_method),
            created_at=now - timedelta(hours=random.randint(1, 48)),
        )

        if patient.is_pregnant:
            pregnancy_doctors = self.repository.get_assigned_doctors_for_patient_department(db, patient.id, patient.department)
            if pregnancy_doctors:
                pregnancy_doctor = random.choice(pregnancy_doctors)
                activity = {
                    "type": "PROCEDURE",
                    "title": "Childbirth preparation",
                    "description": "Pregnancy monitoring and delivery planning",
                    "status": "incoming",
                    "scheduled_at": now_utc() + timedelta(days=1),
                }
                self.repository.add_doctor_activity(
                    db,
                    doctor_id=pregnancy_doctor.id,
                    patient_id=patient.id,
                    activity_type=activity["type"],
                    title=activity["title"],
                    description=activity["description"],
                    status=activity["status"],
                    scheduled_at=activity["scheduled_at"],
                )

        self._seed_patient_medical_records(
            db,
            patient_id=patient.id,
            doctor_id=doctor.id,
            base_condition=medication_profile["condition_name"],
            diagnosis_seed=diagnosis_seed,
            medication_name=medication_profile["medication_name"],
            now=now,
            all_conditions=conditions,
            all_diagnoses=diagnoses,
            all_allergies=allergies,
            dosages=dosages,
            frequencies=frequencies,
        )

        return {
            "id": patient.id,
            "condition": medication_profile["condition_name"],
            "diagnosis": diagnosis_seed,
        }

    def _seed_patient_medical_records(
        self,
        db,
        *,
        patient_id: int,
        doctor_id: int,
        base_condition: str,
        diagnosis_seed: str | None,
        medication_name: str,
        now,
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

        for diagnosis in profile["diagnoses"]:
            diagnosed_at = now - timedelta(days=random.randint(2, 42), hours=random.randint(0, 23))
            self.repository.create_patient_diagnosis(
                db,
                patient_id=patient_id,
                doctor_id=doctor_id,
                diagnosis=diagnosis,
                status=random.choice(["active", "improving", "stable", "worsening", "chronic"]),
                created_at=diagnosed_at,
            )

        for label in profile["conditions"]:
            condition = self.repository.get_or_create_condition(
                db,
                name=label,
                status=random.choice(["active", "stable", "worsening", "chronic"]),
            )

            if self.repository.has_condition_assignment(db, patient_id=patient_id, condition_id=condition.id):
                continue

            diagnosed_at = now - timedelta(days=random.randint(3, 56), hours=random.randint(0, 23))
            self.repository.create_condition_assignment(
                db,
                patient_id=patient_id,
                condition_id=condition.id,
                doctor_id=doctor_id,
                status=random.choice(["active", "monitoring", "stable", "chronic"]),
                diagnosed_at=diagnosed_at,
            )

        medication_created_at = now - timedelta(days=random.randint(1, 30), hours=random.randint(0, 23))
        self.repository.create_patient_medication(
            db,
            patient_id=patient_id,
            doctor_id=doctor_id,
            name=medication_name,
            dosage=profile["dosage"],
            frequency=profile["frequency"],
            created_at=medication_created_at,
        )

        for allergy in profile["allergies"]:
            allergy_created_at = now - timedelta(days=random.randint(7, 90), hours=random.randint(0, 23))
            self.repository.create_patient_allergy(
                db,
                patient_id=patient_id,
                doctor_id=doctor_id,
                allergy_name=allergy,
                severity=random.choice(["mild", "moderate", "severe"]),
                created_at=allergy_created_at,
            )

    def _process_patient(self, db, patient_data: dict, activities_created_in_cycle: set[int]) -> bool:
        patient_id = patient_data.get("id")
        if patient_id is None:
            return False

        patient = self.repository.get_patient(db, patient_id)
        if patient is None or patient.is_discharged:
            return False

        if maybe_random_discharge(self.config.random_discharge_probability):
            reason = pick_discharge_reason()
            discharged_at = now_utc()
            self.repository.mark_patient_discharged(db, patient, reason, discharged_at)
            doctor_id = self.repository.get_first_assigned_doctor_id(db, patient.id)
            if doctor_id is not None:
                self.repository.create_admission_history(
                    db,
                    patient_id=patient.id,
                    doctor_id=doctor_id,
                    entry_type="discharge",
                    reason=reason,
                    note=None,
                    created_at=discharged_at,
                )
            return False

        vitals = generate_vitals()
        self.buffers.append_vital_sample(patient.id, vitals)
        vital = self.repository.create_vital_safe(db, patient.id, vitals)
        if vital is None:
            return False

        new_state = evaluate_patient_state(vitals)
        _, transitioned_state = handle_state_transition(patient.id, new_state, self.buffers.patient_states)

        if transitioned_state == "critical":
            self._handle_critical_flow(db, patient, activities_created_in_cycle)
        elif transitioned_state == "warning":
            self._handle_warning_flow(db, patient, activities_created_in_cycle)
        elif transitioned_state == "stable":
            self._handle_stable_flow(db, patient)

        self._create_alerts(db, patient.id, vital.id, vitals)

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
            )

        return not patient.is_discharged

    def _handle_critical_flow(self, db, patient, activities_created_in_cycle: set[int]) -> None:
        if not self._can_create_patient_activity(db, patient.id, activities_created_in_cycle):
            return

        if patient.is_discharged:
            return

        doctors = self.repository.get_assigned_doctors_for_patient_department(db, patient.id, patient.department)
        if not doctors:
            self._transfer_patient(db, patient)
            return
        doctor = random.choice(doctors)

        activity = create_critical_flow()
        created_activity = self.repository.add_doctor_activity(
            db,
            doctor_id=doctor.id,
            patient_id=patient.id,
            activity_type=activity["type"],
            title=activity["title"],
            description=activity["description"],
            status=activity["status"],
            scheduled_at=activity["scheduled_at"],
        )
        if created_activity is not None:
            self.buffers.mark_activity_created(patient.id, activities_created_in_cycle)

    def _handle_warning_flow(self, db, patient, activities_created_in_cycle: set[int]) -> None:
        if not self._can_create_patient_activity(db, patient.id, activities_created_in_cycle):
            return

        if patient.is_discharged:
            return

        doctors = self.repository.get_assigned_doctors_for_patient_department(db, patient.id, patient.department)
        if not doctors:
            return
        doctor = random.choice(doctors)

        activity = create_warning_flow()
        created_activity = self.repository.add_doctor_activity(
            db,
            doctor_id=doctor.id,
            patient_id=patient.id,
            activity_type=activity["type"],
            title=activity["title"],
            description=activity["description"],
            status=activity["status"],
            scheduled_at=activity["scheduled_at"],
        )
        if created_activity is not None:
            self.buffers.mark_activity_created(patient.id, activities_created_in_cycle)

    def _handle_stable_flow(self, db, patient) -> None:
        should_evaluate_discharge = handle_stable_flow(
            patient_id=patient.id,
            now=now_utc(),
            patient_last_normal_time=self.buffers.patient_last_normal_time,
        )
        if not should_evaluate_discharge:
            return

        has_pending = self.repository.count_incoming_activities(db, patient.id) > 0
        if try_discharge_patient(has_pending):
            self.repository.mark_patient_discharged(db, patient, "Recovered", now_utc())

    def _transfer_patient(self, db, patient) -> None:
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
        )

    def _create_alerts(self, db, patient_id: int, vital_id: int, vitals: dict) -> None:
        alerts_created = []

        if vitals["heart_rate"] > 120:
            payload = {
                "event": "alert",
                "patient_id": patient_id,
                "type": "heart_rate",
                "value": vitals["heart_rate"],
                "severity": "high",
            }
            self.producer.send_alert(payload)
            self.repository.create_alert(
                db,
                patient_id=patient_id,
                vital_id=vital_id,
                alert_type="heart_rate",
                message=f"High heart rate: {vitals['heart_rate']}",
                severity="high",
            )
            self.buffers.append_alert_sample(patient_id, "heart_rate")
            alerts_created.append("heart_rate")

        if vitals["oxygen_saturation"] < 90:
            payload = {
                "event": "alert",
                "patient_id": patient_id,
                "type": "oxygen",
                "value": vitals["oxygen_saturation"],
                "severity": "critical",
            }
            self.producer.send_alert(payload)
            self.repository.create_alert(
                db,
                patient_id=patient_id,
                vital_id=vital_id,
                alert_type="oxygen",
                message=f"Low oxygen: {vitals['oxygen_saturation']}",
                severity="critical",
            )
            self.buffers.append_alert_sample(patient_id, "oxygen")
            alerts_created.append("oxygen")

        if vitals["temperature"] > 38:
            payload = {
                "event": "alert",
                "patient_id": patient_id,
                "type": "temperature",
                "value": vitals["temperature"],
                "severity": "high",
            }
            self.producer.send_alert(payload)
            self.repository.create_alert(
                db,
                patient_id=patient_id,
                vital_id=vital_id,
                alert_type="temperature",
                message=f"Fever: {vitals['temperature']}",
                severity="high",
            )
            self.buffers.append_alert_sample(patient_id, "temperature")
            alerts_created.append("temperature")

        if alerts_created:
            return

        payload = {
            "event": "alert",
            "patient_id": patient_id,
            "type": "status",
            "value": vitals["heart_rate"],
            "severity": "normal",
        }
        self.producer.send_alert(payload)
        self.repository.create_alert(
            db,
            patient_id=patient_id,
            vital_id=vital_id,
            alert_type="status",
            message="Patient stable",
            severity="normal",
        )
        self.buffers.append_alert_sample(patient_id, "status")

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
        activity = generate_activity(activity_type, source)

        created_activity = self.repository.add_doctor_activity(
            db,
            doctor_id=doctor.id,
            patient_id=patient_id,
            activity_type=activity["type"],
            title=activity["title"],
            description=activity["description"],
            status=activity["status"],
            scheduled_at=activity["scheduled_at"],
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
