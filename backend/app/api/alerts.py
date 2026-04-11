from fastapi import APIRouter, Query
from sqlalchemy import select

from app.core.http import ApiResponse, success_response
from app.db.session import SessionLocal
from app.models.alert import Alert
from app.models.patient import Patient
from app.schemas.alert import AlertRead

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=ApiResponse[list[AlertRead]])
def list_alerts(cnp: str | None = Query(default=None)):
    with SessionLocal() as db:
        query = select(Alert).order_by(Alert.created_at.desc())

        if cnp:
            query = (
                select(Alert)
                .join(Patient, Patient.id == Alert.patient_id)
                .where(Patient.cnp == cnp)
                .order_by(Alert.created_at.desc())
            )

        alerts = db.execute(query).scalars().all()
        return success_response(
            "Alerts retrieved successfully.",
            [AlertRead.model_validate(alert).model_dump(mode="json") for alert in alerts],
        )
