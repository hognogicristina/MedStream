from datetime import datetime

from pydantic import BaseModel, field_validator

from app.schemas.validators import require_non_empty


class DoctorActivityParticipantRead(BaseModel):
    id: int
    first_name: str
    last_name: str


class PatientActivityParticipantRead(BaseModel):
    id: int
    first_name: str
    last_name: str


class DoctorActivityCreate(BaseModel):
    type: str
    title: str
    description: str | None = None
    scheduled_at: datetime
    patient_ids: list[int]
    doctor_ids: list[int]

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

    @field_validator("doctor_ids")
    @classmethod
    def validate_doctor_ids(cls, value):
        if not value:
            raise ValueError("At least one doctor must be provided.")
        return value

class DoctorActivityRead(BaseModel):
    id: int
    doctor_id: int
    patient_id: int | None = None
    type: str
    title: str
    description: str | None = None
    scheduled_at: datetime
    created_at: datetime
    status: str
    patient_ids: list[int]
    doctor_ids: list[int]
    patients: list[PatientActivityParticipantRead] = []
    doctors: list[DoctorActivityParticipantRead] = []

    model_config = {"from_attributes": True}


class DoctorActivityUpdate(BaseModel):
    type: str | None = None
    title: str | None = None
    description: str | None = None
    scheduled_at: datetime | None = None
    status: str | None = None
    doctor_ids: list[int] | None = None

    @field_validator("type", mode="before")
    @classmethod
    def validate_type(cls, value):
        if value is None:
            return value
        return require_non_empty(value, "Type")

    @field_validator("title", mode="before")
    @classmethod
    def validate_title(cls, value):
        if value is None:
            return value
        return require_non_empty(value, "Title")

    @field_validator("description", mode="before")
    @classmethod
    def normalize_optional_description(cls, value):
        if value is None:
            return value
        trimmed = str(value).strip()
        return trimmed or None

    @field_validator("doctor_ids")
    @classmethod
    def validate_doctor_ids(cls, value):
        if value is not None and not value:
            raise ValueError("At least one doctor must be provided.")
        return value
