from __future__ import annotations

import re

from app.core.errors import ValidationError
from app.validators.common_validators import require_non_empty
from app.validators.patient_validators import normalize_phone_lookup


def validate_email_address(value: str | None) -> str:
    email = require_non_empty(value, "Email")
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise ValidationError("INVALID_EMAIL_FORMAT")
    return email


def validate_password_strength(value: str | None) -> str:
    password = require_non_empty(value, "Password")

    if len(password) < 8:
        raise ValidationError("PASSWORD_TOO_SHORT")

    if not any(character.isupper() for character in password):
        raise ValidationError("PASSWORD_MISSING_UPPERCASE")

    if not any(character.isdigit() for character in password):
        raise ValidationError("PASSWORD_MISSING_NUMBER")

    return password


def validate_password_confirmation(password: str, confirm_password: str | None) -> None:
    if confirm_password is None:
        return
    if password != confirm_password:
        raise ValidationError("PASSWORDS_MISMATCH")


def validate_login_identifier(value: str | None) -> str:
    return require_non_empty(value, "Identifier")


def validate_token_value(value: str | None) -> str:
    return require_non_empty(value, "Token")


def normalize_login_identifier(value: str | None) -> str:
    identifier = validate_login_identifier(value)
    phone_lookup = normalize_phone_lookup(identifier)
    return phone_lookup or identifier.strip().lower()


def validate_license_number(value: str | None) -> str:
    return require_non_empty(value, "License Number")
