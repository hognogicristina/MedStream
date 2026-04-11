from datetime import datetime

from pydantic import BaseModel, field_validator

from app.schemas.validators import require_non_empty


class MedicationAdministrationCreate(BaseModel):
    medication_name: str
    dosage: str

    @field_validator("medication_name", "dosage", mode="before")
    @classmethod
    def validate_fields(cls, value, info):
        return require_non_empty(value, info.field_name.replace("_", " ").title())


class MedicationAdministrationRead(BaseModel):
    id: int
    patient_id: int
    medication_name: str
    dosage: str
    timestamp: datetime

    model_config = {"from_attributes": True}
