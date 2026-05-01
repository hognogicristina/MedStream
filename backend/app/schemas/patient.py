from datetime import date, datetime

from pydantic import BaseModel


class PatientAddressBase(BaseModel):
    street: str
    number: str
    apartment: str | None = None
    city: str
    county: str
    postal_code: str


class PatientAddressCreate(PatientAddressBase):
    pass


class PatientAddressRead(BaseModel):
    street: str | None = None
    number: str | None = None
    apartment: str | None = None
    city: str | None = None
    county: str | None = None
    postal_code: str | None = None
    country: str = "Romania"

    model_config = {"from_attributes": True}


class PatientAddressUpdate(BaseModel):
    street: str | None = None
    number: str | None = None
    apartment: str | None = None
    city: str | None = None
    county: str | None = None
    postal_code: str | None = None


class PatientBase(BaseModel):
    first_name: str
    last_name: str
    department: str
    cnp: str
    phone_number: str
    birth_date: date
    gender: str
    arrival_method: str = "self"
    is_pregnant: bool = False
    address: PatientAddressCreate


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
    is_pregnant: bool | None = None
    address: PatientAddressUpdate | None = None


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
    reason: str


class PatientDischargeUpdate(BaseModel):
    type: str
    reason: str


class PatientTransferRequest(BaseModel):
    from_doctor_id: int
    to_doctor_id: int
