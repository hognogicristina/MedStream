from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import desc, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import joinedload, selectinload

from app.db.session import SessionLocal
from app.models.alert import Alert
from app.models.doctor.doctor import Doctor
from app.models.doctor.doctor_activity import DoctorActivity
from app.models.doctor.doctor_activity_patient import doctor_activity_patients
from app.models.patient.patient import Patient
from app.models.patient.patient_activity_doctor import patient_activity_doctors
from app.models.patient.patient_admission_history import PatientAdmissionHistory
from app.models.patient.patient_allergy import PatientAllergy
from app.models.patient.patient_condition import PatientCondition
from app.models.patient.patient_condition_assignment import PatientConditionAssignment
from app.models.patient.patient_diagnosis import PatientDiagnosis
from app.models.patient.patient_medication import PatientMedication
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
from app.core.errors import ValidationError


class PatientRepository:
    def __init__(self, address_repository: AddressRepository | None = None):
        self.address_repository = address_repository or AddressRepository()

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

        alert_labels = [f"{item.alert_type}: {item.message}" for item in closest_alerts]

        if not alert_labels and alerts:
            recent_alerts = sorted(alerts, key=lambda item: item.created_at, reverse=True)[:3]
            alert_labels = [f"{item.alert_type}: {item.message}" for item in recent_alerts]

        return {
            "alerts": alert_labels,
            "diagnoses": diagnosis_labels,
            "conditions": condition_labels,
        }

    def get_patient_treatment_analysis(self, patient_id: int) -> dict:
        with SessionLocal() as db:
            get_patient_or_raise(db, patient_id)

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

            diagnosis_labels = [entry.diagnosis for entry in diagnoses if entry.diagnosis]
            condition_labels = [
                f"{condition.name} ({assignment.status})"
                for condition, assignment in condition_rows
                if condition.name
            ]

            medications_payload = []
            for medication in medications:
                medications_payload.append(
                    {
                        "id": medication.id,
                        "name": medication.name,
                        "dosage": medication.dosage,
                        "frequency": medication.frequency,
                        "prescribed_at": medication.created_at,
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
                    "created_at": diagnosis.created_at,
                }
                for diagnosis in diagnoses
            ]

            alerts_payload = [
                {
                    "id": alert.id,
                    "alert_type": alert.alert_type,
                    "message": alert.message,
                    "severity": alert.severity,
                    "created_at": alert.created_at,
                }
                for alert in alerts
            ]

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
                        "title": alert.alert_type,
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
            self._cancel_incoming_patient_activities(db, patient.id)

            patient.is_discharged = True
            patient.discharge_reason = normalized_reason
            patient.discharge_date = datetime.now(timezone.utc)

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
            return db.execute(
                select(PatientCondition, PatientConditionAssignment)
                .join(PatientConditionAssignment, PatientConditionAssignment.condition_id == PatientCondition.id)
                .where(PatientConditionAssignment.patient_id == patient_id)
                .order_by(PatientCondition.name.asc(), PatientCondition.id.asc())
            ).all()

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

            return db.execute(
                select(PatientCondition, PatientConditionAssignment)
                .join(PatientConditionAssignment, PatientConditionAssignment.condition_id == PatientCondition.id)
                .where(PatientConditionAssignment.patient_id == patient.id)
                .order_by(PatientCondition.name.asc(), PatientCondition.id.asc())
            ).all()

    def update_condition_assignment(self, assignment_id: int, doctor_id: int, status: str | None, notes: str | None):
        with SessionLocal() as db:
            assignment = db.get(PatientConditionAssignment, assignment_id)
            if assignment is None:
                raise NotFoundError("ASSIGNMENT_NOT_FOUND")

            validate_patient_assignment(db, doctor_id, assignment.patient_id)
            validate_patient_editable(get_patient_or_raise(db, assignment.patient_id))

            if status is not None:
                assignment.status = validate_condition_status(status)

            if notes is not None:
                assignment.notes = normalize_optional_text(notes)

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
                .order_by(desc(PatientAllergy.created_at), desc(PatientAllergy.id))
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
                .order_by(desc(PatientDiagnosis.created_at), desc(PatientDiagnosis.id))
                .offset((page - 1) * page_size)
                .limit(page_size)
            ).scalars().all()

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
                diagnosis.status = validate_diagnosis_status(status)
                updated = True

            if note is not None:
                diagnosis.status_note = validate_required_text(note, "Note")
                updated = True

            validate_non_empty_update(updated, "NO_DIAGNOSIS_UPDATES")

            db.commit()
            db.refresh(diagnosis)
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
                name=validate_medication_name(name, is_pregnant=patient.is_pregnant),
                dosage=validate_dosage(dosage),
                frequency=validate_frequency(frequency),
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
                .order_by(desc(PatientMedication.created_at))
            ).scalars().all()

    def update_medication(self, medication_id: int, doctor_id: int, dosage: str | None, frequency: str | None, note: str) -> PatientMedication:
        with SessionLocal() as db:
            medication = db.get(PatientMedication, medication_id)
            if medication is None:
                raise NotFoundError("MEDICATION_NOT_FOUND")

            validate_patient_assignment(db, doctor_id, medication.patient_id)
            validate_patient_editable(get_patient_or_raise(db, medication.patient_id))

            updated = False
            if dosage is not None:
                medication.dosage = validate_dosage(dosage)
                updated = True

            if frequency is not None:
                medication.frequency = validate_frequency(frequency)
                updated = True

            validate_non_empty_update(updated, "NO_MEDICATION_UPDATES")

            medication.last_updated_note = validate_required_text(note, "Note")

            db.commit()
            db.refresh(medication)
            return medication

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
