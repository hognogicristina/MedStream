from __future__ import annotations

import random


def generate_vitals() -> dict:
    return {
        "heart_rate": random.randint(70, 140),
        "oxygen_saturation": random.randint(85, 100),
        "temperature": random.randint(36, 39),
        "systolic_bp": random.randint(110, 160),
        "diastolic_bp": random.randint(70, 100),
    }
