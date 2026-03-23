import os
from datetime import datetime, timezone
from typing import Any

import psycopg2
from psycopg2.extensions import connection

from app.streaming.rules import (
    check_combined_conditions,
    check_heart_rate,
    check_oxygen,
    check_temperature,
)


class AlertEngine:
    def __init__(self) -> None:
        self._db_config = {
            "host": os.getenv("POSTGRES_HOST", "localhost"),
            "port": int(os.getenv("POSTGRES_PORT", "5432")),
            "dbname": os.getenv("POSTGRES_DB", "medstream"),
            "user": os.getenv("POSTGRES_USER", "medstream"),
            "password": os.getenv("POSTGRES_PASSWORD", "medstream"),
        }

    def process_event(self, event: dict[str, Any]) -> list[dict[str, Any]]:
        patient_id = event.get("patient_id")
        print(f"Processing event for patient_id={patient_id}")

        rule_results = [
            check_heart_rate(event),
            check_oxygen(event),
            check_temperature(event),
            check_combined_conditions(event),
        ]

        alerts = [alert for alert in rule_results if alert is not None]

        if not alerts:
            print(f"No alerts triggered for patient_id={patient_id}")
            return []

        for alert in alerts:
            self.insert_alert(
                patient_id=patient_id,
                alert_type=alert["alert_type"],
                value=alert["value"],
                severity=alert["severity"],
            )

        return alerts

    def _get_connection(self) -> connection:
        return psycopg2.connect(**self._db_config)

    def insert_alert(
        self,
        patient_id: int,
        alert_type: str,
        value: float | int,
        severity: str,
    ) -> None:
        insert_query = """
            INSERT INTO alerts (patient_id, alert_type, value, severity, created_at)
            VALUES (%s, %s, %s, %s, %s)
        """
        created_at = datetime.now(timezone.utc)

        try:
            with self._get_connection() as conn:
                with conn.cursor() as cursor:
                    cursor.execute(
                        insert_query,
                        (patient_id, alert_type, value, severity, created_at),
                    )
            print(
                "Saved alert to database:",
                {
                    "patient_id": patient_id,
                    "alert_type": alert_type,
                    "severity": severity,
                    "value": value,
                },
            )
        except psycopg2.Error as exc:
            print(f"Failed to insert alert for patient_id={patient_id}: {exc}")
