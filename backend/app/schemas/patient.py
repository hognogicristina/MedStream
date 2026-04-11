from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator


SUPPORTED_PHONE_COUNTRIES = {
    "40": {"min_length": 9, "max_length": 9},
    "44": {"min_length": 10, "max_length": 10},
    "1": {"min_length": 10, "max_length": 10},
    "49": {"min_length": 10, "max_length": 11},
    "33": {"min_length": 9, "max_length": 9},
    "39": {"min_length": 9, "max_length": 10},
}
PHONE_NUMBER_PATTERN = r"^\+\d{1,3} \d{6,14}$"


def normalize_patient_phone_number(value: str | None):
    raw = str(value or "").strip()

    if not raw:
        return raw

    normalized_raw = f"+{raw[2:]}" if raw.startswith("00") else raw

    if not normalized_raw.startswith("+"):
        return raw

    digits = "".join(character for character in normalized_raw if character.isdigit())
    matched_country_code = next(
        (country_code for country_code in sorted(SUPPORTED_PHONE_COUNTRIES, key=len, reverse=True) if digits.startswith(country_code)),
        None,
    )

    if not matched_country_code:
        return raw

    national_number = digits[len(matched_country_code):]
    country_rules = SUPPORTED_PHONE_COUNTRIES[matched_country_code]

    if not (country_rules["min_length"] <= len(national_number) <= country_rules["max_length"]):
        return raw

    return f"+{matched_country_code} {national_number}"


def validate_patient_phone_number(value: str | None):
    normalized_value = normalize_patient_phone_number(value)

    if not normalized_value or " " not in normalized_value:
        return False

    country_code, national_number = normalized_value.split(" ", 1)
    country_rules = SUPPORTED_PHONE_COUNTRIES.get(country_code.lstrip("+"))

    if not country_rules or not national_number.isdigit():
        return False

    return country_rules["min_length"] <= len(national_number) <= country_rules["max_length"]


class PatientAddressBase(BaseModel):
    street: str
    number: str
    apartment: str | None = None
    city: str
    state: str
    postal_code: str
    country: str

    @field_validator("street", "number", "city", "state", "postal_code", "country", mode="before")
    @classmethod
    def strip_required_strings(cls, value):
        return str(value or "").strip()

    @field_validator("street", "number", "city", "state", "postal_code", "country")
    @classmethod
    def ensure_required_strings(cls, value):
        if not value:
            raise ValueError("Address fields must not be empty.")

        return value

    @field_validator("apartment", mode="before")
    @classmethod
    def strip_optional_apartment(cls, value):
        trimmed = str(value or "").strip()
        return trimmed or None


class PatientAddressCreate(PatientAddressBase):
    pass


class PatientAddressUpdate(BaseModel):
    street: str | None = None
    number: str | None = None
    apartment: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    country: str | None = None

    @field_validator("street", "number", "city", "state", "postal_code", "country", mode="before")
    @classmethod
    def strip_required_strings(cls, value):
        if value is None:
            return value

        trimmed = str(value).strip()
        return trimmed or None

    @field_validator("apartment", mode="before")
    @classmethod
    def strip_optional_apartment(cls, value):
        if value is None:
            return value

        trimmed = str(value).strip()
        return trimmed or None


class PatientBase(BaseModel):
    first_name: str
    last_name: str
    department: Literal["ER", "ICU", "Cardiology", "Internal Medicine", "Neurology", "Ward"]
    cnp: str
    phone_number: str = Field(pattern=PHONE_NUMBER_PATTERN)
    birth_date: date
    gender: str
    address: PatientAddressCreate

    @field_validator("phone_number", mode="before")
    @classmethod
    def format_phone_number(cls, value):
        return normalize_patient_phone_number(value)

    @field_validator("phone_number")
    @classmethod
    def ensure_supported_phone_number(cls, value):
        if not validate_patient_phone_number(value):
            raise ValueError("Phone number must use a supported international format.")

        return value


class PatientCreate(PatientBase):
    pass


class PatientUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    department: Literal["ER", "ICU", "Cardiology", "Internal Medicine", "Neurology", "Ward"] | None = None
    cnp: str | None = None
    phone_number: str | None = Field(default=None, pattern=PHONE_NUMBER_PATTERN)
    birth_date: date | None = None
    gender: str | None = None
    address: PatientAddressUpdate | None = None

    @field_validator("phone_number", mode="before")
    @classmethod
    def format_phone_number(cls, value):
        return normalize_patient_phone_number(value)

    @field_validator("phone_number")
    @classmethod
    def ensure_supported_phone_number(cls, value):
        if value is not None and not validate_patient_phone_number(value):
            raise ValueError("Phone number must use a supported international format.")

        return value


class PatientRead(PatientBase):
    id: int

    model_config = {"from_attributes": True}


class PatientDepartmentUpdate(BaseModel):
    department: Literal["ER", "ICU", "Cardiology", "Internal Medicine", "Neurology", "Ward"]
    reason: str = Field(min_length=3, max_length=300)
