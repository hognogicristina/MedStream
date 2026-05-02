from datetime import datetime

from pydantic import BaseModel


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
    id: int
    alert_type: str
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
