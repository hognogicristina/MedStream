from fastapi import APIRouter
from sqlalchemy import select

from app.core.http import ApiResponse, success_response
from app.db.session import SessionLocal
from app.models.vital import Vital
from app.schemas.vital import VitalRead

router = APIRouter(prefix="/vitals", tags=["vitals"])


@router.get("", response_model=ApiResponse[list[VitalRead]])
def list_vitals():
    with SessionLocal() as db:
        vitals = db.execute(select(Vital).order_by(Vital.recorded_at.desc())).scalars().all()
        return success_response(
            "Vitals retrieved successfully.",
            [VitalRead.model_validate(vital).model_dump(mode="json") for vital in vitals],
        )
