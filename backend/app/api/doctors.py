import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Header, HTTPException
from passlib.context import CryptContext
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.core.http import ApiResponse, success_response
from app.db.session import SessionLocal
from app.models.doctor.doctor_activity import DoctorActivity
from app.models.doctor.doctor import Doctor
from app.models.doctor.doctor_password_reset import DoctorPasswordReset
from app.models.patient import Patient
from app.schemas.doctor import (
    AccountRecoveryRequestResponse,
    DoctorCreate,
    DoctorDeactivateRequest,
    DoctorEmailUpdate,
    DoctorRead,
    DoctorUpdate,
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
from app.services.notifications import (
    send_account_recovery_notifications,
    send_email_change_confirmation,
    send_password_reset_notifications,
    send_registration_notifications,
)
from app.models.patient.patient_activity_doctor import patient_activity_doctors

router = APIRouter(prefix="/doctors", tags=["doctors"])
auth_router = APIRouter(tags=["auth"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
password_reset_ttl = timedelta(minutes=30)


def serialize(model, schema):
    if isinstance(model, DoctorActivity):
        data = {
            **model.__dict__,
            "patient_ids": [p.id for p in model.patients],
            "doctor_ids": [d.id for d in model.doctors],
        }
        return schema.model_validate(data).model_dump(mode="json")

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
def create_doctor_activity(doctor_id: int, payload: DoctorActivityCreate):
    with SessionLocal() as db:
        doctor = db.get(Doctor, doctor_id)

        if doctor is None:
            raise HTTPException(status_code=404, detail="Doctor not found.")

        patients = db.execute(
            select(Patient).options(selectinload(Patient.doctors)).where(Patient.id.in_(payload.patient_ids))
        ).scalars().all()

        doctors = db.execute(
            select(Doctor).where(Doctor.id.in_(payload.doctor_ids))
        ).scalars().all()

        activity = DoctorActivity(
            doctor_id=doctor_id,
            type=payload.type,
            title=payload.title,
            description=payload.description,
            scheduled_at=payload.scheduled_at,
            status="incoming",
        )

        activity.patients.extend(patients)
        activity.doctors.extend(doctors)

        # Automatically assign doctors to patients
        for patient in patients:
            for d in doctors:
                if d not in patient.doctors:
                    patient.doctors.append(d)

        db.add(activity)
        db.commit()
        db.refresh(activity)

        return success_response(
            "Doctor activity added successfully.",
            serialize(activity, DoctorActivityRead),
            status_code=201,
        )


@router.patch("/{doctor_id}/activities/{activity_id}", response_model=ApiResponse[DoctorActivityRead])
def update_doctor_activity(doctor_id: int, activity_id: int, payload: DoctorActivityUpdate):
    with SessionLocal() as db:
        activity = db.get(DoctorActivity, activity_id)

        if activity is None or activity.doctor_id != doctor_id:
            raise HTTPException(status_code=404, detail="Activity not found.")

        if payload.title is not None:
            activity.title = payload.title

        if payload.description is not None:
            activity.description = payload.description

        if payload.scheduled_at is not None:
            activity.scheduled_at = payload.scheduled_at

        if payload.status is not None:
            activity.status = payload.status

        if payload.patient_ids is not None:
            patients = db.execute(
                select(Patient).options(selectinload(Patient.doctors)).where(Patient.id.in_(payload.patient_ids))
            ).scalars().all()
            activity.patients = patients

        if payload.doctor_ids is not None:
            doctors = db.execute(
                select(Doctor).where(Doctor.id.in_(payload.doctor_ids))
            ).scalars().all()
            activity.doctors = doctors
            
            # Automatically assign added doctors to patients
            if not getattr(activity, "patients", None):
                activity_patients = db.execute(
                    select(Patient).options(selectinload(Patient.doctors)).where(
                        Patient.activities.any(DoctorActivity.id == activity.id)
                    )
                ).scalars().all()
            else:
                activity_patients = activity.patients
                
            for patient in activity_patients:
                for d in doctors:
                    if d not in patient.doctors:
                        patient.doctors.append(d)

        db.commit()
        db.refresh(activity)

        return success_response(
            "Doctor activity updated successfully.",
            serialize(activity, DoctorActivityRead),
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
def update_current_doctor_email(payload: DoctorEmailUpdate, authorization: str | None = Header(default=None)):
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
        send_email_change_confirmation(payload.email, doctor.first_name)
        return success_response("Doctor email update requested successfully.", serialize(doctor, DoctorRead))


@router.post("/password-reset/request", response_model=ApiResponse[PasswordResetRequestResponse])
def request_password_reset(payload: PasswordResetRequest):
    with SessionLocal() as db:
        doctors = db.execute(select(Doctor)).scalars().all()
        doctor = next((item for item in doctors if doctor_matches_identifier(item, payload.identifier)), None)

        if doctor is None:
            raise HTTPException(status_code=404, detail="Doctor not found.")

        raw_token, reset = create_doctor_reset_token(db, doctor)
        send_password_reset_notifications(doctor.email, doctor.phone_number, raw_token)
        response = PasswordResetRequestResponse(
            message="Password reset token generated successfully.",
            reset_token=raw_token,
            expires_at=reset.expires_at,
        )
        return success_response(response.message, response.model_dump(mode="json"))


@router.post("/account-recovery/request", response_model=ApiResponse[AccountRecoveryRequestResponse])
def request_account_recovery(payload: PasswordResetRequest):
    with SessionLocal() as db:
        doctors = db.execute(select(Doctor)).scalars().all()
        doctor = next((item for item in doctors if doctor_matches_identifier(item, payload.identifier)), None)

        message = "If the account exists, recovery instructions were sent successfully."
        if doctor is None:
            response = AccountRecoveryRequestResponse(
                message=message,
                recovery_token="",
                expires_at=datetime.now(UTC).replace(tzinfo=None),
            )
            return success_response(response.message, response.model_dump(mode="json"))

        raw_token, reset = create_doctor_reset_token(db, doctor)
        send_account_recovery_notifications(doctor.email, doctor.phone_number, raw_token)
        response = AccountRecoveryRequestResponse(
            message=message,
            recovery_token=raw_token,
            expires_at=reset.expires_at,
        )
        return success_response(response.message, response.model_dump(mode="json"))


@router.post("/password-reset/confirm", response_model=ApiResponse[PasswordResetConfirmResponse])
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
            raise HTTPException(status_code=400, detail="Invalid or expired reset token.")

        doctor = db.get(Doctor, reset.doctor_id)

        if doctor is None:
            raise HTTPException(status_code=404, detail="Doctor not found.")

        doctor.password_hash = pwd_context.hash(payload.new_password)
        reset.used_at = now
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
            doctor.deleted_at = datetime.now(UTC).replace(tzinfo=None)

        db.commit()
        db.refresh(doctor)
        return success_response("Doctor account deactivated successfully.", serialize(doctor, DoctorRead))


@router.post("/{doctor_id}/patients/{patient_id}", response_model=ApiResponse[list[PatientRead]])
def assign_patient_to_doctor(doctor_id: int, patient_id: int):
    with SessionLocal() as db:
        doctor = db.execute(
            select(Doctor).options(selectinload(Doctor.patients)).where(Doctor.id == doctor_id)
        ).scalar_one_or_none()
        patient = db.get(Patient, patient_id)

        if doctor is None:
            raise HTTPException(status_code=404, detail="Doctor not found.")

        if patient is None:
            raise HTTPException(status_code=404, detail="Patient not found.")

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
            restore_candidate.email_confirmed = True
            restore_candidate.phone_number = payload.phone_number
            restore_candidate.birth_date = payload.birth_date
            restore_candidate.password_hash = pwd_context.hash(payload.password)
            restore_candidate.specialization = payload.specialization
            restore_candidate.license_number = payload.license_number
            restore_candidate.is_active = True
            restore_candidate.deleted_at = None
            db.commit()
            db.refresh(restore_candidate)
            send_registration_notifications(
                restore_candidate.email,
                restore_candidate.phone_number,
                restore_candidate.first_name,
            )
            return restore_candidate

        doctor = Doctor(
            first_name=payload.first_name,
            last_name=payload.last_name,
            email=payload.email,
            pending_email=None,
            email_confirmed=True,
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

        send_registration_notifications(doctor.email, doctor.phone_number, doctor.first_name)
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
    return success_response("Doctor account created successfully.", serialize(doctor, DoctorRead), status_code=201)
