from app.db.base import Base
from app.db.session import engine
from app.models import Patient, Doctor, Encounter, Vital, Alert


def init_db():
    Base.metadata.create_all(bind=engine)