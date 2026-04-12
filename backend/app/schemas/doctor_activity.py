from datetime import datetime

from pydantic import BaseModel, field_validator

from app.schemas.validators import require_non_empty


class DoctorActivityCreate(BaseModel):
    type: str
    title: str
    description: str | None = None
    scheduled_at: datetime

    @field_validator("type", "title", mode="before")
    @classmethod
    def validate_required_text(cls, value, info):
        return require_non_empty(value, info.field_name.replace("_", " ").title())

    @field_validator("description", mode="before")
    @classmethod
    def normalize_optional_description(cls, value):
        if value is None:
            return value
        trimmed = str(value).strip()
        return trimmed or None


class DoctorActivityRead(BaseModel):
    id: int
    doctor_id: int
    type: str
    title: str
    description: str | None = None
    scheduled_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}
