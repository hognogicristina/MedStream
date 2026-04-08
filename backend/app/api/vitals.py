from fastapi import APIRouter
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.vital import Vital
from app.schemas.vital import VitalRead

router = APIRouter(prefix="/vitals", tags=["vitals"])


@router.get("", response_model=list[VitalRead])
def list_vitals():
    with SessionLocal() as db:
        return db.execute(select(Vital).order_by(Vital.recorded_at.desc())).scalars().all()
