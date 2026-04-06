from pydantic import BaseModel


class DoctorCreate(BaseModel):
    first_name: str
    last_name: str
    specialization: str
    license_number: str


class DoctorRead(DoctorCreate):
    id: int

    model_config = {"from_attributes": True}