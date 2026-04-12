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
