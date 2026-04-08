import threading
import time

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.alerts import router as alerts_router
from app.api.doctors import auth_router, router as doctors_router
from app.api.patients import router as patients_router
from app.batch.status import batch_status_store, next_run_from, utc_now
from app.core.config import settings
from app.api.vitals import router as vitals_router
from app.db.init_db import init_db
from app.api.ws import router as ws_router
from app.api.stats import router as stats_router
from app.kafka.consumer import run as run_consumer
from app.kafka.topics import ensure_topics
from app.batch.patient_stats_job import run as run_batch
from app.kafka.vitals_simulator import run as run_simulator

background_threads_started = False
background_threads_lock = threading.Lock()


def run_batch_loop():
    interval_seconds = settings.batch_interval_seconds
    next_run_at = utc_now()
    batch_status_store.configure(interval_seconds, next_run_at)

    while True:
        now = utc_now()
        sleep_seconds = (next_run_at - now).total_seconds()

        if sleep_seconds > 0:
            time.sleep(sleep_seconds)

        started_at = utc_now()
        next_run_at = next_run_from(started_at, interval_seconds)
        batch_status_store.mark_started(started_at, next_run_at)

        try:
            run_batch()
            finished_at = utc_now()
            batch_status_store.mark_success(finished_at, next_run_at)
        except Exception as e:
            print("Batch error:", e)
            finished_at = utc_now()
            batch_status_store.mark_failure(finished_at, e, next_run_at)


def start_background_threads():
    global background_threads_started

    with background_threads_lock:
        if background_threads_started:
            return

        threading.Thread(target=run_consumer, daemon=True, name="medstream-consumer").start()
        threading.Thread(target=run_batch_loop, daemon=True, name="medstream-batch").start()
        threading.Thread(target=run_simulator, daemon=True, name="medstream-simulator").start()
        background_threads_started = True


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    ensure_topics()
    start_background_threads()

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
app.include_router(auth_router)
app.include_router(doctors_router)
app.include_router(vitals_router)
app.include_router(alerts_router)
app.include_router(ws_router)
app.include_router(stats_router)


@app.get("/health")
def health():
    return {"status": "ok"}
