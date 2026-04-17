from datetime import datetime
from pydantic import BaseModel, field_validator
from app.service.medical_history import STATUS
from app.schemas.validators import require_non_empty


class PatientConditionRead(BaseModel):
    id: int
    name: str
    description: str | None = None
    created_at: datetime
    assignment_id: int | None = None
    doctor_id: int | None = None
    status: str | None = None
    notes: str | None = None
    diagnosed_at: datetime | None = None
    model_config = {"from_attributes": True}


class PatientConditionAssignmentCreate(BaseModel):
    condition_id: int


class PatientConditionAssignmentRead(BaseModel):
    id: int
    patient_id: int
    doctor_id: int
    condition_id: int
    status: str
    notes: str | None = None
    diagnosed_at: datetime
    model_config = {"from_attributes": True}


class ConditionUpdate(BaseModel):
    status: str | None = None
    notes: str | None = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, value):
        if value is None:
            return value
        if value not in STATUS:
            raise ValueError("Invalid condition status.")
        return value
