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
    alerts_count: Mapped[int] = mapped_column(Integer)
    patients_count: Mapped[int] = mapped_column(Integer)
