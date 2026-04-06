from fastapi import APIRouter
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.doctor import Doctor
from app.schemas.doctor import DoctorCreate, DoctorRead

router = APIRouter(prefix="/doctors", tags=["doctors"])


@router.get("", response_model=list[DoctorRead])
def list_doctors():
    with SessionLocal() as db:
        return db.execute(select(Doctor)).scalars().all()


@router.post("", response_model=DoctorRead)
def create_doctor(payload: DoctorCreate):
    with SessionLocal() as db:
        doctor = Doctor(**payload.model_dump())
        db.add(doctor)
        db.commit()
        db.refresh(doctor)
        return doctor