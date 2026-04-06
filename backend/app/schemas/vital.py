from datetime import datetime

from pydantic import BaseModel


class VitalCreate(BaseModel):
    patient_id: int
    heart_rate: int
    oxygen_saturation: int
    temperature: int
    systolic_bp: int
    diastolic_bp: int


class VitalRead(VitalCreate):
    id: int
    recorded_at: datetime

    model_config = {"from_attributes": True}
