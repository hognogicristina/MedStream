from fastapi import APIRouter
from sqlalchemy import select

from app.core.http import ApiResponse, success_response
from app.db.session import SessionLocal
from app.models.patient_condition import PatientCondition
from app.schemas.patient_condition import PatientConditionRead

router = APIRouter(prefix="/conditions", tags=["conditions"])


def serialize(model, schema):
    return schema.model_validate(model).model_dump(mode="json")


@router.get("", response_model=ApiResponse[list[PatientConditionRead]])
def list_conditions():
    with SessionLocal() as db:
        conditions = db.execute(
            select(PatientCondition).order_by(PatientCondition.name.asc(), PatientCondition.id.asc())
        ).scalars().all()
        return success_response(
            "Conditions retrieved successfully.",
            [serialize(condition, PatientConditionRead) for condition in conditions],
        )
