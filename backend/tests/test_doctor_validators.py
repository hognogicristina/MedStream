from datetime import date
from types import SimpleNamespace

import pytest

from app.core.errors import ValidationError
from app.validators.doctor_validators import (
    validate_doctor_create_payload,
    validate_doctor_update_payload,
    validate_login_payload,
    validate_password_reset_payload,
)


def doctor_payload(**overrides):
    payload = {
        "first_name": "Elena",
        "last_name": "Popescu",
        "email": "doctor@example.com",
        "phone_number": "0757809065",
        "birth_date": date(1990, 1, 1),
        "password": "Password1",
        "confirm_password": "Password1",
        "specialization": "Endocrinology",
        "license_number": "DOC-1013",
    }
    payload.update(overrides)
    return SimpleNamespace(**payload)


def test_doctor_create_rejects_first_name_longer_than_database_limit():
    with pytest.raises(ValidationError) as error:
        validate_doctor_create_payload(doctor_payload(first_name="A" * 101))

    assert error.value.code == "FIELD_TOO_LONG"
    assert error.value.context == {"field": "First Name", "max": 100}


def test_doctor_create_rejects_license_number_longer_than_database_limit():
    with pytest.raises(ValidationError) as error:
        validate_doctor_create_payload(doctor_payload(license_number="D" * 51))

    assert error.value.code == "FIELD_TOO_LONG"
    assert error.value.context == {"field": "License Number", "max": 50}


def test_doctor_update_rejects_last_name_longer_than_database_limit():
    payload = SimpleNamespace(model_dump=lambda exclude_unset: {"last_name": "B" * 101})

    with pytest.raises(ValidationError) as error:
        validate_doctor_update_payload(payload)

    assert error.value.code == "FIELD_TOO_LONG"
    assert error.value.context == {"field": "Last Name", "max": 100}


def test_doctor_create_rejects_password_longer_than_bcrypt_limit():
    with pytest.raises(ValidationError) as error:
        validate_doctor_create_payload(doctor_payload(password="Password1" * 10, confirm_password="Password1" * 10))

    assert error.value.code == "PASSWORD_TOO_LONG"


def test_login_rejects_password_longer_than_bcrypt_limit():
    payload = SimpleNamespace(identifier="doctor@example.com", password="Password1" * 10)

    with pytest.raises(ValidationError) as error:
        validate_login_payload(payload)

    assert error.value.code == "PASSWORD_TOO_LONG"


def test_password_reset_rejects_password_longer_than_bcrypt_limit():
    payload = SimpleNamespace(token="reset-token", new_password="Password1" * 10, confirm_password="Password1" * 10)

    with pytest.raises(ValidationError) as error:
        validate_password_reset_payload(payload)

    assert error.value.code == "PASSWORD_TOO_LONG"
