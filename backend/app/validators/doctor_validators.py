from __future__ import annotations

from datetime import date

from sqlalchemy import or_, select

from app.core.errors import AuthorizationError, PermissionDeniedError, ValidationError
from app.models.doctor.doctor_activity_patient import doctor_activity_patients
from app.service.auth_tokens import parse_access_token
from app.validators.auth_validators import (
    validate_email_address,
    validate_license_number,
    validate_login_identifier,
    validate_password_confirmation,
    validate_password_strength,
    validate_token_value,
)
from app.validators.common_validators import normalize_optional_text, require_non_empty, validate_list_not_empty
from app.validators.patient_validators import normalize_phone_value, validate_department_value


def validate_authorization_header(authorization: str | None) -> str:
    if not authorization:
        raise AuthorizationError("MISSING_AUTH_HEADER")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise AuthorizationError("INVALID_AUTH_HEADER")

    return token


def parse_doctor_token(token: str) -> int:
    return parse_access_token(token)


def validate_doctor_status(is_active: bool) -> None:
    if not is_active:
        raise AuthorizationError("DOCTOR_INACTIVE")


def validate_doctor_self_action(current_doctor_id: int, doctor_id: int, action: str) -> None:
    if current_doctor_id != doctor_id:
        raise PermissionDeniedError("DOCTOR_SELF_ACTION_ONLY", context={"action": action})


def validate_required_text(value: str | None, field_label: str) -> str:
    return require_non_empty(value, field_label)


def normalize_email(value: str | None) -> str:
    return validate_email_address(value)


def normalize_phone_number(value: str | None) -> str | None:
    return normalize_phone_value(value)


def validate_phone_number(value: str | None) -> str | None:
    return normalize_phone_number(value)


def validate_birth_date(value: date | None) -> date | None:
    if value is None:
        return None
    if value > date.today():
        raise ValidationError("BIRTH_DATE_IN_FUTURE")
    return value


def validate_doctor_create_payload(payload) -> dict:
    password = validate_password_strength(payload.password)
    confirm_password = require_non_empty(payload.confirm_password, "Confirm password")
    validate_password_confirmation(password, confirm_password)

    return {
        "first_name": require_non_empty(payload.first_name, "First Name"),
        "last_name": require_non_empty(payload.last_name, "Last Name"),
        "email": normalize_email(payload.email),
        "phone_number": normalize_phone_number(payload.phone_number),
        "birth_date": validate_birth_date(payload.birth_date),
        "password": password,
        "specialization": validate_department_value(payload.specialization),
        "license_number": validate_license_number(payload.license_number),
    }


def validate_doctor_update_payload(payload) -> dict:
    updates = payload.model_dump(exclude_unset=True)

    if "first_name" in updates:
        updates["first_name"] = require_non_empty(updates.get("first_name"), "First Name")
    if "last_name" in updates:
        updates["last_name"] = require_non_empty(updates.get("last_name"), "Last Name")
    if "specialization" in updates:
        updates["specialization"] = validate_department_value(updates.get("specialization"))
    if "license_number" in updates:
        updates["license_number"] = validate_license_number(updates.get("license_number"))
    if "phone_number" in updates:
        updates["phone_number"] = normalize_phone_number(updates.get("phone_number"))
    if "birth_date" in updates:
        updates["birth_date"] = validate_birth_date(updates.get("birth_date"))

    return updates


def validate_doctor_email(value: str) -> str:
    return normalize_email(value)


def validate_doctor_uniqueness(
    db,
    doctor_model,
    *,
    email: str | None = None,
    phone_number: str | None = None,
    license_number: str | None = None,
    doctor_id: int | None = None,
) -> None:
    if email:
        email_query = select(doctor_model).where(or_(doctor_model.email == email, doctor_model.pending_email == email))
        if doctor_id is not None:
            email_query = email_query.where(doctor_model.id != doctor_id)
        if db.execute(email_query).scalar_one_or_none():
            raise ValidationError("EMAIL_ALREADY_REGISTERED")

    if phone_number:
        phone_query = select(doctor_model).where(doctor_model.phone_number == phone_number)
        if doctor_id is not None:
            phone_query = phone_query.where(doctor_model.id != doctor_id)
        if db.execute(phone_query).scalar_one_or_none():
            raise ValidationError("PHONE_ALREADY_REGISTERED")

    if license_number:
        license_query = select(doctor_model).where(doctor_model.license_number == license_number)
        if doctor_id is not None:
            license_query = license_query.where(doctor_model.id != doctor_id)
        if db.execute(license_query).scalar_one_or_none():
            raise ValidationError("LICENSE_ALREADY_REGISTERED")


def validate_login_payload(payload) -> tuple[str, str]:
    identifier = validate_login_identifier(payload.identifier)
    password = require_non_empty(payload.password, "Password")
    return identifier, password


def validate_identifier_payload(payload) -> str:
    return validate_login_identifier(payload.identifier)


def validate_doctor_identifier_match(email: str, phone_number: str | None, identifier: str) -> bool:
    normalized_identifier = normalize_phone_value(identifier)
    normalized_phone = normalize_phone_value(phone_number)
    normalized_email = email.strip().lower()

    if normalized_email == identifier.strip().lower():
        return True

    if not normalized_identifier or not normalized_phone:
        return False

    return normalized_phone == normalized_identifier


def validate_password_reset_payload(payload) -> tuple[str, str]:
    token = validate_token_value(payload.token)
    password = validate_password_strength(payload.new_password)
    validate_password_confirmation(password, payload.confirm_password)
    return token, password


def validate_activity_payload(type_value: str, title: str, description: str | None, doctor_ids: list[int]) -> tuple[str, str, str | None, list[int]]:
    normalized_type = require_non_empty(type_value, "Type")
    normalized_title = require_non_empty(title, "Title")
    normalized_description = normalize_optional_text(description)
    normalized_doctor_ids = validate_list_not_empty(doctor_ids, "doctor")
    return normalized_type, normalized_title, normalized_description, normalized_doctor_ids


def validate_activity_type(value: str | None) -> str:
    return require_non_empty(value, "Type")


def validate_activity_title(value: str | None) -> str:
    return require_non_empty(value, "Title")


def validate_activity_description(value: str | None) -> str | None:
    return normalize_optional_text(value)


def validate_activity_status(value: str) -> str:
    normalized_status = require_non_empty(value, "Status").strip().lower()
    if normalized_status not in {"incoming", "completed", "canceled"}:
        raise ValidationError("INVALID_ACTIVITY_STATUS")
    return normalized_status


def validate_doctor_patient_department_match(doctor_specialization: str, patient_department: str) -> None:
    if doctor_specialization != patient_department:
        raise ValidationError("DOCTOR_PATIENT_DEPARTMENT_MISMATCH")


def validate_doctor_patient_specialization(doctor, patient) -> None:
    if doctor is None or patient is None:
        raise ValidationError("INVALID_SPECIALIZATION_MATCH")
    if doctor.specialization != patient.department:
        raise ValidationError("INVALID_SPECIALIZATION_MATCH")


def validate_activity_creation(db, doctor, patient) -> None:
    if patient is None or doctor is None:
        raise ValidationError("INVALID_SPECIALIZATION_MATCH")

    if patient.is_discharged:
        raise ValidationError("PATIENT_DISCHARGED")

    if doctor.specialization != patient.department:
        raise ValidationError("INVALID_SPECIALIZATION_MATCH")

    assigned = db.execute(
        doctor_activity_patients.select().where(
            doctor_activity_patients.c.patient_id == patient.id,
            doctor_activity_patients.c.doctor_id == doctor.id,
        )
    ).first()

    if not assigned:
        raise ValidationError("PATIENT_NOT_ASSIGNED")
