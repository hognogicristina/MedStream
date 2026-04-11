from datetime import date, datetime

from pydantic import BaseModel, field_validator, model_validator

from app.schemas.validators import (
    normalize_phone_number,
    require_non_empty,
    validate_email_address,
    validate_password_strength,
)


class DoctorCreate(BaseModel):
    first_name: str
    last_name: str
    email: str
    phone_number: str | None = None
    birth_date: date | None = None
    password: str
    confirm_password: str
    specialization: str
    license_number: str

    @field_validator("first_name", "last_name", "specialization", "license_number", mode="before")
    @classmethod
    def validate_required_text(cls, value, info):
        return require_non_empty(value, info.field_name.replace("_", " ").title())

    @field_validator("email", mode="before")
    @classmethod
    def format_email(cls, value):
        return validate_email_address(value)

    @field_validator("phone_number", mode="before")
    @classmethod
    def format_phone_number(cls, value):
        return normalize_phone_number(value)

    @field_validator("password", mode="before")
    @classmethod
    def validate_password(cls, value):
        return validate_password_strength(value)

    @field_validator("confirm_password", mode="before")
    @classmethod
    def validate_confirm_password(cls, value):
        return require_non_empty(value, "Confirm password")

    @model_validator(mode="after")
    def validate_password_confirmation(self):
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match.")
        return self


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

    @field_validator("first_name", "last_name", "specialization", "license_number", mode="before")
    @classmethod
    def validate_optional_text(cls, value, info):
        if value is None:
            return value
        return require_non_empty(value, info.field_name.replace("_", " ").title())

    @field_validator("phone_number", mode="before")
    @classmethod
    def format_phone_number(cls, value):
        return normalize_phone_number(value)


class DoctorEmailUpdate(BaseModel):
    email: str

    @field_validator("email", mode="before")
    @classmethod
    def format_email(cls, value):
        return validate_email_address(value)


class LoginRequest(BaseModel):
    identifier: str
    password: str

    @field_validator("identifier", "password", mode="before")
    @classmethod
    def validate_login_fields(cls, value, info):
        return require_non_empty(value, info.field_name.title())


class LoginResponse(BaseModel):
    token: str

    model_config = {"from_attributes": True}


class PasswordResetRequest(BaseModel):
    identifier: str

    @field_validator("identifier", mode="before")
    @classmethod
    def validate_identifier(cls, value):
        return require_non_empty(value, "Identifier")


class PasswordResetRequestResponse(BaseModel):
    message: str
    reset_token: str
    expires_at: datetime


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str

    @field_validator("token", mode="before")
    @classmethod
    def validate_token(cls, value):
        return require_non_empty(value, "Token")

    @field_validator("new_password", mode="before")
    @classmethod
    def validate_new_password(cls, value):
        return validate_password_strength(value)


class PasswordResetConfirmResponse(BaseModel):
    message: str


class AccountRecoveryRequestResponse(BaseModel):
    message: str
    recovery_token: str
    expires_at: datetime


class DoctorDeactivateRequest(BaseModel):
    remove_patient_assignments: bool = False
