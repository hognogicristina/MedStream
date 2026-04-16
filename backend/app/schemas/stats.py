from datetime import datetime
from pydantic import BaseModel


class PatientStatsRead(BaseModel):
    patient_id: int
    avg_heart_rate: float
    avg_temperature: float
    avg_oxygen: float
    alerts_count: int
    computed_at: datetime
    model_config = {"from_attributes": True}


class BatchJobStatusRead(BaseModel):
    interval_seconds: int
    last_run_started_at: datetime | None
    last_successful_run_at: datetime | None
    last_run_finished_at: datetime | None
    next_run_estimate: datetime | None
    last_run_status: str
    last_run_error: str | None
