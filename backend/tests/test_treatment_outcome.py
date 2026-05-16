from datetime import datetime, timezone
from types import SimpleNamespace

from app.repositories.patient_repository import PatientRepository


def alert(alert_id, alert_type, severity, message, created_at):
    return SimpleNamespace(
        id=alert_id,
        alert_type=alert_type,
        severity=severity,
        message=message,
        created_at=created_at,
    )


def test_follow_up_escalation_does_not_demote_fully_stable_treatment_window():
    treatment_time = datetime(2026, 5, 16, 6, 23, tzinfo=timezone.utc)
    window_end = datetime(2026, 5, 16, 6, 24, tzinfo=timezone.utc)
    stable_vital = SimpleNamespace(
        heart_rate=74,
        oxygen_saturation=98,
        temperature=36,
    )
    empty_alert_state = {
        "heart_rate": {"latest": None, "latest_abnormal": None, "latest_normalized": None, "latest_state": "none"},
        "oxygen_saturation": {"latest": None, "latest_abnormal": None, "latest_normalized": None, "latest_state": "none"},
        "temperature": {"latest": None, "latest_abnormal": None, "latest_normalized": None, "latest_state": "none"},
    }
    next_action = {
        "medication": SimpleNamespace(
            notes="Treatment not working, patient got worse. Dose/frequency adjusted after persistent alerts.",
            last_updated_note=None,
        )
    }

    outcome, reason, evidence = PatientRepository._derive_treatment_outcome_from_window(
        action_index=0,
        total_actions=2,
        pre_treatment_vital=None,
        evaluated_vital=stable_vital,
        full_alert_state=empty_alert_state,
        post_treatment_alert_state=empty_alert_state,
        sequence_alerts=[],
        treatment_timestamp=treatment_time,
        window_end=window_end,
        unresolved_after_treatment_vitals=[],
        next_action=next_action,
    )

    assert outcome == "Effective"
    assert "latest vital values are stable" in reason
    assert evidence["next_treatment_escalation_detected"] is True
    assert evidence["unstable_signals"] == []


def test_later_bad_alert_does_not_erase_historical_effective_recovery():
    treatment_time = datetime(2026, 5, 16, 6, 20, tzinfo=timezone.utc)
    window_end = datetime(2026, 5, 16, 6, 35, tzinfo=timezone.utc)
    latest_vital = SimpleNamespace(
        heart_rate=130,
        oxygen_saturation=85,
        temperature=39,
    )
    alerts = [
        alert(1, "heart_rate_critical", "critical", "Heart rate critical: 145 bpm", datetime(2026, 5, 16, 6, 21, tzinfo=timezone.utc)),
        alert(2, "oxygen_critical", "critical", "Oxygen critical: 86%", datetime(2026, 5, 16, 6, 21, tzinfo=timezone.utc)),
        alert(3, "temperature_high", "high", "Temperature high: 39°C", datetime(2026, 5, 16, 6, 21, tzinfo=timezone.utc)),
        alert(4, "temperature_normalized", "normal", "Temperature normalized: 37°C", datetime(2026, 5, 16, 6, 22, tzinfo=timezone.utc)),
        alert(5, "heart_rate_normalized", "normal", "Heart rate normalized: 78 bpm", datetime(2026, 5, 16, 6, 23, tzinfo=timezone.utc)),
        alert(6, "oxygen_normalized", "normal", "Oxygen normalized: 97%", datetime(2026, 5, 16, 6, 23, tzinfo=timezone.utc)),
        alert(7, "temperature_high", "high", "Temperature high: 39°C", datetime(2026, 5, 16, 6, 28, tzinfo=timezone.utc)),
    ]
    full_alert_state = PatientRepository._get_latest_vital_specific_alert_state(
        sequence_alerts=alerts,
        window_end=window_end,
    )
    next_action = {
        "medication": SimpleNamespace(
            notes="Treatment not working, patient got worse. Dose/frequency adjusted after persistent alerts.",
            last_updated_note=None,
        )
    }

    outcome, reason, evidence = PatientRepository._derive_treatment_outcome_from_window(
        action_index=0,
        total_actions=2,
        pre_treatment_vital=None,
        evaluated_vital=latest_vital,
        full_alert_state=full_alert_state,
        post_treatment_alert_state=full_alert_state,
        sequence_alerts=alerts,
        treatment_timestamp=treatment_time,
        window_end=window_end,
        unresolved_after_treatment_vitals=["temperature"],
        next_action=next_action,
    )

    assert outcome == "Effective"
    assert "before later alerts appeared" in reason
    assert evidence["unresolved_vitals"] == []
    assert evidence["latest_alerts"]["temperature"]["type"] == "temperature_normalized"
