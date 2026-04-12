from datetime import datetime

from pydantic import BaseModel, field_validator

from app.schemas.validators import require_non_empty


class PatientDiagnosisCreate(BaseModel):
    diagnosis: str
    notes: str | None = None

    @field_validator("diagnosis", mode="before")
    @classmethod
    def validate_diagnosis(cls, value):
        return require_non_empty(value, "Diagnosis")

    @field_validator("notes", mode="before")
    @classmethod
    def normalize_optional_notes(cls, value):
        if value is None:
            return value
        trimmed = str(value).strip()
        return trimmed or None


class PatientDiagnosisRead(BaseModel):
    id: int
    patient_id: int
    diagnosis: str
    notes: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PatientDiagnosisPage(BaseModel):
    items: list[PatientDiagnosisRead]
    total: int
    page: int
    page_size: int
