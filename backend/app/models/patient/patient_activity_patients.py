from sqlalchemy import ForeignKey, Table, Column, Integer

from app.db.base import Base

patient_activity_patients = Table(
    "patient_activity_patients",
    Base.metadata,
    Column("activity_id", ForeignKey("doctor_activities.id"), primary_key=True),
    Column("patient_id", ForeignKey("patients.id"), primary_key=True),
)
