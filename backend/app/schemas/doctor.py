from datetime import date, datetime

from pydantic import BaseModel, field_validator

from app.schemas.validators import normalize_romanian_phone_number


class DoctorCreate(BaseModel):
    first_name: str
    last_name: str
    email: str
    phone_number: str | None = None
    birth_date: date | None = None
    password: str
    specialization: str
    license_number: str

    @field_validator("phone_number", mode="before")
    @classmethod
    def format_phone_number(cls, value):
        return normalize_romanian_phone_number(value)


class DoctorRead(BaseModel):
    id: int
    first_name: str
    last_name: str
    email: str
    pending_email: str | None = None
    email_confirmed: bool = True
    phone_number: str | None
    birth_date: date | None = None
    specialization: str
    license_number: str
    is_active: bool
    deleted_at: datetime | None

    model_config = {"from_attributes": True}


class DoctorUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    specialization: str | None = None
    license_number: str | None = None
    phone_number: str | None = None
    birth_date: date | None = None

    @field_validator("phone_number", mode="before")
    @classmethod
    def format_phone_number(cls, value):
        return normalize_romanian_phone_number(value)


class DoctorEmailUpdate(BaseModel):
    email: str


class LoginRequest(BaseModel):
    identifier: str
    password: str


class LoginResponse(BaseModel):
    token: str

    model_config = {"from_attributes": True}


class PasswordResetRequest(BaseModel):
    identifier: str


class PasswordResetRequestResponse(BaseModel):
    message: str
    reset_token: str
    expires_at: datetime


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str


class PasswordResetConfirmResponse(BaseModel):
    message: str


class AccountRecoveryRequestResponse(BaseModel):
    message: str
    recovery_token: str
    expires_at: datetime


class DoctorDeactivateRequest(BaseModel):
    remove_patient_assignments: bool = False
