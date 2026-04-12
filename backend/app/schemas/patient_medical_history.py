import datetime

from pydantic import BaseModel, field_validator
from app.schemas.validators import require_non_empty


class PatientMedicalHistoryCreate(BaseModel):
    condition_name: str
    description: str | None = None
    type: str

    @field_validator("condition_name", "type", mode="before")
    @classmethod
    def validate_required_fields(cls, value, info):
        return require_non_empty(value, info.field_name.replace("_", " ").title())

    @field_validator("description", mode="before")
    @classmethod
    def normalize_optional_description(cls, value):
        if value is None:
            return value
        trimmed = str(value).strip()
        return trimmed or None


class PatientMedicalHistoryRead(BaseModel):
    id: int
    patient_id: int
    condition_name: str
    description: str | None = None
    type: str
    date: datetime.date | None = None
    created_at: datetime.datetime

    model_config = {"from_attributes": True}


class PatientMedicalHistoryPage(BaseModel):
    items: list[PatientMedicalHistoryRead]
    total: int
    page: int
    page_size: int
