from datetime import date
from pydantic import BaseModel


class PatientCreate(BaseModel):
    first_name: str
    last_name: str
    cnp: str
    birth_date: date
    gender: str


class PatientRead(PatientCreate):
    id: int

    model_config = {"from_attributes": True}