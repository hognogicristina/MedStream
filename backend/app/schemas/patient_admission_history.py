from datetime import datetime
from pydantic import BaseModel, Field, field_validator
from app.schemas.validators import require_non_empty


class PatientAdmissionActionCreate(BaseModel):
    reason: str = Field(min_length=1, max_length=500)

    @field_validator("reason", mode="before")
    @classmethod
    def validate_reason(cls, value):
        return require_non_empty(value, "Reason")


class PatientAdmissionHistoryRead(BaseModel):
    id: int
    patient_id: int
    doctor_id: int
    type: str
    reason: str
    created_at: datetime
    model_config = {"from_attributes": True}


class PatientAdmissionHistoryPage(BaseModel):
    items: list[PatientAdmissionHistoryRead]
    total: int
    page: int
    page_size: int
