from app.db.base import Base
from app.db.session import engine
from app.models import Alert, Doctor, Encounter, MedicationAdministration, Patient, Vital


def init_db():
    Base.metadata.create_all(bind=engine)
