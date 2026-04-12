from datetime import datetime
from pydantic import BaseModel


class PatientActivityRead(BaseModel):
    id: int
    type: str
    title: str
    description: str | None = None
    scheduled_at: datetime
    status: str

    doctor_id: int

    model_config = {"from_attributes": True}