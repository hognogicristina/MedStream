from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime

from sqlalchemy import func, select

from app.core.errors import ValidationError
from app.db.session import SessionLocal
from app.models.address.address import Address
from app.models.alert import Alert
from app.models.doctor.doctor import Doctor
from app.models.doctor.doctor_activity import DoctorActivity
from app.models.doctor.doctor_activity_patient import doctor_activity_patients
from app.models.encounter import Encounter
from app.models.patient.patient import Patient
from app.models.patient.patient_admission_history import PatientAdmissionHistory
from app.models.patient.patient_allergy import PatientAllergy
from app.models.patient.patient_condition import PatientCondition
from app.models.patient.patient_condition_assignment import PatientConditionAssignment
from app.models.patient.patient_diagnosis import PatientDiagnosis
from app.models.patient.patient_medication import PatientMedication
from app.models.vital import Vital
from app.service.assign_patients import assign_doctor_to_patient
from app.utils.datetime import now_utc
from app.validators.doctor_validators import validate_activity_creation


class SimulatorRepository:
    @contextmanager
    def session_scope(self):
        db = SessionLocal()
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def get_doctor_count(self, db) -> int:
        return db.query(Doctor).count()

    def create_doctor(self, db, payload: dict) -> Doctor:
        doctor = Doctor(**payload)
        db.add(doctor)
        return doctor

    def get_random_doctor(self, db) -> Doctor | None:
        return db.query(Doctor).order_by(func.random()).first()

    def get_random_doctor_for_department(self, db, department: str) -> Doctor | None:
        return db.query(Doctor).filter(Doctor.specialization == department).order_by(func.random()).first()

    def get_doctor(self, db, doctor_id: int) -> Doctor | None:
        return db.get(Doctor, doctor_id)

    def is_phone_available(self, db, phone_number: str) -> bool:
        existing = db.execute(select(Patient).where(Patient.phone_number == phone_number)).scalar_one_or_none()
        return existing is None

    def create_address(self, db, payload: dict) -> Address:
        address = Address(**payload)
        db.add(address)
        db.flush()
        return address

    def create_patient(self, db, payload: dict) -> Patient:
        patient = Patient(**payload)
        db.add(patient)
        db.flush()
        return patient

    def assign_doctor_to_patient(self, db, doctor_id: int, patient_id: int) -> None:
        assign_doctor_to_patient(db, doctor_id, patient_id)

    def create_encounter(
        self,
        db,
        *,
        patient_id: int,
        doctor_id: int | None,
        encounter_type: str,
        chief_complaint: str,
        created_at: datetime | None = None,
    ) -> None:
        db.add(
            Encounter(
                patient_id=patient_id,
                doctor_id=doctor_id,
                encounter_type=encounter_type,
                chief_complaint=chief_complaint,
                created_at=created_at or now_utc(),
            )
        )

    def create_admission_history(
        self,
        db,
        *,
        patient_id: int,
        doctor_id: int,
        entry_type: str,
        reason: str | None,
        note: str | None,
        created_at: datetime,
    ) -> None:
        db.add(
            PatientAdmissionHistory(
                patient_id=patient_id,
                doctor_id=doctor_id,
                type=entry_type,
                reason=reason,
                note=note,
                created_at=created_at,
            )
        )

    def add_doctor_activity(
        self,
        db,
        *,
        doctor_id: int,
        patient_id: int,
        activity_type: str,
        title: str,
        description: str,
        status: str,
        scheduled_at: datetime | None,
        created_at: datetime | None = None,
    ) -> DoctorActivity | None:
        doctor = db.get(Doctor, doctor_id)
        patient = db.get(Patient, patient_id)
        if doctor is None or patient is None:
            print(
                f"Skipping activity creation: doctor={doctor_id} patient={patient_id} "
                "not found"
            )
            return None
        try:
            validate_activity_creation(db, doctor, patient)
        except ValidationError as error:
            print(f"Skipping activity creation: {error.code} for doctor={doctor_id} patient={patient_id}")
            return None

        activity = DoctorActivity(
            doctor_id=doctor_id,
            patient_id=patient_id,
            type=activity_type,
            title=title,
            description=description,
            status=status,
            scheduled_at=scheduled_at or now_utc(),
            created_at=created_at or now_utc(),
        )
        db.add(activity)
        return activity

    def create_patient_diagnosis(
        self,
        db,
        *,
        patient_id: int,
        doctor_id: int,
        diagnosis: str,
        status: str,
        created_at: datetime,
    ) -> None:
        db.add(
            PatientDiagnosis(
                patient_id=patient_id,
                doctor_id=doctor_id,
                diagnosis=diagnosis,
                status=status,
                created_at=created_at,
                updated_at=created_at,
            )
        )

    def get_or_create_condition(self, db, name: str, status: str) -> PatientCondition:
        condition = db.execute(select(PatientCondition).where(PatientCondition.name == name)).scalar_one_or_none()
        if condition is not None:
            return condition

        condition = PatientCondition(name=name, status=status)
        db.add(condition)
        db.flush()
        return condition

    def has_condition_assignment(self, db, *, patient_id: int, condition_id: int) -> bool:
        assignment = db.execute(
            select(PatientConditionAssignment).where(
                PatientConditionAssignment.patient_id == patient_id,
                PatientConditionAssignment.condition_id == condition_id,
            )
        ).scalar_one_or_none()
        return assignment is not None

    def create_condition_assignment(
        self,
        db,
        *,
        patient_id: int,
        condition_id: int,
        doctor_id: int,
        status: str,
        diagnosed_at: datetime,
    ) -> None:
        db.add(
            PatientConditionAssignment(
                patient_id=patient_id,
                condition_id=condition_id,
                doctor_id=doctor_id,
                status=status,
                diagnosed_at=diagnosed_at,
                created_at=diagnosed_at,
            )
        )

    def create_patient_medication(
        self,
        db,
        *,
        patient_id: int,
        doctor_id: int,
        name: str,
        dosage: str,
        frequency: str,
        created_at: datetime,
    ) -> PatientMedication | None:
        existing = db.execute(
            select(PatientMedication).where(
                PatientMedication.patient_id == patient_id,
                func.lower(PatientMedication.name) == name.strip().lower(),
                func.lower(PatientMedication.dosage) == dosage.strip().lower(),
                func.lower(PatientMedication.frequency) == frequency.strip().lower(),
            )
        ).scalar_one_or_none()
        if existing is not None:
            return None

        medication = PatientMedication(
            patient_id=patient_id,
            doctor_id=doctor_id,
            name=name,
            dosage=dosage,
            frequency=frequency,
            created_at=created_at,
        )
        db.add(medication)
        db.flush()
        return medication

    def get_patient_medications(self, db, *, patient_id: int) -> list[PatientMedication]:
        return db.execute(
            select(PatientMedication)
            .where(PatientMedication.patient_id == patient_id)
            .order_by(PatientMedication.created_at.desc(), PatientMedication.id.desc())
        ).scalars().all()

    def get_latest_medication_by_name(self, db, *, patient_id: int, name: str) -> PatientMedication | None:
        return db.execute(
            select(PatientMedication)
            .where(
                PatientMedication.patient_id == patient_id,
                func.lower(PatientMedication.name) == name.strip().lower(),
            )
            .order_by(PatientMedication.created_at.desc(), PatientMedication.id.desc())
        ).scalar_one_or_none()

    def update_patient_medication_plan(
        self,
        db,
        *,
        medication: PatientMedication,
        doctor_id: int,
        dosage: str,
        frequency: str,
        updated_at: datetime,
        note: str | None = None,
        notes: str | None = None,
    ) -> PatientMedication:
        medication.doctor_id = doctor_id
        medication.dosage = dosage
        medication.frequency = frequency
        medication.updated_at = updated_at
        medication.last_updated_note = note
        if notes is not None:
            medication.notes = notes
        return medication

    def create_patient_allergy(
        self,
        db,
        *,
        patient_id: int,
        doctor_id: int,
        allergy_name: str,
        severity: str,
        created_at: datetime,
    ) -> None:
        db.add(
            PatientAllergy(
                patient_id=patient_id,
                doctor_id=doctor_id,
                allergy_name=allergy_name,
                severity=severity,
                created_at=created_at,
            )
        )

    def get_patient(self, db, patient_id: int) -> Patient | None:
        return db.get(Patient, patient_id)

    def cancel_incoming_patient_activities(self, db, patient_id: int) -> None:
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

    def mark_patient_discharged(self, db, patient: Patient, reason: str, discharged_at: datetime | None = None) -> None:
        self.cancel_incoming_patient_activities(db, patient.id)
        patient.is_discharged = True
        patient.discharge_date = discharged_at or now_utc()
        patient.discharge_reason = reason

    def get_first_assigned_doctor_id(self, db, patient_id: int) -> int | None:
        link = db.execute(
            doctor_activity_patients.select().where(doctor_activity_patients.c.patient_id == patient_id)
        ).first()
        return link.doctor_id if link else None

    def count_incoming_activities(self, db, patient_id: int) -> int:
        return (
            db.query(DoctorActivity)
            .filter(
                DoctorActivity.patient_id == patient_id,
                DoctorActivity.status == "incoming",
            )
            .count()
        )

    def doctor_has_incoming_activities(self, db, doctor_id: int) -> bool:
        return (
            db.query(DoctorActivity)
            .filter(
                DoctorActivity.doctor_id == doctor_id,
                DoctorActivity.status == "incoming",
            )
            .count()
        ) > 0

    def get_assigned_doctors_for_patient_department(self, db, patient_id: int, department: str) -> list[Doctor]:
        links = db.execute(
            doctor_activity_patients.select().where(doctor_activity_patients.c.patient_id == patient_id)
        ).all()

        valid_doctors: list[Doctor] = []
        for link in links:
            doctor = db.get(Doctor, link.doctor_id)
            if doctor and doctor.specialization == department:
                valid_doctors.append(doctor)

        return valid_doctors

    def create_vital(self, db, patient_id: int, vitals: dict, *, recorded_at: datetime | None = None) -> Vital:
        vital = Vital(patient_id=patient_id, recorded_at=recorded_at or now_utc(), **vitals)
        db.add(vital)
        db.flush()
        return vital

    def create_vital_safe(self, db, patient_id: int, vitals: dict, *, recorded_at: datetime | None = None) -> Vital | None:
        patient = db.get(Patient, patient_id)
        if patient is None:
            print(f"Skipping vital creation: patient {patient_id} does not exist")
            return None
        if patient.is_discharged:
            print(f"Skipping vital creation: patient {patient_id} is discharged")
            return None
        return self.create_vital(db, patient_id, vitals, recorded_at=recorded_at)

    def create_alert(
        self,
        db,
        *,
        patient_id: int,
        vital_id: int,
        alert_type: str,
        message: str,
        severity: str,
        created_at: datetime | None = None,
    ) -> Alert | None:
        if patient_id is None:
            return None

        patient = db.get(Patient, patient_id)
        if patient is None:
            return None

        alert = Alert(
            patient_id=patient_id,
            vital_id=vital_id,
            alert_type=alert_type,
            message=message,
            severity=severity,
            created_at=created_at or now_utc(),
        )
        db.add(alert)
        db.flush()
        return alert

    def cleanup_invalid_alerts(self, db) -> int:
        invalid_alert_ids = db.execute(
            select(Alert.id)
            .outerjoin(Patient, Patient.id == Alert.patient_id)
            .where((Alert.patient_id.is_(None)) | (Patient.id.is_(None)))
        ).scalars().all()
        if not invalid_alert_ids:
            return 0

        deleted = (
            db.query(Alert)
            .filter(Alert.id.in_(invalid_alert_ids))
            .delete(synchronize_session=False)
        )
        return int(deleted or 0)

    def remove_patient_assignments(self, db, patient_id: int) -> None:
        db.execute(doctor_activity_patients.delete().where(doctor_activity_patients.c.patient_id == patient_id))
