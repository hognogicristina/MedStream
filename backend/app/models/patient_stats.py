from datetime import datetime

from sqlalchemy import DateTime, Float, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PatientStats(Base):
    __tablename__ = "patient_stats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[int] = mapped_column(Integer)

    avg_heart_rate: Mapped[float] = mapped_column(Float)
    avg_temperature: Mapped[float] = mapped_column(Float)
    avg_oxygen: Mapped[float] = mapped_column(Float)

    alerts_count: Mapped[int] = mapped_column(Integer)

    computed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
