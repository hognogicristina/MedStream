from datetime import datetime

from pydantic import BaseModel
from typing import Literal


class PatientSearchResultRead(BaseModel):
    id: int
    cnp: str
    full_name: str


class TreatmentMedicationReasoningRead(BaseModel):
    alerts: list[str]
    diagnoses: list[str]
    conditions: list[str]


class TreatmentMedicationRead(BaseModel):
    id: int
    name: str
    dosage: str
    frequency: str
    prescribed_at: datetime
    updated_at: datetime | None = None
    notes: str | None = None
    last_updated_note: str | None = None
    modified_by: str | None = None
    reasoning: TreatmentMedicationReasoningRead


class TreatmentDiagnosisRead(BaseModel):
    id: int
    diagnosis: str
    status: str
    notes: str | None = None
    created_at: datetime


class TreatmentAlertRead(BaseModel):
    class StatusVitalsRead(BaseModel):
        heartRate: float | None = None
        oxygen: float | None = None
        temperature: float | None = None

    id: int
    alert_type: str
    type: Literal["heart_rate", "oxygen_saturation", "temperature", "status"] | None = None
    value: float | None = None
    unit: str | None = None
    vitals: StatusVitalsRead | None = None
    message: str
    severity: str
    created_at: datetime


class TreatmentTimelineEventRead(BaseModel):
    timestamp: datetime
    event_type: str
    title: str
    details: str | None = None
    related_medication_id: int | None = None


class PatientTreatmentAnalysisRead(BaseModel):
    medications: list[TreatmentMedicationRead]
    diagnoses: list[TreatmentDiagnosisRead]
    alerts: list[TreatmentAlertRead]
    timeline: list[TreatmentTimelineEventRead]
