import random
from datetime import datetime, timezone


def _rand_float(lower: float, upper: float, digits: int = 1) -> float:
    return round(random.uniform(lower, upper), digits)


def generate_vital_signs(condition: str, recorded_at: datetime | None = None) -> dict:
    recorded_at = recorded_at or datetime.now(timezone.utc)

    if condition == "cardiac":
        heart_rate = random.randint(90, 140)
        oxygen_saturation = _rand_float(94.0, 98.0)
        temperature = _rand_float(36.5, 37.6)
        blood_pressure_systolic = random.randint(135, 175)
        blood_pressure_diastolic = random.randint(85, 110)
        respiratory_rate = random.randint(18, 28)
    elif condition == "respiratory":
        heart_rate = random.randint(88, 118)
        oxygen_saturation = _rand_float(85.0, 93.0)
        temperature = _rand_float(36.8, 38.2)
        blood_pressure_systolic = random.randint(110, 145)
        blood_pressure_diastolic = random.randint(70, 90)
        respiratory_rate = random.randint(22, 34)
    elif condition == "infectious":
        heart_rate = random.randint(92, 125)
        oxygen_saturation = _rand_float(92.0, 98.0)
        temperature = _rand_float(37.5, 40.0)
        blood_pressure_systolic = random.randint(100, 140)
        blood_pressure_diastolic = random.randint(60, 88)
        respiratory_rate = random.randint(20, 30)
    else:
        heart_rate = random.randint(62, 88)
        oxygen_saturation = _rand_float(97.0, 100.0)
        temperature = _rand_float(36.4, 37.1)
        blood_pressure_systolic = random.randint(110, 124)
        blood_pressure_diastolic = random.randint(70, 82)
        respiratory_rate = random.randint(12, 18)

    if blood_pressure_diastolic >= blood_pressure_systolic:
        blood_pressure_diastolic = blood_pressure_systolic - random.randint(10, 25)

    return {
        "heart_rate": heart_rate,
        "oxygen_saturation": oxygen_saturation,
        "temperature": temperature,
        "blood_pressure_systolic": blood_pressure_systolic,
        "blood_pressure_diastolic": blood_pressure_diastolic,
        "respiratory_rate": respiratory_rate,
        "recorded_at": recorded_at,
    }
