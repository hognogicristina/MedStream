from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PatientConditionAssignment(Base):
    __tablename__ = "patient_condition_assignments"
    __table_args__ = (
        UniqueConstraint("patient_id", "condition_id", name="uq_patient_condition_assignment"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"))
    condition_id: Mapped[int] = mapped_column(ForeignKey("patient_conditions.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
