from typing import Any


AlertResult = dict[str, Any] | None


def check_heart_rate(event: dict[str, Any]) -> AlertResult:
    heart_rate = event.get("heart_rate")
    if heart_rate is None:
        return None

    if heart_rate >= 120:
        return {
            "alert_type": "high_heart_rate",
            "severity": "critical",
            "message": f"Heart rate is critically high at {heart_rate} bpm.",
            "value": heart_rate,
        }

    if heart_rate >= 100:
        return {
            "alert_type": "high_heart_rate",
            "severity": "warning",
            "message": f"Heart rate is elevated at {heart_rate} bpm.",
            "value": heart_rate,
        }

    if heart_rate <= 45:
        return {
            "alert_type": "low_heart_rate",
            "severity": "critical",
            "message": f"Heart rate is critically low at {heart_rate} bpm.",
            "value": heart_rate,
        }

    return None


def check_oxygen(event: dict[str, Any]) -> AlertResult:
    oxygen = event.get("oxygen")
    if oxygen is None:
        return None

    if oxygen < 90:
        return {
            "alert_type": "low_oxygen",
            "severity": "critical",
            "message": f"Oxygen saturation dropped to {oxygen}%.",
            "value": oxygen,
        }

    if oxygen < 95:
        return {
            "alert_type": "low_oxygen",
            "severity": "warning",
            "message": f"Oxygen saturation is below normal at {oxygen}%.",
            "value": oxygen,
        }

    return None


def check_temperature(event: dict[str, Any]) -> AlertResult:
    temperature = event.get("temperature")
    if temperature is None:
        return None

    if temperature >= 39.0:
        return {
            "alert_type": "high_temperature",
            "severity": "critical",
            "message": f"Temperature is critically high at {temperature} C.",
            "value": temperature,
        }

    if temperature >= 37.8:
        return {
            "alert_type": "high_temperature",
            "severity": "warning",
            "message": f"Temperature is elevated at {temperature} C.",
            "value": temperature,
        }

    if temperature <= 35.0:
        return {
            "alert_type": "low_temperature",
            "severity": "critical",
            "message": f"Temperature is critically low at {temperature} C.",
            "value": temperature,
        }

    return None


def check_combined_conditions(event: dict[str, Any]) -> AlertResult:
    heart_rate = event.get("heart_rate")
    oxygen = event.get("oxygen")
    temperature = event.get("temperature")

    if heart_rate is None or oxygen is None or temperature is None:
        return None

    if heart_rate >= 110 and oxygen < 92:
        return {
            "alert_type": "cardiorespiratory_risk",
            "severity": "critical",
            "message": (
                f"Combined risk detected: heart rate {heart_rate} bpm and oxygen {oxygen}%."
            ),
            "value": heart_rate,
        }

    if oxygen < 95 and temperature >= 38.0:
        return {
            "alert_type": "infection_respiratory_risk",
            "severity": "warning",
            "message": (
                f"Combined risk detected: oxygen {oxygen}% and temperature {temperature} C."
            ),
            "value": temperature,
        }

    return None
