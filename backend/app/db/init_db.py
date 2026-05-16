import logging
from time import sleep

from sqlalchemy import inspect, text
from sqlalchemy.exc import OperationalError

from app.db.base import Base
from app.db.session import engine

logger = logging.getLogger(__name__)

DB_STARTUP_MAX_ATTEMPTS = 12
DB_STARTUP_RETRY_SECONDS = 5


def init_db(
    max_attempts: int = DB_STARTUP_MAX_ATTEMPTS,
    retry_seconds: int = DB_STARTUP_RETRY_SECONDS,
):
    for attempt in range(1, max_attempts + 1):
        try:
            Base.metadata.create_all(bind=engine)
            _ensure_updated_at_columns()
            return
        except OperationalError:
            if attempt == max_attempts:
                raise

            logger.warning(
                "Database is not ready yet. Retrying startup initialization in %s seconds (%s/%s).",
                retry_seconds,
                attempt,
                max_attempts,
            )
            sleep(retry_seconds)


def _ensure_updated_at_columns():
    inspector = inspect(engine)
    table_column_specs = {
        "patient_allergies": {"updated_at": "TIMESTAMP"},
        "patient_condition_assignments": {"updated_at": "TIMESTAMP"},
        "batch_analytics": {
            "alerts_critical_count": "INTEGER DEFAULT 0",
            "alerts_high_count": "INTEGER DEFAULT 0",
            "alerts_stable_count": "INTEGER DEFAULT 0",
            "total_events_count": "INTEGER DEFAULT 0",
            "events_per_second": "DOUBLE PRECISION DEFAULT 0",
            "alert_rate": "DOUBLE PRECISION DEFAULT 0",
            "batch_latency_avg_seconds": "DOUBLE PRECISION DEFAULT 0",
            "patients_per_department_snapshot": "JSONB DEFAULT '[]'::jsonb",
            "top_diagnosis_snapshot": "JSONB DEFAULT '[]'::jsonb",
            "treatment_effectiveness_snapshot": "JSONB DEFAULT '{}'::jsonb",
            "medication_effectiveness_snapshot": "JSONB DEFAULT '[]'::jsonb",
        },
        "patient_stats": {
            "treatment_outcomes": "VARCHAR(100) DEFAULT ''",
        },
    }

    with engine.begin() as connection:
        for table_name, required_columns in table_column_specs.items():
            existing_columns = {column["name"] for column in inspector.get_columns(table_name)}
            for column_name, column_type in required_columns.items():
                if column_name in existing_columns:
                    continue
                connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"))
                if column_name == "updated_at":
                    connection.execute(text(f"UPDATE {table_name} SET {column_name} = created_at WHERE {column_name} IS NULL"))
                elif column_type.startswith("JSONB DEFAULT '[]'"):
                    connection.execute(text(f"UPDATE {table_name} SET {column_name} = '[]'::jsonb WHERE {column_name} IS NULL"))
                elif column_type.startswith("JSONB DEFAULT '{}'"):
                    connection.execute(text(f"UPDATE {table_name} SET {column_name} = '{{}}'::jsonb WHERE {column_name} IS NULL"))
                elif "DEFAULT ''" in column_type:
                    connection.execute(text(f"UPDATE {table_name} SET {column_name} = '' WHERE {column_name} IS NULL"))
                else:
                    connection.execute(text(f"UPDATE {table_name} SET {column_name} = 0 WHERE {column_name} IS NULL"))

        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_patient_medications_patient_created_at ON patient_medications (patient_id, created_at)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_alerts_patient_created_at ON alerts (patient_id, created_at)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_patient_diagnosis_patient_status ON patient_diagnosis (patient_id, status)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_patient_stats_patient_id ON patient_stats (patient_id)"))
