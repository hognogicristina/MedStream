from fastapi import APIRouter
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.patient_stats import PatientStats
from app.schemas.stats import PatientStatsRead

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("", response_model=list[PatientStatsRead])
def get_stats():
    with SessionLocal() as db:
        return db.execute(select(PatientStats)).scalars().all()