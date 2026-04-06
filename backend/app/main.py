from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.alerts import router as alerts_router
from app.api.doctors import router as doctors_router
from app.api.patients import router as patients_router
from app.api.vitals import router as vitals_router
from app.db.init_db import init_db
from app.api.ws import router as ws_router

from app.kafka.consumer import run as run_consumer
import threading


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()

    thread = threading.Thread(target=run_consumer, daemon=True)
    thread.start()

    yield


app = FastAPI(title="MedStream API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(patients_router)
app.include_router(doctors_router)
app.include_router(vitals_router)
app.include_router(alerts_router)
app.include_router(ws_router)


@app.get("/health")
def health():
    return {"status": "ok"}
