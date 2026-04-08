import random

PROFILES = [
    {
        "name": "healthy",
        "targets": {
            "heart_rate": (64, 82),
            "oxygen_saturation": (97, 100),
            "temperature": (36, 37),
            "systolic_bp": (110, 124),
            "diastolic_bp": (68, 80),
        },
        "limits": {
            "heart_rate": (58, 92),
            "oxygen_saturation": (95, 100),
            "temperature": (36, 37),
            "systolic_bp": (102, 132),
            "diastolic_bp": (62, 84),
        },
        "step": {
            "heart_rate": 3,
            "oxygen_saturation": 1,
            "temperature": 0,
            "systolic_bp": 4,
            "diastolic_bp": 3,
        },
    },
    {
        "name": "cardiac risk",
        "targets": {
            "heart_rate": (108, 132),
            "oxygen_saturation": (91, 95),
            "temperature": (36, 38),
            "systolic_bp": (142, 174),
            "diastolic_bp": (86, 106),
        },
        "limits": {
            "heart_rate": (92, 145),
            "oxygen_saturation": (89, 97),
            "temperature": (36, 38),
            "systolic_bp": (128, 186),
            "diastolic_bp": (76, 112),
        },
        "step": {
            "heart_rate": 5,
            "oxygen_saturation": 1,
            "temperature": 0,
            "systolic_bp": 6,
            "diastolic_bp": 4,
        },
    },
    {
        "name": "infection/fever",
        "targets": {
            "heart_rate": (96, 118),
            "oxygen_saturation": (93, 97),
            "temperature": (38, 40),
            "systolic_bp": (108, 132),
            "diastolic_bp": (66, 84),
        },
        "limits": {
            "heart_rate": (84, 128),
            "oxygen_saturation": (91, 99),
            "temperature": (38, 40),
            "systolic_bp": (98, 140),
            "diastolic_bp": (60, 90),
        },
        "step": {
            "heart_rate": 4,
            "oxygen_saturation": 1,
            "temperature": 1,
            "systolic_bp": 5,
            "diastolic_bp": 3,
        },
    },
    {
        "name": "respiratory distress",
        "targets": {
            "heart_rate": (112, 136),
            "oxygen_saturation": (85, 91),
            "temperature": (37, 39),
            "systolic_bp": (118, 148),
            "diastolic_bp": (72, 94),
        },
        "limits": {
            "heart_rate": (102, 148),
            "oxygen_saturation": (82, 93),
            "temperature": (37, 39),
            "systolic_bp": (108, 158),
            "diastolic_bp": (66, 98),
        },
        "step": {
            "heart_rate": 5,
            "oxygen_saturation": 1,
            "temperature": 1,
            "systolic_bp": 5,
            "diastolic_bp": 3,
        },
    },
    {
        "name": "recovering patient",
        "targets": {
            "heart_rate": (78, 98),
            "oxygen_saturation": (94, 98),
            "temperature": (36, 37),
            "systolic_bp": (114, 136),
            "diastolic_bp": (70, 88),
        },
        "limits": {
            "heart_rate": (70, 108),
            "oxygen_saturation": (92, 99),
            "temperature": (36, 38),
            "systolic_bp": (106, 144),
            "diastolic_bp": (66, 92),
        },
        "step": {
            "heart_rate": 4,
            "oxygen_saturation": 1,
            "temperature": 0,
            "systolic_bp": 4,
            "diastolic_bp": 3,
        },
    },
]

DEPARTMENT_PROFILE_MAP = {
    "ER": ["cardiac risk", "infection/fever", "respiratory distress", "healthy"],
    "ICU": ["respiratory distress", "recovering patient", "cardiac risk", "infection/fever"],
    "Cardiology": ["cardiac risk", "recovering patient", "healthy"],
    "Internal Medicine": ["infection/fever", "recovering patient", "healthy", "cardiac risk"],
    "Neurology": ["recovering patient", "healthy", "infection/fever", "cardiac risk"],
    "Ward": ["recovering patient", "healthy", "infection/fever", "cardiac risk"],
}

METRICS = ("heart_rate", "oxygen_saturation", "temperature", "systolic_bp", "diastolic_bp")
PROFILE_BY_NAME = {profile["name"]: profile for profile in PROFILES}


def clamp(value, bounds):
    return max(bounds[0], min(bounds[1], value))


def choose_with_seed(seed, bounds):
    rng = random.Random(seed)
    return rng.randint(bounds[0], bounds[1])


def pick_profile(patient_id=None, department=None):
    allowed_names = DEPARTMENT_PROFILE_MAP.get(department)
    if not allowed_names:
        allowed_names = [profile["name"] for profile in PROFILES]

    if patient_id is None:
        profile_name = random.choice(allowed_names)
    else:
        profile_name = random.Random(f"profile:{patient_id}:{department}").choice(allowed_names)

    return PROFILE_BY_NAME[profile_name]


def build_patient_state(patient):
    profile = pick_profile(patient_id=patient.id, department=patient.department)
    current = {}
    target = {}

    for metric in METRICS:
        target_bounds = profile["targets"][metric]
        limits = profile["limits"][metric]
        current[metric] = choose_with_seed(f"current:{patient.id}:{metric}", target_bounds)
        target[metric] = clamp(
            choose_with_seed(f"target:{patient.id}:{metric}", target_bounds),
            limits,
        )

    state = {
        "profile": profile,
        "department": patient.department,
        "current": current,
        "target": target,
        "cycles_until_target_refresh": random.Random(f"refresh:{patient.id}").randint(4, 9),
    }
    return stabilize_state(state)


def choose_new_target(state, patient_id):
    profile = state["profile"]

    for metric in METRICS:
        state["target"][metric] = choose_with_seed(
            f"retarget:{patient_id}:{metric}:{state['cycles_until_target_refresh']}",
            profile["targets"][metric],
        )

    state["cycles_until_target_refresh"] = random.Random(
        f"next-refresh:{patient_id}:{state['target']['heart_rate']}:{state['target']['oxygen_saturation']}"
    ).randint(4, 9)


def move_toward(current, target, max_step, bounds, rng):
    delta = target - current
    if delta > 0:
        current += min(delta, rng.randint(0, max_step))
    elif delta < 0:
        current -= min(-delta, rng.randint(0, max_step))

    if max_step > 1:
        current += rng.randint(-1, 1)

    return clamp(current, bounds)


def stabilize_state(state):
    profile_name = state["profile"]["name"]
    current = state["current"]

    if profile_name == "healthy":
        current["heart_rate"] = clamp(current["heart_rate"], (60, 88))
        current["oxygen_saturation"] = clamp(current["oxygen_saturation"], (96, 100))
        current["temperature"] = clamp(current["temperature"], (36, 37))

    if profile_name == "cardiac risk":
        current["heart_rate"] = max(current["heart_rate"], 98)
        current["systolic_bp"] = max(current["systolic_bp"], 138)
        current["diastolic_bp"] = max(current["diastolic_bp"], 84)

    if profile_name == "infection/fever":
        current["temperature"] = max(current["temperature"], 38)
        current["heart_rate"] = max(current["heart_rate"], 92 if current["temperature"] == 38 else 100)

    if profile_name == "respiratory distress":
        current["oxygen_saturation"] = min(current["oxygen_saturation"], 91)
        current["heart_rate"] = max(current["heart_rate"], 110 if current["oxygen_saturation"] <= 89 else 104)

    if profile_name == "recovering patient":
        current["oxygen_saturation"] = max(current["oxygen_saturation"], 94)
        current["temperature"] = clamp(current["temperature"], (36, 37))

    current["diastolic_bp"] = min(current["diastolic_bp"], current["systolic_bp"] - 35)
    return state


def generate_vitals(state, patient_id):
    if state["cycles_until_target_refresh"] <= 0:
        choose_new_target(state, patient_id)
    else:
        state["cycles_until_target_refresh"] -= 1

    rng = random.Random(f"cycle:{patient_id}:{state['cycles_until_target_refresh']}:{state['current']['heart_rate']}")
    profile = state["profile"]

    for metric in METRICS:
        state["current"][metric] = move_toward(
            state["current"][metric],
            state["target"][metric],
            profile["step"][metric],
            profile["limits"][metric],
            rng,
        )

    stabilize_state(state)

    return {
        "heart_rate": state["current"]["heart_rate"],
        "oxygen_saturation": state["current"]["oxygen_saturation"],
        "temperature": state["current"]["temperature"],
        "systolic_bp": state["current"]["systolic_bp"],
        "diastolic_bp": state["current"]["diastolic_bp"],
    }
