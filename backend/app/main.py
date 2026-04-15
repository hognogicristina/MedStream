import threading
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from app.api.alerts import router as alerts_router
from app.api.doctors import auth_router, router as doctors_router
from app.api.patients import router as patients_router
from app.api.stats import router as stats_router
from app.api.vitals import router as vitals_router
from app.api.ws import router as ws_router
from app.batch.patient_stats_job import run as run_batch
from app.batch.status import batch_status_store, next_run_from, utc_now
from app.core.config import settings
from app.db.init_db import init_db
from app.kafka.consumer import run as run_consumer
from app.kafka.topics import ensure_topics
from threading import Thread
from app.simulator.run_simulator import run as run_simulator
from app.api.departments import router as departments_router

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
        except Exception as error:
            print("Batch error:", error)
            finished_at = utc_now()
            batch_status_store.mark_failure(finished_at, error, next_run_at)


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


app = FastAPI(title="MedStream", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def start_simulator():
    thread = Thread(target=run_simulator, daemon=True)
    thread.start()


def extract_error_message(detail) -> str:
    if isinstance(detail, str) and detail.strip():
        return detail

    if isinstance(detail, dict):
        message = detail.get("message")
        if isinstance(message, str) and message.strip():
            return message

    return "Unexpected error occurred"


def format_validation_error(exc: RequestValidationError) -> str:
    first_error = exc.errors()[0] if exc.errors() else {}
    location = [str(item) for item in first_error.get("loc", []) if item != "body"]
    location_label = " ".join(location).replace("_", " ").strip().capitalize()
    message = first_error.get("msg", "Unexpected error occurred")

    if message == "Field required":
        return f"{location_label or 'Field'} is required."

    return message


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "message": extract_error_message(exc.detail),
        },
    )


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "message": format_validation_error(exc),
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "message": "Unexpected error occurred",
        },
    )


app.include_router(patients_router)
app.include_router(auth_router)
app.include_router(doctors_router)
app.include_router(vitals_router)
app.include_router(alerts_router)
app.include_router(ws_router)
app.include_router(stats_router)
app.include_router(departments_router)


@app.options("/{rest_of_path:path}")
async def preflight_handler(request: Request):
    return Response(status_code=200)


@app.get("/health")
def health():
    return {
        "success": True,
        "message": "Service is healthy.",
        "data": {"status": "ok"},
    }
