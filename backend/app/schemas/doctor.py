from datetime import date, datetime

from pydantic import BaseModel


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


class DoctorRead(BaseModel):
    id: int
    first_name: str
    last_name: str
    email: str
    pending_email: str | None = None
    email_confirmed: bool = True
    email_verification_expired: bool = False
    email_verified: bool = True
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
    confirm_password: str | None = None


class PasswordResetConfirmResponse(BaseModel):
    message: str


class AccountRecoveryRequestResponse(BaseModel):
    message: str
    recovery_token: str
    expires_at: datetime


class EmailVerificationResponse(BaseModel):
    message: str
