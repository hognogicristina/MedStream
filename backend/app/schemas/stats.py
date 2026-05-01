from datetime import datetime
from pydantic import BaseModel, Field
from app.schemas.alert import AlertRead


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
    cron_expression: str | None = None
    last_run_started_at: datetime | None
    last_successful_run_at: datetime | None
    last_run_finished_at: datetime | None
    next_run_estimate: datetime | None
    next_run_in_seconds: int | None = None
    last_run_status: str
    last_run_error: str | None
    last_run_duration_ms: float | None
    stage: str | None = None


class BatchProgressRead(BaseModel):
    is_running: bool
    progress: int
    stage: str
    last_run: datetime | None
    next_run_in_seconds: int | None = None


class BatchScheduleUpdate(BaseModel):
    type: str
    value: int | None = Field(default=None, ge=1, le=10080)
    time: str | None = None
    days: list[str] | None = None
    cron_expression: str | None = Field(default=None, min_length=9, max_length=100)


class BatchScheduleRead(BaseModel):
    type: str
    value: int | None = None
    time: str | None = None
    days: list[str] = Field(default_factory=list)
    cron_expression: str | None = None
    interval_seconds: int


class ComparisonMetricsRead(BaseModel):
    avg_heart_rate: float
    avg_oxygen: float
    avg_temperature: float
    avg_systolic_bp: float | None = None
    avg_diastolic_bp: float | None = None
    alerts: int
    patients_count: int | None = None
    timestamp: datetime | None = None
    execution_time_ms: float


class MetricsComparisonRead(BaseModel):
    streaming: ComparisonMetricsRead
    batch: ComparisonMetricsRead


class PatientsPerDepartmentRead(BaseModel):
    department: str
    patients: int


class TopDiagnosisRead(BaseModel):
    name: str
    patients: int


class PaginatedPatientsPerDepartmentRead(BaseModel):
    items: list[PatientsPerDepartmentRead]
    total: int
    page: int
    page_size: int


class PaginatedTopDiagnosisRead(BaseModel):
    items: list[TopDiagnosisRead]
    total: int
    page: int
    page_size: int


class TreatmentEfficiencyRead(BaseModel):
    name: str
    count: int


class TreatmentEffectivenessRead(BaseModel):
    effective: int
    ineffective: int


class BatchInsightsRead(BaseModel):
    patients_per_department: PaginatedPatientsPerDepartmentRead
    top_diagnosis: PaginatedTopDiagnosisRead
    medication_distribution: list[TreatmentEfficiencyRead]
    treatment_effectiveness: TreatmentEffectivenessRead


class PaginatedStreamingAlertsRead(BaseModel):
    items: list[AlertRead]
    total: int
    page: int
    page_size: int
