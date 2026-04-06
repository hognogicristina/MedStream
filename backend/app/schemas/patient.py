from datetime import date
from typing import Literal
from pydantic import BaseModel


class PatientCreate(BaseModel):
    first_name: str
    last_name: str
    department: Literal["ER", "ICU", "Ward"]
    cnp: str
    birth_date: date
    gender: str


class PatientRead(PatientCreate):
    id: int

    model_config = {"from_attributes": True}


class PatientDepartmentUpdate(BaseModel):
    department: Literal["ER", "ICU", "Ward"]
