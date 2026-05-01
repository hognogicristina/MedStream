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

    def create_encounter(self, db, *, patient_id: int, doctor_id: int | None, encounter_type: str, chief_complaint: str) -> None:
        db.add(
            Encounter(
                patient_id=patient_id,
                doctor_id=doctor_id,
                encounter_type=encounter_type,
                chief_complaint=chief_complaint,
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
    ) -> None:
        db.add(
            PatientMedication(
                patient_id=patient_id,
                doctor_id=doctor_id,
                name=name,
                dosage=dosage,
                frequency=frequency,
                created_at=created_at,
            )
        )

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

    def mark_patient_discharged(self, patient: Patient, reason: str, discharged_at: datetime | None = None) -> None:
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

    def create_vital(self, db, patient_id: int, vitals: dict) -> Vital:
        vital = Vital(patient_id=patient_id, **vitals)
        db.add(vital)
        db.flush()
        return vital

    def create_vital_safe(self, db, patient_id: int, vitals: dict) -> Vital | None:
        patient = db.get(Patient, patient_id)
        if patient is None:
            print(f"Skipping vital creation: patient {patient_id} does not exist")
            return None
        if patient.is_discharged:
            print(f"Skipping vital creation: patient {patient_id} is discharged")
            return None
        return self.create_vital(db, patient_id, vitals)

    def create_alert(self, db, *, patient_id: int, vital_id: int, alert_type: str, message: str, severity: str) -> None:
        db.add(
            Alert(
                patient_id=patient_id,
                vital_id=vital_id,
                alert_type=alert_type,
                message=message,
                severity=severity,
            )
        )

    def remove_patient_assignments(self, db, patient_id: int) -> None:
        db.execute(doctor_activity_patients.delete().where(doctor_activity_patients.c.patient_id == patient_id))
