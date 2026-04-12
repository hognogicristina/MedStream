from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PatientMedicalHistory(Base):
    __tablename__ = "patient_medical_history"

