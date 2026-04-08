import hashlib
import secrets
from datetime import datetime, UTC, timedelta

from fastapi import APIRouter, Header, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import selectinload
from passlib.context import CryptContext

from app.db.session import SessionLocal
from app.models.doctor import Doctor
from app.models.doctor_password_reset import DoctorPasswordReset
from app.models.patient import Patient
from app.schemas.doctor import AccountRecoveryRequestResponse, DoctorCreate, DoctorDeactivateRequest, DoctorRead, DoctorUpdate, LoginRequest, LoginResponse, PasswordResetConfirm, PasswordResetConfirmResponse, PasswordResetRequest, PasswordResetRequestResponse
from app.schemas.patient import PatientRead
from app.services.notifications import send_account_recovery_notifications, send_password_reset_notifications, send_registration_notifications

router = APIRouter(prefix="/doctors", tags=["doctors"])
auth_router = APIRouter(tags=["auth"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
password_reset_ttl = timedelta(minutes=30)


@router.get("", response_model=list[DoctorRead])
def list_doctors():
    with SessionLocal() as db:
        return db.execute(select(Doctor)).scalars().all()


def get_current_doctor(authorization: str | None):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Invalid authorization header")

    parts = token.split("-", 2)
    if len(parts) < 3 or parts[0] != "doctor" or not parts[1].isdigit():
        raise HTTPException(status_code=401, detail="Invalid token")

    doctor_id = int(parts[1])

    with SessionLocal() as db:
        doctor = db.get(Doctor, doctor_id)

        if doctor is None:
            raise HTTPException(status_code=404, detail="Doctor not found")

        if not doctor.is_active:
            raise HTTPException(status_code=403, detail="Doctor account is inactive")

        return doctor


def hash_reset_token(token: str):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_doctor_reset_token(db, doctor: Doctor):
    now = datetime.now(UTC).replace(tzinfo=None)
    active_tokens = db.execute(
        select(DoctorPasswordReset).where(
            DoctorPasswordReset.doctor_id == doctor.id,
            DoctorPasswordReset.used_at.is_(None),
        )
    ).scalars().all()

    for active_token in active_tokens:
        active_token.used_at = now

    raw_token = secrets.token_urlsafe(32)
    reset = DoctorPasswordReset(
        doctor_id=doctor.id,
        token_hash=hash_reset_token(raw_token),
        expires_at=now + password_reset_ttl,
    )
    db.add(reset)
    db.commit()
    db.refresh(reset)
    return raw_token, reset


@router.get("/me", response_model=DoctorRead)
def read_current_doctor(authorization: str | None = Header(default=None)):
    return get_current_doctor(authorization)


@router.patch("/me", response_model=DoctorRead)
def update_current_doctor(payload: DoctorUpdate, authorization: str | None = Header(default=None)):
    current_doctor = get_current_doctor(authorization)

    with SessionLocal() as db:
        doctor = db.get(Doctor, current_doctor.id)

        if doctor is None:
            raise HTTPException(status_code=404, detail="Doctor not found")

        updates = payload.model_dump(exclude_unset=True)

        if "phone_number" in updates:
            duplicate_phone = db.execute(
                select(Doctor).where(
                    Doctor.phone_number == updates["phone_number"],
                    Doctor.id != doctor.id,
                )
            ).scalar_one_or_none()

            if duplicate_phone:
                raise HTTPException(status_code=400, detail="Phone number already registered")

        for field, value in updates.items():
            setattr(doctor, field, value)

        db.commit()
        db.refresh(doctor)
        return doctor


@router.post("/password-reset/request", response_model=PasswordResetRequestResponse)
def request_password_reset(payload: PasswordResetRequest):
    with SessionLocal() as db:
        doctor = db.execute(
            select(Doctor).where(
                or_(
                    Doctor.email == payload.identifier,
                    Doctor.phone_number == payload.identifier,
                )
            )
        ).scalar_one_or_none()

        if doctor is None:
            raise HTTPException(status_code=404, detail="Doctor not found")

        raw_token, reset = create_doctor_reset_token(db, doctor)
        send_password_reset_notifications(doctor.email, doctor.phone_number, raw_token)
        return PasswordResetRequestResponse(
            message="Password reset token generated",
            reset_token=raw_token,
            expires_at=reset.expires_at,
        )


@router.post("/account-recovery/request", response_model=AccountRecoveryRequestResponse)
def request_account_recovery(payload: PasswordResetRequest):
    with SessionLocal() as db:
        doctor = db.execute(
            select(Doctor).where(
                or_(
                    Doctor.email == payload.identifier,
                    Doctor.phone_number == payload.identifier,
                )
            )
        ).scalar_one_or_none()

        if doctor is None:
            raise HTTPException(status_code=404, detail="Doctor not found")

        raw_token, reset = create_doctor_reset_token(db, doctor)
        send_account_recovery_notifications(doctor.email, doctor.phone_number, raw_token)
        return AccountRecoveryRequestResponse(
            message="Account recovery token generated",
            recovery_token=raw_token,
            expires_at=reset.expires_at,
        )


@router.post("/password-reset/confirm", response_model=PasswordResetConfirmResponse)
def confirm_password_reset(payload: PasswordResetConfirm):
    with SessionLocal() as db:
        now = datetime.now(UTC).replace(tzinfo=None)
        reset = db.execute(
            select(DoctorPasswordReset).where(
                DoctorPasswordReset.token_hash == hash_reset_token(payload.token),
                DoctorPasswordReset.used_at.is_(None),
            )
        ).scalar_one_or_none()

        if reset is None or reset.expires_at < now:
            raise HTTPException(status_code=400, detail="Invalid or expired reset token")

        doctor = db.get(Doctor, reset.doctor_id)

        if doctor is None:
            raise HTTPException(status_code=404, detail="Doctor not found")

        doctor.password_hash = pwd_context.hash(payload.new_password)
        reset.used_at = now
        db.commit()
        return PasswordResetConfirmResponse(message="Password reset successful")


@router.get("/{doctor_id}/patients", response_model=list[PatientRead])
def get_doctor_patients(doctor_id: int):
    with SessionLocal() as db:
        doctor = db.execute(
            select(Doctor).options(selectinload(Doctor.patients)).where(Doctor.id == doctor_id)
        ).scalar_one_or_none()

        if doctor is None:
            raise HTTPException(status_code=404, detail="Doctor not found")

        return sorted(doctor.patients, key=lambda patient: patient.id, reverse=True)


@router.delete("/{doctor_id}", response_model=DoctorRead)
def delete_doctor(doctor_id: int, payload: DoctorDeactivateRequest):
    with SessionLocal() as db:
        doctor = db.execute(
            select(Doctor).options(selectinload(Doctor.patients)).where(Doctor.id == doctor_id)
        ).scalar_one_or_none()

        if doctor is None:
            raise HTTPException(status_code=404, detail="Doctor not found")

        if payload.remove_patient_assignments:
            doctor.patients.clear()

        doctor.is_active = False

        if doctor.deleted_at is None:
            doctor.deleted_at = datetime.now(UTC).replace(tzinfo=None)

        db.commit()
        db.refresh(doctor)
        return doctor


@router.post("/{doctor_id}/patients/{patient_id}", response_model=list[PatientRead])
def assign_patient_to_doctor(doctor_id: int, patient_id: int):
    with SessionLocal() as db:
        doctor = db.execute(
            select(Doctor).options(selectinload(Doctor.patients)).where(Doctor.id == doctor_id)
        ).scalar_one_or_none()
        patient = db.get(Patient, patient_id)

        if doctor is None:
            raise HTTPException(status_code=404, detail="Doctor not found")

        if patient is None:
            raise HTTPException(status_code=404, detail="Patient not found")

        if not any(existing_patient.id == patient.id for existing_patient in doctor.patients):
            doctor.patients.append(patient)
            db.commit()
            db.refresh(doctor)

        return sorted(doctor.patients, key=lambda assigned_patient: assigned_patient.id, reverse=True)


@router.delete("/{doctor_id}/patients/{patient_id}", response_model=list[PatientRead])
def remove_patient_from_doctor(doctor_id: int, patient_id: int):
    with SessionLocal() as db:
        doctor = db.execute(
            select(Doctor).options(selectinload(Doctor.patients)).where(Doctor.id == doctor_id)
        ).scalar_one_or_none()

        if doctor is None:
            raise HTTPException(status_code=404, detail="Doctor not found")

        next_patients = [patient for patient in doctor.patients if patient.id == patient_id]

        if not next_patients:
            return sorted(doctor.patients, key=lambda patient: patient.id, reverse=True)

        doctor.patients.remove(next_patients[0])
        db.commit()
        db.refresh(doctor)
        return sorted(doctor.patients, key=lambda patient: patient.id, reverse=True)


def register_doctor(payload: DoctorCreate):
    with SessionLocal() as db:
        duplicate_filters = [Doctor.email == payload.email]

        if payload.phone_number:
            duplicate_filters.append(Doctor.phone_number == payload.phone_number)

        matching_doctors = db.execute(select(Doctor).where(or_(*duplicate_filters))).scalars().all()
        email_match = next((doctor for doctor in matching_doctors if doctor.email == payload.email), None)
        phone_match = next((doctor for doctor in matching_doctors if doctor.phone_number == payload.phone_number and payload.phone_number), None)

        if email_match and email_match.is_active:
            raise HTTPException(status_code=400, detail="Email already registered")

        if phone_match and phone_match.is_active and (email_match is None or phone_match.id != email_match.id):
            raise HTTPException(status_code=400, detail="Phone number already registered")

        restore_candidate = email_match or phone_match

        if email_match and phone_match and email_match.id != phone_match.id:
            if not email_match.is_active and not phone_match.is_active:
                raise HTTPException(status_code=400, detail="Email already registered")

            raise HTTPException(status_code=400, detail="Phone number already registered")

        if restore_candidate and not restore_candidate.is_active:
            restore_candidate.first_name = payload.first_name
            restore_candidate.last_name = payload.last_name
            restore_candidate.email = payload.email
            restore_candidate.phone_number = payload.phone_number
            restore_candidate.password_hash = pwd_context.hash(payload.password)
            restore_candidate.specialization = payload.specialization
            restore_candidate.license_number = payload.license_number
            restore_candidate.is_active = True
            restore_candidate.deleted_at = None
            db.commit()
            db.refresh(restore_candidate)
            send_registration_notifications(restore_candidate.email, restore_candidate.phone_number, restore_candidate.first_name)
            return restore_candidate

        doctor = Doctor(
            first_name=payload.first_name,
            last_name=payload.last_name,
            email=payload.email,
            phone_number=payload.phone_number,
            password_hash=pwd_context.hash(payload.password),
            specialization=payload.specialization,
            license_number=payload.license_number,
        )
        db.add(doctor)
        db.commit()
        db.refresh(doctor)
        send_registration_notifications(doctor.email, doctor.phone_number, doctor.first_name)
        return doctor


@router.post("", response_model=DoctorRead)
def create_doctor(payload: DoctorCreate):
    return register_doctor(payload)


def login_doctor(payload: LoginRequest):
    with SessionLocal() as db:
        doctor = db.execute(select(Doctor).where(Doctor.email == payload.email)).scalar_one_or_none()

        if not doctor or not doctor.is_active or not pwd_context.verify(payload.password, doctor.password_hash):
            raise HTTPException(status_code=401, detail="Invalid credentials")

        return LoginResponse(token=f"doctor-{doctor.id}-{secrets.token_hex(16)}")


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest):
    return login_doctor(payload)


@auth_router.post("/login", response_model=LoginResponse)
def root_login(payload: LoginRequest):
    return login_doctor(payload)


@auth_router.post("/register", response_model=DoctorRead)
def register(payload: DoctorCreate):
    return register_doctor(payload)
