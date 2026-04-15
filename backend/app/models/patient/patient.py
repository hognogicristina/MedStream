from datetime import datetime

from sqlalchemy import Boolean, Date, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.doctor.doctor_activity_patient import doctor_activity_patients
from app.models.patient.patient_activity_doctor import patient_activity_doctors


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
    arrival_method: Mapped[str] = mapped_column(String(20), default="self")
    is_discharged: Mapped[bool] = mapped_column(Boolean, default=False)
    is_pregnant: Mapped[bool] = mapped_column(Boolean, default=False)
    discharge_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    discharge_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    address_street: Mapped[str | None] = mapped_column(String(120), nullable=True)
    address_number: Mapped[str | None] = mapped_column(String(30), nullable=True)
    address_apartment: Mapped[str | None] = mapped_column(String(30), nullable=True)
    address_city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    address_state: Mapped[str | None] = mapped_column(String(100), nullable=True)
    address_postal_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    address_country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    doctors: Mapped[list["Doctor"]] = relationship("Doctor", secondary=doctor_activity_patients, back_populates="patients")

    activities = relationship(
        "DoctorActivity",
        secondary=patient_activity_doctors,
        back_populates="patients"
    )

    @property
    def address(self):
        return {
            "street": self.address_street,
            "number": self.address_number,
            "apartment": self.address_apartment,
            "city": self.address_city,
            "county": self.address_state,
            "postal_code": self.address_postal_code,
            "country": "Romania",
        }
