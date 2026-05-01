from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class BatchTreatmentAnalytics(Base):
    __tablename__ = "batch_treatment_analytics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    batch_analytics_id: Mapped[int] = mapped_column(ForeignKey("batch_analytics.id"), index=True)
    efficiency_type: Mapped[str] = mapped_column(String(20), index=True)
    treatment_name: Mapped[str] = mapped_column(String(255))
    count: Mapped[int] = mapped_column(Integer)
