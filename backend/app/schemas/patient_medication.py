from datetime import date
from pydantic import BaseModel, field_validator
from datetime import datetime

from app.schemas.validators import require_non_empty, strip_string


class PatientMedicationCreate(BaseModel):
    name: str
    dosage: str
    frequency: str
    notes: str | None = None

    @field_validator("name", "dosage", "frequency", mode="before")
    @classmethod
    def validate_required_text(cls, value, info):
        return require_non_empty(value, info.field_name.replace("_", " ").title())

    @field_validator("notes", mode="before")
    @classmethod
    def validate_optional_notes(cls, value):
        trimmed = strip_string(value)
        return trimmed or None


class PatientMedicationRead(BaseModel):
    id: int
    patient_id: int
    doctor_id: int
    name: str
    dosage: str
    frequency: str
    notes: str | None = None
    created_at: datetime
    updated_at: datetime | None = None
    last_updated_note: str | None = None
    model_config = {"from_attributes": True}


class MedicationUpdate(BaseModel):
    dosage: str | None = None
    frequency: str | None = None
    note: str

    @field_validator("dosage", "frequency", mode="before")
    @classmethod
    def validate_text_fields(cls, value, info):
        if value is None:
            return value
        return require_non_empty(value, info.field_name.replace("_", " ").title())

    @field_validator("note", mode="before")
    @classmethod
    def validate_note(cls, value):
        return require_non_empty(value, "Note")
