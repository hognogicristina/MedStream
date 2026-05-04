from datetime import datetime

from sqlalchemy import DateTime, Float, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.utils.datetime import now_utc


class BatchAnalytics(Base):
    __tablename__ = "batch_analytics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=now_utc)
    avg_heart_rate: Mapped[float] = mapped_column(Float)
    avg_oxygen: Mapped[float] = mapped_column(Float)
    avg_temperature: Mapped[float] = mapped_column(Float)
    avg_systolic_bp: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_diastolic_bp: Mapped[float | None] = mapped_column(Float, nullable=True)
    alerts_count: Mapped[int] = mapped_column(Integer)
    alerts_critical_count: Mapped[int] = mapped_column(Integer, default=0)
    alerts_high_count: Mapped[int] = mapped_column(Integer, default=0)
    alerts_stable_count: Mapped[int] = mapped_column(Integer, default=0)
    patients_count: Mapped[int] = mapped_column(Integer)
