from pydantic import BaseModel, EmailStr


class DoctorCreate(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    password: str
    specialization: str
    license_number: str


class DoctorRead(BaseModel):
    id: int
    first_name: str
    last_name: str
    email: EmailStr
    specialization: str
    license_number: str

    model_config = {"from_attributes": True}


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    token: str

    model_config = {"from_attributes": True}
