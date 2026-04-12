from datetime import date

from sqlalchemy import DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

class PatientMedication(Base):
    __tablename__ = "patient_medications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"))
    doctor_id: Mapped[int] = mapped_column(ForeignKey("doctors.id"))

    name: Mapped[str] = mapped_column(String(255))
    dosage: Mapped[str] = mapped_column(String(100))
    frequency: Mapped[str] = mapped_column(String(100))
    last_updated_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)