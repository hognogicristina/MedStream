from datetime import datetime
from pydantic import BaseModel, field_validator
from app.schemas.validators import require_non_empty


class PatientAllergyCreate(BaseModel):
    allergy_name: str
    severity: str

    @field_validator("allergy_name", "severity", mode="before")
    @classmethod
    def validate_required_fields(cls, value, info):
        return require_non_empty(value, info.field_name.replace("_", " ").title())


class PatientAllergyRead(BaseModel):
    id: int
    patient_id: int
    doctor_id: int
    allergy_name: str
    severity: str
    status: str = "Unknown"
    created_at: datetime
    model_config = {"from_attributes": True}


class PatientAllergyPage(BaseModel):
    items: list[PatientAllergyRead]
    total: int
    page: int
    page_size: int


class PatientAllergyUpdate(BaseModel):
    severity: str | None = None
