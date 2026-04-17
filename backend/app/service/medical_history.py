from pathlib import Path
import csv

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "helpers"


def load_csv_column(filename, index):
    values = []
    with open(DATA_DIR / filename, encoding="utf-8") as f:
        reader = csv.reader(f)
        next(reader, None)
        for row in reader:
            if len(row) > index:
                values.append(row[index].strip())
    return list(set(values))


def load_drugs():
    rows = []
    with open(DATA_DIR / "drugs.csv", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append({
                "medication": row["drug_name"].strip(),
                "condition": row["medical_condition"].strip(),
                "pregnancy_category": row["pregnancy_category"].strip()
            })
    return rows


def load_conditions():
    values = set()

    with open(DATA_DIR / "drugs.csv", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            condition = (row.get("medical_condition") or "").strip()
            if condition:
                values.add(condition)

    return sorted(values)


def load_departments():
    values = set()

    with open(DATA_DIR / "departments.csv") as f:
        reader = csv.DictReader(f)
        for row in reader:
            values.add(row["Department"].strip())

    return list(values)


def load_counties():
    values = []
    with open(DATA_DIR / "counties.csv", encoding="cp1252") as f:
        reader = csv.DictReader(f)
        for row in reader:
            values.append(row["name"].strip())
    return values


COUNTIES = load_counties()
DEPARTMENTS = load_departments()
DIAGNOSIS = load_csv_column("diagnosis.csv", 1)
ALLERGIES = load_csv_column("allergies.csv", 4)
DRUGS = load_drugs()
CONDITIONS = load_conditions()
ACTIVITY_TYPES = ["Consultation", "Surgery", "Procedure", "Transfer", "Lab test", "Imaging"]
DOSAGES = ["250mg", "500mg", "1g", "5ml", "10ml"]
FREQUENCIES = ["once daily", "twice daily", "every 8 hours", "every 12 hours", "as needed"]
STATUS = ["active", "improving", "stable", "worsening", "critical", "resolved", "chronic"]
DISCHARGE = ["Recovered", "Transferred", "Stable condition"]
