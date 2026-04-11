from sqlalchemy import Date, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.doctor_patient import doctor_patients


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    department: Mapped[str] = mapped_column(String(50))
    cnp: Mapped[str] = mapped_column(String(13), unique=True)
    phone_number: Mapped[str | None] = mapped_column(String(50), unique=True, nullable=True)
    birth_date: Mapped[Date] = mapped_column(Date)
    gender: Mapped[str] = mapped_column(String(20))
    doctors: Mapped[list["Doctor"]] = relationship("Doctor", secondary=doctor_patients, back_populates="patients")
