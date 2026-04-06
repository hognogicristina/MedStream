from sqlalchemy import Date, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    cnp: Mapped[str] = mapped_column(String(13), unique=True)
    birth_date: Mapped[Date] = mapped_column(Date)
    gender: Mapped[str] = mapped_column(String(20))