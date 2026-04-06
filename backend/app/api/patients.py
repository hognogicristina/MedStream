from fastapi import APIRouter
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.patient import Patient
from app.schemas.patient import PatientCreate, PatientRead

router = APIRouter(prefix="/patients", tags=["patients"])


@router.get("", response_model=list[PatientRead])
def list_patients():
    with SessionLocal() as db:
        return db.execute(select(Patient)).scalars().all()


@router.post("", response_model=PatientRead)
def create_patient(payload: PatientCreate):
    with SessionLocal() as db:
        patient = Patient(**payload.model_dump())
        db.add(patient)
        db.commit()
        db.refresh(patient)
        return patient
