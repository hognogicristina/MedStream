from pydantic import BaseModel


class PatientStatsRead(BaseModel):
    patient_id: int
    avg_heart_rate: float
    avg_temperature: float
    avg_oxygen: float
    alerts_count: int

    model_config = {"from_attributes": True}