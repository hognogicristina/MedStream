from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DoctorActivity(Base):
    __tablename__ = "doctor_activities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("doctors.id"))
    type: Mapped[str] = mapped_column(String(30))
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
