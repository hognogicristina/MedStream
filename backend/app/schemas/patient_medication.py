from datetime import date
from pydantic import BaseModel, field_validator
from datetime import datetime

from app.schemas.validators import require_non_empty


class PatientMedicationCreate(BaseModel):
    name: str
    dosage: str

    @field_validator("name", "dosage", mode="before")
    @classmethod
    def validate_required_text(cls, value, info):
        return require_non_empty(value, info.field_name.replace("_", " ").title())


class PatientMedicationRead(BaseModel):
    id: int
    patient_id: int
    doctor_id: int
    name: str
    dosage: str
    created_at: datetime
    updated_at: datetime | None = None
    last_updated_note: str | None = None
    model_config = {"from_attributes": True}


class MedicationUpdate(BaseModel):
    dosage: str
    note: str | None = None

    @field_validator("dosage", mode="before")
    @classmethod
    def validate_dosage(cls, value):
        return require_non_empty(value, "Dosage")

    @field_validator("note", mode="before")
    @classmethod
    def normalize_note(cls, value):
        if value is None:
            return value
        trimmed = str(value).strip()
        return trimmed or None
