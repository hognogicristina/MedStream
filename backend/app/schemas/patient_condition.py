from datetime import datetime

from pydantic import BaseModel


class PatientConditionRead(BaseModel):
    id: int
    name: str
    description: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PatientConditionAssignmentCreate(BaseModel):
    condition_id: int


class PatientConditionAssignmentRead(BaseModel):
    id: int
    patient_id: int
    condition_id: int

    status: str
    notes: str | None = None
    diagnosed_at: datetime

    model_config = {"from_attributes": True}


class PatientConditionWithDetails(BaseModel):
    id: int
    name: str
    description: str | None = None

    status: str
    notes: str | None = None
    diagnosed_at: datetime

    model_config = {"from_attributes": True}


class ConditionUpdate(BaseModel):
    status: str | None = None
    notes: str | None = None
