import random

PROFILES = [
    {
        "name": "healthy",
        "heart_rate": (60, 90),
        "oxygen": (96, 100),
        "temperature": (36, 37),
    },
    {
        "name": "cardiac_risk",
        "heart_rate": (100, 150),
        "oxygen": (90, 96),
        "temperature": (36, 38),
    },
    {
        "name": "fever",
        "heart_rate": (80, 120),
        "oxygen": (94, 100),
        "temperature": (38, 40),
    },
    {
        "name": "critical",
        "heart_rate": (120, 160),
        "oxygen": (85, 92),
        "temperature": (39, 41),
    },
]


def pick_profile():
    return random.choice(PROFILES)


def generate_vitals(profile):
    return {
        "heart_rate": random.randint(*profile["heart_rate"]),
        "oxygen_saturation": random.randint(*profile["oxygen"]),
        "temperature": random.randint(*profile["temperature"]),
        "systolic_bp": random.randint(100, 170),
        "diastolic_bp": random.randint(60, 110),
    }
