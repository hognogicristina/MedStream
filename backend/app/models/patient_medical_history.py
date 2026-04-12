from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PatientMedicalHistory(Base):
    __tablename__ = "patient_medical_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"))
    condition_name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    type: Mapped[str] = mapped_column(String(50))
    date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
