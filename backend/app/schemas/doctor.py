from datetime import datetime

from pydantic import BaseModel, EmailStr


class DoctorCreate(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    phone_number: str | None = None
    password: str
    specialization: str
    license_number: str


class DoctorRead(BaseModel):
    id: int
    first_name: str
    last_name: str
    email: EmailStr
    phone_number: str | None
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


class LoginRequest(BaseModel):
    email: str
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
