import asyncio
from datetime import datetime

from fastapi import APIRouter, HTTPException
from fastapi import Query
from sqlalchemy import desc, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.db.session import SessionLocal
from app.models.doctor import Doctor
from app.models.medication_administration import MedicationAdministration
from app.models.patient import Patient
from app.schemas.doctor import DoctorRead
from app.schemas.medication import MedicationAdministrationCreate, MedicationAdministrationRead
from app.schemas.patient import PatientCreate, PatientDepartmentUpdate, PatientRead, PatientUpdate
from app.websocket.manager import manager

router = APIRouter(prefix="/patients", tags=["patients"])


def flatten_patient_address(address_payload: dict | None):
    address = address_payload or {}
    return {
        "address_street": address.get("street"),
        "address_number": address.get("number"),
        "address_apartment": address.get("apartment"),
        "address_city": address.get("city"),
        "address_state": address.get("county"),
        "address_postal_code": address.get("postal_code"),
        "address_country": "Romania",
    }


def ensure_patient_identity_uniqueness(db, *, cnp: str | None = None, phone_number: str | None = None, patient_id: int | None = None):
    if cnp:
        cnp_query = select(Patient).where(Patient.cnp == cnp)

        if patient_id is not None:
            cnp_query = cnp_query.where(Patient.id != patient_id)

        duplicate_cnp = db.execute(cnp_query).scalar_one_or_none()

        if duplicate_cnp:
            raise HTTPException(status_code=400, detail="CNP already registered")

    if phone_number:
        phone_query = select(Patient).where(Patient.phone_number == phone_number)

        if patient_id is not None:
            phone_query = phone_query.where(Patient.id != patient_id)

        duplicate_phone = db.execute(phone_query).scalar_one_or_none()

        if duplicate_phone:
            raise HTTPException(status_code=400, detail="Phone number already registered")


@router.get("")
def list_patients(
        page: int = Query(1, ge=1),
        limit: int = Query(10, le=100)
):
    with SessionLocal() as db:
        offset = (page - 1) * limit

        patients = db.execute(
            select(Patient).order_by(desc(Patient.id)).offset(offset).limit(limit)
        ).scalars().all()

        return patients


@router.get("/{id}", response_model=PatientRead)
def get_patient(id: int):
    with SessionLocal() as db:
        patient = db.get(Patient, id)

        if patient is None:
            raise HTTPException(status_code=404, detail="Patient not found")

        return patient


@router.get("/{id}/doctors", response_model=list[DoctorRead])
def get_patient_doctors(id: int):
    with SessionLocal() as db:
        patient = db.execute(
            select(Patient).options(selectinload(Patient.doctors)).where(Patient.id == id)
        ).scalar_one_or_none()

        if patient is None:
            raise HTTPException(status_code=404, detail="Patient not found")

        return sorted(patient.doctors, key=lambda doctor: doctor.id, reverse=True)


@router.post("", response_model=PatientRead)
def create_patient(payload: PatientCreate):
    with SessionLocal() as db:
        ensure_patient_identity_uniqueness(db, cnp=payload.cnp, phone_number=payload.phone_number)
        payload_data = payload.model_dump()
        address_data = flatten_patient_address(payload_data.pop("address"))
        patient = Patient(**payload_data, **address_data)
        db.add(patient)
        try:
            db.commit()
            db.refresh(patient)
            return patient
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=400, detail="Patient identity fields must be unique")


@router.patch("/{id}", response_model=PatientRead)
def update_patient(id: int, payload: PatientUpdate):
    with SessionLocal() as db:
        patient = db.get(Patient, id)

        if patient is None:
            raise HTTPException(status_code=404, detail="Patient not found")

        updates = payload.model_dump(exclude_unset=True)

        if "cnp" in updates or "phone_number" in updates:
            ensure_patient_identity_uniqueness(
                db,
                cnp=updates.get("cnp"),
                phone_number=updates.get("phone_number"),
                patient_id=patient.id,
            )

        address_updates = flatten_patient_address(updates.pop("address")) if "address" in updates else {}

        for field, value in updates.items():
            setattr(patient, field, value)

        for field, value in address_updates.items():
            setattr(patient, field, value)

        try:
            db.commit()
            db.refresh(patient)
            return patient
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=400, detail="Patient identity fields must be unique")


@router.patch("/{id}/department", response_model=PatientRead)
def update_patient_department(id: int, payload: PatientDepartmentUpdate):
    with SessionLocal() as db:
        patient = db.get(Patient, id)

        if patient is None:
            raise HTTPException(status_code=404, detail="Patient not found")

        patient.department = payload.department
        db.commit()
        db.refresh(patient)

        asyncio.run(
            manager.broadcast(
                {
                    "type": "event",
                    "data": {
                        "patient_id": patient.id,
                        "event_type": "department_updated",
                        "message": f"Transferred to {patient.department}. Reason: {payload.reason}",
                        "timestamp": datetime.utcnow().isoformat(),
                    },
                }
            )
        )

        return patient


@router.post("/{id}/medication", response_model=MedicationAdministrationRead)
def administer_medication(id: int, payload: MedicationAdministrationCreate):
    with SessionLocal() as db:
        patient = db.get(Patient, id)

        if patient is None:
            raise HTTPException(status_code=404, detail="Patient not found")

        medication = MedicationAdministration(
            patient_id=patient.id,
            medication_name=payload.medication_name,
            dosage=payload.dosage,
        )
        db.add(medication)
        db.commit()
        db.refresh(medication)

        asyncio.run(
            manager.broadcast(
                {
                    "type": "event",
                    "data": {
                        "patient_id": medication.patient_id,
                        "event_type": "medication_administered",
                        "message": f"Medication administered: {medication.medication_name} ({medication.dosage})",
                        "timestamp": medication.timestamp.isoformat() if isinstance(medication.timestamp, datetime) else str(
                            medication.timestamp),
                    },
                }
            )
        )

        return medication
