from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.validators import (
    ROMANIA_COUNTRY,
    normalize_phone_number,
    require_non_empty,
    validate_cnp,
    validate_department,
)


class PatientAddressBase(BaseModel):
    street: str
    number: str
    apartment: str | None = None
    city: str
    county: str
    postal_code: str

    @field_validator("street", "number", "city", "county", "postal_code", mode="before")
    @classmethod
    def strip_required_strings(cls, value):
        return require_non_empty(value, "Address field")

    @field_validator("postal_code", mode="before")
    @classmethod
    def normalize_postal_code(cls, value):
        return "".join(char for char in str(value or "").strip() if char.isdigit())

    @field_validator("postal_code")
    @classmethod
    def validate_postal_code(cls, value):
        if len(value) != 6:
            raise ValueError("Postal code must contain exactly 6 digits.")
        return value

    @field_validator("apartment", mode="before")
    @classmethod
    def strip_optional_apartment(cls, value):
        trimmed = str(value or "").strip()
        return trimmed or None


class PatientAddressCreate(PatientAddressBase):
    pass


class PatientAddressRead(BaseModel):
    street: str | None = None
    number: str | None = None
    apartment: str | None = None
    city: str | None = None
    county: str | None = None
    postal_code: str | None = None
    country: str = ROMANIA_COUNTRY


class PatientAddressUpdate(BaseModel):
    street: str | None = None
    number: str | None = None
    apartment: str | None = None
    city: str | None = None
    county: str | None = None
    postal_code: str | None = None

    @field_validator("street", "number", "city", "county", "postal_code", mode="before")
    @classmethod
    def strip_required_strings(cls, value):
        if value is None:
            return value
        return require_non_empty(value, "Address field")

    @field_validator("postal_code", mode="before")
    @classmethod
    def normalize_optional_postal_code(cls, value):
        if value is None:
            return value
        digits = "".join(char for char in str(value).strip() if char.isdigit())
        return digits or None

    @field_validator("postal_code")
    @classmethod
    def validate_optional_postal_code(cls, value):
        if value is not None and len(value) != 6:
            raise ValueError("Postal code must contain exactly 6 digits.")
        return value

    @field_validator("apartment", mode="before")
    @classmethod
    def strip_optional_apartment(cls, value):
        if value is None:
            return value
        trimmed = str(value).strip()
        return trimmed or None

    @model_validator(mode="after")
    def validate_completeness(self):
        values = {
            "street": self.street,
            "number": self.number,
            "city": self.city,
            "county": self.county,
            "postal_code": self.postal_code,
        }

        if any(value is not None for value in values.values()) and not all(values.values()):
            raise ValueError("Address fields must be complete.")

        return self


class PatientBase(BaseModel):
    first_name: str
    last_name: str
    department: str
    cnp: str
    phone_number: str
    birth_date: date
    gender: str
    arrival_method: str = "self"
    address: PatientAddressCreate

    @field_validator("first_name", "last_name", "gender", mode="before")
    @classmethod
    def validate_required_text(cls, value, info):
        return require_non_empty(value, info.field_name.replace("_", " ").title())

    @field_validator("department", mode="before")
    @classmethod
    def validate_department_name(cls, value):
        return validate_department(value)

    @field_validator("cnp", mode="before")
    @classmethod
    def validate_patient_cnp(cls, value):
        return validate_cnp(value)

    @field_validator("phone_number", mode="before")
    @classmethod
    def format_phone_number(cls, value):
        return normalize_phone_number(value)

    @field_validator("arrival_method", mode="before")
    @classmethod
    def validate_arrival_method(cls, value):
        normalized_value = require_non_empty(value or "self", "Arrival method").lower()
        if normalized_value not in {"ambulance", "self"}:
            raise ValueError("Arrival method must be ambulance or self.")
        return normalized_value


class PatientCreate(PatientBase):
    pass


class PatientUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    department: str | None = None
    cnp: str | None = None
    phone_number: str | None = None
    birth_date: date | None = None
    gender: str | None = None
    arrival_method: str | None = None
    address: PatientAddressUpdate | None = None

    @field_validator("first_name", "last_name", "gender", mode="before")
    @classmethod
    def validate_optional_text(cls, value, info):
        if value is None:
            return value
        return require_non_empty(value, info.field_name.replace("_", " ").title())

    @field_validator("department", mode="before")
    @classmethod
    def validate_optional_department(cls, value):
        if value is None:
            return value
        return validate_department(value)

    @field_validator("cnp", mode="before")
    @classmethod
    def validate_optional_cnp(cls, value):
        if value is None:
            return value
        return validate_cnp(value)

    @field_validator("phone_number", mode="before")
    @classmethod
    def format_phone_number(cls, value):
        return normalize_phone_number(value)

    @field_validator("arrival_method", mode="before")
    @classmethod
    def validate_optional_arrival_method(cls, value):
        if value is None:
            return value
        normalized_value = require_non_empty(value, "Arrival method").lower()
        if normalized_value not in {"ambulance", "self"}:
            raise ValueError("Arrival method must be ambulance or self.")
        return normalized_value


class PatientRead(PatientBase):
    id: int
    phone_number: str | None = None
    address: PatientAddressRead | None = None
    is_discharged: bool = False
    discharge_reason: str | None = None
    discharge_date: datetime | None = None

    model_config = {"from_attributes": True}


class PatientDepartmentUpdate(BaseModel):
    department: str
    reason: str = Field(min_length=1, max_length=300)

    @field_validator("department", mode="before")
    @classmethod
    def validate_department_name(cls, value):
        return validate_department(value)

    @field_validator("reason", mode="before")
    @classmethod
    def validate_reason(cls, value):
        return require_non_empty(value, "Reason")


class PatientDischargeUpdate(BaseModel):
    reason: str = Field(min_length=1, max_length=500)

    @field_validator("reason", mode="before")
    @classmethod
    def validate_reason(cls, value):
        return require_non_empty(value, "Reason")
