import secrets

from fastapi import APIRouter, Header, HTTPException
from passlib.context import CryptContext
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.doctor import Doctor
from app.schemas.doctor import DoctorCreate, DoctorRead, LoginRequest, LoginResponse

router = APIRouter(prefix="/doctors", tags=["doctors"])
auth_router = APIRouter(tags=["auth"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


@router.get("", response_model=list[DoctorRead])
def list_doctors():
    with SessionLocal() as db:
        return db.execute(select(Doctor)).scalars().all()


def get_current_doctor(authorization: str | None):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Invalid authorization header")

    parts = token.split("-", 2)
    if len(parts) < 3 or parts[0] != "doctor" or not parts[1].isdigit():
        raise HTTPException(status_code=401, detail="Invalid token")

    doctor_id = int(parts[1])

    with SessionLocal() as db:
        doctor = db.get(Doctor, doctor_id)

        if doctor is None:
            raise HTTPException(status_code=404, detail="Doctor not found")

        return doctor


@router.get("/me", response_model=DoctorRead)
def read_current_doctor(authorization: str | None = Header(default=None)):
    return get_current_doctor(authorization)


def register_doctor(payload: DoctorCreate):
    with SessionLocal() as db:
        existing_doctor = db.execute(select(Doctor).where(Doctor.email == payload.email)).scalar_one_or_none()

        if existing_doctor:
            raise HTTPException(status_code=400, detail="Email already registered")

        doctor = Doctor(
            first_name=payload.first_name,
            last_name=payload.last_name,
            email=payload.email,
            password_hash=pwd_context.hash(payload.password),
            specialization=payload.specialization,
            license_number=payload.license_number,
        )
        db.add(doctor)
        db.commit()
        db.refresh(doctor)
        return doctor


@router.post("", response_model=DoctorRead)
def create_doctor(payload: DoctorCreate):
    return register_doctor(payload)


def login_doctor(payload: LoginRequest):
    with SessionLocal() as db:
        doctor = db.execute(select(Doctor).where(Doctor.email == payload.email)).scalar_one_or_none()

        if not doctor or not pwd_context.verify(payload.password, doctor.password_hash):
            raise HTTPException(status_code=401, detail="Invalid credentials")

        return LoginResponse(token=f"doctor-{doctor.id}-{secrets.token_hex(16)}")


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest):
    return login_doctor(payload)


@auth_router.post("/login", response_model=LoginResponse)
def root_login(payload: LoginRequest):
    return login_doctor(payload)


@auth_router.post("/register", response_model=DoctorRead)
def register(payload: DoctorCreate):
    return register_doctor(payload)
