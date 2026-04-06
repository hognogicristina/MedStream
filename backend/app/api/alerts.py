from fastapi import APIRouter
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.alert import Alert
from app.schemas.alert import AlertRead

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=list[AlertRead])
def list_alerts():
    with SessionLocal() as db:
        return db.execute(select(Alert).order_by(Alert.created_at.desc())).scalars().all()