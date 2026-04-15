import csv
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
CSV_PATH = BASE_DIR / "simulator" / "departments.csv"

def load_departments():
    with open(CSV_PATH, newline="") as f:
        reader = csv.DictReader(f)
        return sorted({row["Department"] for row in reader if row.get("Department")})