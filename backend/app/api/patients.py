import asyncio
from datetime import datetime

from fastapi import APIRouter, HTTPException
from fastapi import Query
from sqlalchemy import desc, select
from sqlalchemy.orm import selectinload

from app.db.session import SessionLocal
from app.models.doctor import Doctor
from app.models.medication_administration import MedicationAdministration
from app.models.patient import Patient
from app.schemas.doctor import DoctorRead
from app.schemas.medication import MedicationAdministrationCreate, MedicationAdministrationRead
from app.schemas.patient import PatientCreate, PatientDepartmentUpdate, PatientRead
from app.websocket.manager import manager

router = APIRouter(prefix="/patients", tags=["patients"])


@router.get("", response_model=list[PatientRead])
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
        patient = Patient(**payload.model_dump())
        db.add(patient)
        db.commit()
        db.refresh(patient)
        return patient


@router.patch("/{id}/department", response_model=PatientRead)
def update_patient_department(id: int, payload: PatientDepartmentUpdate):
    with SessionLocal() as db:
        patient = db.get(Patient, id)

        if patient is None:
            raise HTTPException(status_code=404, detail="Patient not found")

        patient.department = payload.department
        db.commit()
        db.refresh(patient)
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
