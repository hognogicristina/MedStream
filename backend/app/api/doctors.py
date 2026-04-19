import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException, Query
from passlib.context import CryptContext
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload
from fastapi import BackgroundTasks

from app.api.activity_utils import (
    attach_activity_relationships,
    ensure_activity_departments_match,
    ensure_activity_patients_are_editable,
    ensure_activity_patients_match_doctor_department,
    ensure_activity_modifier,
    ensure_supported_activity_type,
    load_activity_or_404,
    load_doctors_for_activity,
    load_patients_for_activity,
    serialize_activity,
)
from app.core.http import ApiResponse, success_response
from app.db.session import SessionLocal
from app.models.doctor.doctor_activity import DoctorActivity
from app.models.doctor.doctor import Doctor
from app.models.doctor.doctor_email_verification import DoctorEmailVerification
from app.models.doctor.doctor_password_reset import DoctorPasswordReset
from app.models.patient import Patient
from app.schemas.doctor import (
    AccountRecoveryRequestResponse,
    DoctorCreate,
    DoctorDeactivateRequest,
    DoctorEmailUpdate,
    DoctorRead,
    DoctorUpdate,
    EmailVerificationResponse,
    LoginRequest,
    LoginResponse,
    PasswordResetConfirm,
    PasswordResetConfirmResponse,
    PasswordResetRequest,
    PasswordResetRequestResponse,
)
from app.schemas.doctor_activity import DoctorActivityCreate, DoctorActivityRead, DoctorActivityUpdate
from app.schemas.patient import PatientRead
from app.schemas.validators import normalize_phone_lookup
from app.service.auth_tokens import TOKEN_TTL, create_email_verification_token, create_password_reset_token, hash_token
from app.service.notifications import send_email_change_verification_email, send_password_reset_email, send_registration_verification_email
from app.utils.datetime import now_utc, to_utc
from app.models.patient.patient_activity_doctor import patient_activity_doctors

router = APIRouter(prefix="/doctors", tags=["doctors"])
auth_router = APIRouter(tags=["auth"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def serialize(model, schema):
    if isinstance(model, DoctorActivity):
        return serialize_activity(model)

    return schema.model_validate(model).model_dump(mode="json")


def serialize_many(models, schema):
    return [serialize(model, schema) for model in models]


def doctor_matches_identifier(doctor: Doctor, identifier: str):
    normalized_identifier = normalize_phone_lookup(identifier)
    normalized_phone = normalize_phone_lookup(doctor.phone_number)
    normalized_email = doctor.email.strip().lower()

    if normalized_email == identifier.strip().lower():
        return True

    if not normalized_identifier or not normalized_phone:
        return False

    return normalized_phone == normalized_identifier


@router.get("", response_model=ApiResponse[list[DoctorRead]])
def list_doctors():
    with SessionLocal() as db:
        doctors = db.execute(select(Doctor)).scalars().all()
        return success_response("Doctors retrieved successfully.", serialize_many(doctors, DoctorRead))


def get_current_doctor(authorization: str | None):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header.")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Invalid authorization header.")

    parts = token.split("-", 2)
    if len(parts) < 3 or parts[0] != "doctor" or not parts[1].isdigit():
        raise HTTPException(status_code=401, detail="Invalid token.")

    doctor_id = int(parts[1])

    with SessionLocal() as db:
        doctor = db.get(Doctor, doctor_id)

        if doctor is None:
            raise HTTPException(status_code=404, detail="Doctor not found.")

        if not doctor.is_active:
            raise HTTPException(status_code=403, detail="Doctor account is inactive.")

        return doctor


def ensure_doctor_uniqueness(db, *, email: str | None = None, phone_number: str | None = None, license_number: str | None = None,
                             doctor_id: int | None = None):
    if email:
        email_query = select(Doctor).where(or_(Doctor.email == email, Doctor.pending_email == email))
        if doctor_id is not None:
            email_query = email_query.where(Doctor.id != doctor_id)
        if db.execute(email_query).scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email already registered.")

    if phone_number:
        phone_query = select(Doctor).where(Doctor.phone_number == phone_number)
        if doctor_id is not None:
            phone_query = phone_query.where(Doctor.id != doctor_id)
        if db.execute(phone_query).scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Phone number already registered.")

    if license_number:
        license_query = select(Doctor).where(Doctor.license_number == license_number)
        if doctor_id is not None:
            license_query = license_query.where(Doctor.id != doctor_id)
        if db.execute(license_query).scalar_one_or_none():
            raise HTTPException(status_code=400, detail="License number already registered.")


@router.get("/me", response_model=ApiResponse[DoctorRead])
def read_current_doctor(authorization: str | None = Header(default=None)):
    doctor = get_current_doctor(authorization)
    return success_response("Doctor profile retrieved successfully.", serialize(doctor, DoctorRead))


@router.get("/{doctor_id}/activities", response_model=ApiResponse[list[DoctorActivityRead]])
def get_doctor_activities(doctor_id: int):
    with SessionLocal() as db:
        doctor = db.get(Doctor, doctor_id)

        if doctor is None:
            raise HTTPException(status_code=404, detail="Doctor not found.")

        activities = db.execute(
            select(DoctorActivity)
            .options(selectinload(DoctorActivity.patients), selectinload(DoctorActivity.doctors))
            .where(DoctorActivity.doctor_id == doctor_id)
            .order_by(DoctorActivity.scheduled_at.asc(), DoctorActivity.id.asc())
        ).scalars().all()

        return success_response(
            "Doctor activities retrieved successfully.",
            serialize_many(activities, DoctorActivityRead),
        )


@router.post("/{doctor_id}/activities", response_model=ApiResponse[DoctorActivityRead])
def create_doctor_activity(doctor_id: int, payload: DoctorActivityCreate, authorization: str | None = Header(default=None)):
    current_doctor = get_current_doctor(authorization)
    from app.api.patients import verify_patient_assignment

    with SessionLocal() as db:
        if current_doctor.id != doctor_id:
            raise HTTPException(status_code=403, detail="Doctors can only create activities for themselves.")

        doctor = db.get(Doctor, doctor_id)

        if doctor is None:
            raise HTTPException(status_code=404, detail="Doctor not found.")

        ensure_supported_activity_type(payload.type)
        patients = load_patients_for_activity(db, payload.patient_ids)
        for patient in patients:
            verify_patient_assignment(db, current_doctor.id, patient.id)
        ensure_activity_patients_match_doctor_department(patients, current_doctor)
        ensure_activity_patients_are_editable(patients)

        doctor_ids = payload.doctor_ids
        if current_doctor.id not in doctor_ids:
            doctor_ids = [current_doctor.id, *doctor_ids]
        doctors = load_doctors_for_activity(db, doctor_ids)
        ensure_activity_departments_match(patients, doctors)

        activity = DoctorActivity(
            doctor_id=doctor_id,
            patient_id=patients[0].id,
            type=payload.type,
            title=payload.title,
            description=payload.description,
            scheduled_at=payload.scheduled_at,
            status="incoming",
        )
        attach_activity_relationships(activity, patients, doctors)

        db.add(activity)
        db.commit()
        db.refresh(activity)
        activity = load_activity_or_404(db, activity.id)

        return success_response(
            "Doctor activity added successfully.",
            serialize_activity(activity),
            status_code=201,
        )


@router.patch("/{doctor_id}/activities/{activity_id}", response_model=ApiResponse[DoctorActivityRead])
def update_doctor_activity(doctor_id: int, activity_id: int, payload: DoctorActivityUpdate,
                           authorization: str | None = Header(default=None)):
    current_doctor = get_current_doctor(authorization)
    from app.api.patients import verify_patient_assignment

    with SessionLocal() as db:
        if current_doctor.id != doctor_id:
            raise HTTPException(status_code=403, detail="Doctors can only update their own activities.")

        activity = load_activity_or_404(db, activity_id)

        if activity.doctor_id != doctor_id:
            raise HTTPException(status_code=404, detail="Activity not found.")

        ensure_activity_modifier(activity, doctor_id)
        updated_fields = []

        if payload.type is not None:
            ensure_supported_activity_type(payload.type)
            activity.type = payload.type
            updated_fields.append("type")

        if payload.title is not None:
            activity.title = payload.title
            updated_fields.append("title")

        if payload.description is not None:
            activity.description = payload.description
            updated_fields.append("description")

        if payload.scheduled_at is not None:
            activity.scheduled_at = payload.scheduled_at
            updated_fields.append("scheduled_at")

        if payload.status is not None:
            normalized_status = payload.status.strip().lower()
            if normalized_status not in {"incoming", "completed", "canceled"}:
                raise HTTPException(status_code=400, detail="Invalid activity status.")
            activity.status = normalized_status
            updated_fields.append("status")

        patients = list(activity.patients)
        ensure_activity_patients_are_editable(patients)

        if payload.doctor_ids is not None:
            doctor_ids = payload.doctor_ids
            if current_doctor.id not in doctor_ids:
                doctor_ids = [current_doctor.id, *doctor_ids]
            doctors = load_doctors_for_activity(db, doctor_ids)
        else:
            doctors = list(activity.doctors)

        patients = list(activity.patients)
        if payload.doctor_ids is not None:
            ensure_activity_departments_match(patients, doctors)
            attach_activity_relationships(activity, patients, doctors)
            if payload.doctor_ids is not None:
                updated_fields.append("doctor_ids")

        db.commit()
        activity = load_activity_or_404(db, activity.id)

        return success_response(
            "Doctor activity updated successfully."
            if not updated_fields
            else f"Doctor activity updated successfully. Updated: {', '.join(updated_fields)}.",
            serialize_activity(activity),
        )


@router.patch("/me", response_model=ApiResponse[DoctorRead])
def update_current_doctor(payload: DoctorUpdate, authorization: str | None = Header(default=None)):
    current_doctor = get_current_doctor(authorization)

    with SessionLocal() as db:
        doctor = db.get(Doctor, current_doctor.id)

        if doctor is None:
            raise HTTPException(status_code=404, detail="Doctor not found.")

        updates = payload.model_dump(exclude_unset=True)
        ensure_doctor_uniqueness(
            db,
            phone_number=updates.get("phone_number"),
            license_number=updates.get("license_number"),
            doctor_id=doctor.id,
        )

        for field, value in updates.items():
            setattr(doctor, field, value)

        try:
            db.commit()
            db.refresh(doctor)
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=400, detail="Doctor profile contains duplicate unique fields.")

        return success_response("Doctor profile updated successfully.", serialize(doctor, DoctorRead))


@router.patch("/me/email", response_model=ApiResponse[DoctorRead])
def update_current_doctor_email(
        payload: DoctorEmailUpdate,
        background_tasks: BackgroundTasks,
        authorization: str | None = Header(default=None)
):
    current_doctor = get_current_doctor(authorization)

    with SessionLocal() as db:
        doctor = db.get(Doctor, current_doctor.id)

        if doctor is None:
            raise HTTPException(status_code=404, detail="Doctor not found.")

        ensure_doctor_uniqueness(db, email=payload.email, doctor_id=doctor.id)

        if payload.email == doctor.email and not doctor.pending_email:
            return success_response("Doctor email is already up to date.", serialize(doctor, DoctorRead))

        doctor.pending_email = payload.email
        doctor.email_confirmed = False
        db.commit()
        db.refresh(doctor)
        raw_token, _ = create_email_verification_token(db, doctor, payload.email)
        background_tasks.add_task(
            send_email_change_verification_email,
            payload.email,
            doctor.first_name,
            raw_token
        )
        return success_response("Doctor email update requested successfully.", serialize(doctor, DoctorRead))


@router.post("/password-reset/request", response_model=ApiResponse[PasswordResetRequestResponse])
def request_password_reset(payload: PasswordResetRequest):
    with SessionLocal() as db:
        doctors = db.execute(select(Doctor)).scalars().all()
        doctor = next((item for item in doctors if doctor_matches_identifier(item, payload.identifier)), None)
        expires_at = now_utc() + TOKEN_TTL

        if doctor is not None:
            raw_token, reset = create_password_reset_token(db, doctor)
            expires_at = reset.expires_at
            send_password_reset_email(doctor.email, doctor.first_name, raw_token)

        response = PasswordResetRequestResponse(
            message="If the email exists, password reset instructions were sent successfully.",
            reset_token="",
            expires_at=expires_at,
        )
        return success_response(response.message, response.model_dump(mode="json"))


@router.post("/account-recovery/request", response_model=ApiResponse[AccountRecoveryRequestResponse])
def request_account_recovery(payload: PasswordResetRequest):
    with SessionLocal() as db:
        doctors = db.execute(select(Doctor)).scalars().all()
        doctor = next((item for item in doctors if doctor_matches_identifier(item, payload.identifier)), None)

        message = "If the account exists, recovery instructions were sent successfully."
        expires_at = now_utc() + TOKEN_TTL
        if doctor is None:
            response = AccountRecoveryRequestResponse(
                message=message,
                recovery_token="",
                expires_at=expires_at,
            )
            return success_response(response.message, response.model_dump(mode="json"))

        raw_token, reset = create_password_reset_token(db, doctor)
        send_password_reset_email(doctor.email, doctor.first_name, raw_token)
        response = AccountRecoveryRequestResponse(
            message=message,
            recovery_token="",
            expires_at=reset.expires_at,
        )
        return success_response(response.message, response.model_dump(mode="json"))


@router.post("/password-reset/confirm", response_model=ApiResponse[PasswordResetConfirmResponse])
def confirm_password_reset(payload: PasswordResetConfirm):
    with SessionLocal() as db:
        now = now_utc()
        reset = db.execute(
            select(DoctorPasswordReset).where(
                DoctorPasswordReset.token_hash == hash_token(payload.token),
                DoctorPasswordReset.used_at.is_(None),
            )
        ).scalar_one_or_none()

        if reset is None or to_utc(reset.expires_at) < now:
            raise HTTPException(status_code=400, detail="Invalid or expired reset token.")

        doctor = db.get(Doctor, reset.doctor_id)

        if doctor is None:
            raise HTTPException(status_code=404, detail="Doctor not found.")

        doctor.password_hash = pwd_context.hash(payload.new_password)
        reset.used_at = to_utc(now)
        db.commit()
        response = PasswordResetConfirmResponse(message="Password reset successful.")
        return success_response(response.message, response.model_dump(mode="json"))


@router.get("/{doctor_id}/patients", response_model=ApiResponse[list[PatientRead]])
def get_doctor_activity_patients(doctor_id: int):
    with SessionLocal() as db:
        doctor = db.execute(
            select(Doctor).options(selectinload(Doctor.patients)).where(Doctor.id == doctor_id)
        ).scalar_one_or_none()

        if doctor is None:
            raise HTTPException(status_code=404, detail="Doctor not found.")

        patients = sorted(doctor.patients, key=lambda patient: patient.id, reverse=True)
        return success_response("Doctor patients retrieved successfully.", serialize_many(patients, PatientRead))


@router.delete("/{doctor_id}", response_model=ApiResponse[DoctorRead])
def delete_doctor(doctor_id: int, payload: DoctorDeactivateRequest):
    with SessionLocal() as db:
        doctor = db.execute(
            select(Doctor).options(selectinload(Doctor.patients)).where(Doctor.id == doctor_id)
        ).scalar_one_or_none()

        if doctor is None:
            raise HTTPException(status_code=404, detail="Doctor not found.")

        if payload.remove_patient_assignments:
            doctor.patients.clear()

        doctor.is_active = False

        if doctor.deleted_at is None:
            doctor.deleted_at = datetime.now(timezone.utc)

        db.commit()
        db.refresh(doctor)
        return success_response("Doctor account deactivated successfully.", serialize(doctor, DoctorRead))


@router.post("/{doctor_id}/patients/{patient_id}", response_model=ApiResponse[list[PatientRead]])
def assign_patient_to_doctor(doctor_id: int, patient_id: int, authorization: str | None = Header(default=None)):
    current_doctor = get_current_doctor(authorization)
    with SessionLocal() as db:
        if current_doctor.id != doctor_id:
            raise HTTPException(status_code=403, detail="Doctors can only assign patients to themselves.")

        doctor = db.execute(
            select(Doctor).options(selectinload(Doctor.patients)).where(Doctor.id == doctor_id)
        ).scalar_one_or_none()
        patient = db.get(Patient, patient_id)

        if doctor is None:
            raise HTTPException(status_code=404, detail="Doctor not found.")

        if patient is None:
            raise HTTPException(status_code=404, detail="Patient not found.")

        if doctor.specialization != patient.department:
            raise HTTPException(status_code=400, detail="Doctor can only be assigned to patients in the same department.")

        if not any(existing_patient.id == patient.id for existing_patient in doctor.patients):
            doctor.patients.append(patient)
            db.commit()
            db.refresh(doctor)

        patients = sorted(doctor.patients, key=lambda assigned_patient: assigned_patient.id, reverse=True)
        return success_response("Patient assigned to doctor successfully.", serialize_many(patients, PatientRead))


@router.delete("/{doctor_id}/patients/{patient_id}", response_model=ApiResponse[list[PatientRead]])
def remove_patient_from_doctor(doctor_id: int, patient_id: int):
    with SessionLocal() as db:
        doctor = db.execute(
            select(Doctor).options(selectinload(Doctor.patients)).where(Doctor.id == doctor_id)
        ).scalar_one_or_none()

        if doctor is None:
            raise HTTPException(status_code=404, detail="Doctor not found.")

        next_patients = [patient for patient in doctor.patients if patient.id == patient_id]

        if next_patients:
            doctor.patients.remove(next_patients[0])
            db.commit()
            db.refresh(doctor)

        patients = sorted(doctor.patients, key=lambda patient: patient.id, reverse=True)
        message = "Patient removed from doctor successfully." if next_patients else "Doctor patients retrieved successfully."
        return success_response(message, serialize_many(patients, PatientRead))


def register_doctor(payload: DoctorCreate):
    with SessionLocal() as db:
        duplicate_filters = [Doctor.email == payload.email, Doctor.license_number == payload.license_number]
        if payload.phone_number:
            duplicate_filters.append(Doctor.phone_number == payload.phone_number)

        matching_doctors = db.execute(select(Doctor).where(or_(*duplicate_filters))).scalars().all()

        email_match = next((doctor for doctor in matching_doctors if doctor.email == payload.email), None)
        phone_match = next(
            (doctor for doctor in matching_doctors if payload.phone_number and doctor.phone_number == payload.phone_number),
            None,
        )
        license_match = next((doctor for doctor in matching_doctors if doctor.license_number == payload.license_number), None)

        for match, message in (
                (email_match, "Email already registered."),
                (phone_match, "Phone number already registered."),
                (license_match, "License number already registered."),
        ):
            if match and match.is_active:
                raise HTTPException(status_code=400, detail=message)

        restore_candidate = next((doctor for doctor in (email_match, phone_match, license_match) if doctor is not None), None)

        if restore_candidate and not restore_candidate.is_active:
            restore_candidate.first_name = payload.first_name
            restore_candidate.last_name = payload.last_name
            restore_candidate.email = payload.email
            restore_candidate.pending_email = None
            restore_candidate.email_confirmed = False
            restore_candidate.phone_number = payload.phone_number
            restore_candidate.birth_date = payload.birth_date
            restore_candidate.password_hash = pwd_context.hash(payload.password)
            restore_candidate.specialization = payload.specialization
            restore_candidate.license_number = payload.license_number
            restore_candidate.is_active = True
            restore_candidate.deleted_at = None
            db.commit()
            db.refresh(restore_candidate)
            raw_token, _ = create_email_verification_token(db, restore_candidate, restore_candidate.email)
            send_registration_verification_email(restore_candidate.email, restore_candidate.first_name, raw_token)
            return restore_candidate

        doctor = Doctor(
            first_name=payload.first_name,
            last_name=payload.last_name,
            email=payload.email,
            pending_email=None,
            email_confirmed=False,
            phone_number=payload.phone_number,
            birth_date=payload.birth_date,
            password_hash=pwd_context.hash(payload.password),
            specialization=payload.specialization,
            license_number=payload.license_number,
        )
        db.add(doctor)
        try:
            db.commit()
            db.refresh(doctor)
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=400, detail="Doctor identity fields must be unique.")

        raw_token, _ = create_email_verification_token(db, doctor, doctor.email)
        send_registration_verification_email(doctor.email, doctor.first_name, raw_token)
        return doctor


@router.post("", response_model=ApiResponse[DoctorRead])
def create_doctor(payload: DoctorCreate):
    doctor = register_doctor(payload)
    return success_response("Doctor account created successfully.", serialize(doctor, DoctorRead), status_code=201)


def login_doctor(payload: LoginRequest):
    with SessionLocal() as db:
        doctors = db.execute(select(Doctor)).scalars().all()
        doctor = next((item for item in doctors if doctor_matches_identifier(item, payload.identifier)), None)

        if not doctor or not doctor.is_active or not pwd_context.verify(payload.password, doctor.password_hash):
            raise HTTPException(status_code=401, detail="Invalid credentials.")

        return LoginResponse(token=f"doctor-{doctor.id}-{secrets.token_hex(16)}")


@router.post("/login", response_model=ApiResponse[LoginResponse])
def login(payload: LoginRequest):
    response = login_doctor(payload)
    return success_response("Login successful.", response.model_dump(mode="json"))


@auth_router.post("/login", response_model=ApiResponse[LoginResponse])
def root_login(payload: LoginRequest):
    response = login_doctor(payload)
    return success_response("Login successful.", response.model_dump(mode="json"))


@auth_router.post("/register", response_model=ApiResponse[DoctorRead])
def register(payload: DoctorCreate):
    doctor = register_doctor(payload)
    return success_response("Doctor account created successfully. Please verify your email.", serialize(doctor, DoctorRead),
                            status_code=201)


@auth_router.get("/auth/verify-email", response_model=ApiResponse[EmailVerificationResponse])
def verify_email(token: str = Query(...)):
    with SessionLocal() as db:
        verification = db.execute(
            select(DoctorEmailVerification).where(
                DoctorEmailVerification.token_hash == hash_token(token),
                DoctorEmailVerification.used_at.is_(None),
            )
        ).scalar_one_or_none()

        if verification is None or to_utc(verification.expires_at) < now_utc():
            raise HTTPException(status_code=400, detail="Invalid or expired verification token.")

        doctor = db.get(Doctor, verification.doctor_id)

        if doctor is None:
            raise HTTPException(status_code=404, detail="Doctor not found.")

        if doctor.pending_email and verification.target_email == doctor.pending_email:
            doctor.email = doctor.pending_email
            doctor.pending_email = None
        elif verification.target_email != doctor.email:
            raise HTTPException(status_code=400, detail="Verification token does not match the doctor email.")

        doctor.email_confirmed = True
        verification.used_at = now_utc()
        db.commit()

        response = EmailVerificationResponse(message="Email verified successfully.")
        return success_response(response.message, response.model_dump(mode="json"))


@auth_router.post("/auth/forgot-password", response_model=ApiResponse[PasswordResetRequestResponse])
def auth_forgot_password(payload: PasswordResetRequest):
    return request_password_reset(payload)


@auth_router.post("/auth/reset-password", response_model=ApiResponse[PasswordResetConfirmResponse])
def auth_reset_password(payload: PasswordResetConfirm):
    return confirm_password_reset(payload)
