from datetime import datetime, timedelta
from threading import Lock


class BatchStatusStore:
    def __init__(self):
        self._lock = Lock()
        self._status = {
            "interval_seconds": 30,
            "last_run_started_at": None,
            "last_successful_run_at": None,
            "last_run_finished_at": None,
            "next_run_estimate": None,
            "last_run_status": "idle",
            "last_run_error": None,
        }

    def configure(self, interval_seconds, next_run_estimate=None):
        with self._lock:
            self._status["interval_seconds"] = interval_seconds
            self._status["next_run_estimate"] = next_run_estimate

    def mark_started(self, started_at, next_run_estimate=None):
        with self._lock:
            self._status["last_run_started_at"] = started_at
            self._status["last_run_status"] = "running"
            self._status["last_run_error"] = None
            self._status["next_run_estimate"] = next_run_estimate

    def mark_success(self, finished_at, next_run_estimate):
        with self._lock:
            self._status["last_successful_run_at"] = finished_at
            self._status["last_run_finished_at"] = finished_at
            self._status["last_run_status"] = "success"
            self._status["last_run_error"] = None
            self._status["next_run_estimate"] = next_run_estimate

    def mark_failure(self, finished_at, error, next_run_estimate):
        with self._lock:
            self._status["last_run_finished_at"] = finished_at
            self._status["last_run_status"] = "failed"
            self._status["last_run_error"] = str(error)
            self._status["next_run_estimate"] = next_run_estimate

    def snapshot(self):
        with self._lock:
            return dict(self._status)


batch_status_store = BatchStatusStore()


def utc_now():
    return datetime.utcnow()


def next_run_from(reference_time, interval_seconds):
    return reference_time + timedelta(seconds=interval_seconds)
