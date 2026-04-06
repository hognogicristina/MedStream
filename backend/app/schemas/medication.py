from datetime import datetime

from pydantic import BaseModel


class MedicationAdministrationCreate(BaseModel):
    medication_name: str
    dosage: str


class MedicationAdministrationRead(BaseModel):
    id: int
    patient_id: int
    medication_name: str
    dosage: str
    timestamp: datetime

    model_config = {"from_attributes": True}
