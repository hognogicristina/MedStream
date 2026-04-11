import re

from app.constants import DEPARTMENTS

ROMANIA_COUNTRY = "Romania"
CNP_CONTROL_WEIGHTS = "279146358279"


def strip_string(value: str | None) -> str:
    return str(value or "").strip()


def require_non_empty(value: str | None, field_label: str) -> str:
    trimmed = strip_string(value)

    if not trimmed:
        raise ValueError(f"{field_label} is required.")

    return trimmed


def validate_email_address(value: str | None) -> str:
    email = require_non_empty(value, "Email")

    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise ValueError("Email format is invalid.")

    return email


def normalize_phone_number(value: str | None):
    raw_value = strip_string(value)

    if not raw_value:
        return None

    has_plus_prefix = raw_value.startswith("+")
    digits = "".join(char for char in raw_value if char.isdigit())

    if not digits:
        return None

    if digits.startswith("0040") and len(digits) == 14:
        digits = digits[2:]

    if digits.startswith("40") and len(digits) == 11 and digits[2] == "7":
        return f"0{digits[2:]}"

    if digits.startswith("07") and len(digits) == 10:
        return digits

    if 8 <= len(digits) <= 15 and (has_plus_prefix or not digits.startswith("0")):
        return f"+{digits}"

    raise ValueError("Phone number must use a valid international format.")


def normalize_phone_lookup(value: str | None):
    try:
        normalized = normalize_phone_number(value)
    except ValueError:
        return ""

    if not normalized:
        return ""

    digits = "".join(char for char in normalized if char.isdigit())

    if digits.startswith("40") and len(digits) == 11 and digits[2] == "7":
        return f"0{digits[2:]}"

    return digits


def validate_password_strength(value: str | None) -> str:
    password = require_non_empty(value, "Password")

    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters long.")

    if not any(character.isupper() for character in password):
        raise ValueError("Password must contain at least one uppercase letter.")

    if not any(character.isdigit() for character in password):
        raise ValueError("Password must contain at least one number.")

    return password


def validate_department(value: str | None) -> str:
    department = require_non_empty(value, "Department")

    if department not in DEPARTMENTS:
        raise ValueError("Department is invalid.")

    return department


def validate_cnp(value: str | None) -> str:
    cnp = require_non_empty(value, "CNP")

    if not re.fullmatch(r"\d{13}", cnp):
        raise ValueError("CNP must contain exactly 13 digits.")

    checksum_total = sum(
        int(digit) * int(weight) for digit, weight in zip(cnp[:12], CNP_CONTROL_WEIGHTS, strict=True)
    )
    checksum = checksum_total % 11
    checksum = 1 if checksum == 10 else checksum

    if checksum != int(cnp[-1]):
        raise ValueError("CNP format is invalid.")

    return cnp
