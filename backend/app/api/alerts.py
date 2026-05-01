from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.core.http import ApiResponse, success_response
from app.db.session import SessionLocal
from app.models.alert import Alert
from app.models.patient import Patient
from app.schemas.alert import AlertDashboardSummary, AlertRead

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


@router.get("/dashboard-summary", response_model=ApiResponse[AlertDashboardSummary])
def dashboard_alert_summary():
    with SessionLocal() as db:
        total_alerts = db.execute(select(func.count(Alert.id))).scalar_one()
        preview_query = (
            select(Alert)
            .where(Alert.severity.in_(("high", "critical")))
            .order_by(Alert.created_at.desc())
            .limit(6)
        )
        preview_alerts = db.execute(preview_query).scalars().all()

        return success_response(
            "Dashboard alert summary retrieved successfully.",
            {
                "total_alerts": total_alerts,
                "preview_alerts": [AlertRead.model_validate(alert).model_dump(mode="json") for alert in preview_alerts],
            },
        )
