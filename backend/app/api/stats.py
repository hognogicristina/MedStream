from fastapi import APIRouter
from sqlalchemy import select

from app.batch.status import batch_status_store
from app.db.session import SessionLocal
from app.models.patient_stats import PatientStats
from app.schemas.stats import BatchJobStatusRead, PatientStatsRead

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("", response_model=list[PatientStatsRead])
def get_stats():
    with SessionLocal() as db:
        return db.execute(select(PatientStats)).scalars().all()


@router.get("/batch-status", response_model=BatchJobStatusRead)
def get_batch_status():
    return batch_status_store.snapshot()
