# MedStream

MedStream is a hospital monitoring platform that combines patient administration, real-time vitals streaming, alerting, and batch analytics in one application.

## Tech Stack

- Backend: FastAPI, SQLAlchemy, Pydantic
- Frontend: React, Vite, React Router, Tailwind CSS
- Database: PostgreSQL
- Streaming pipeline: Kafka (producer/consumer), WebSocket fan-out to UI
- Infrastructure (local): Docker Compose (PostgreSQL, pgAdmin, Zookeeper, Kafka, Kafka UI)

## Application Overview

MedStream supports the full operational loop for in-hospital monitoring:

- patient admission, transfer,z discharge, and readmission
- continuous vital signal ingestion (heart rate, oxygen saturation, temperature)
- real-time threshold-based alert generation
- doctor activity tracking (incoming/completed/canceled)
- historical clinical records (diagnoses, allergies, medications, admission history)
- periodic batch analytics for stable trends and department-level insights

## Backend

Backend entrypoint is `backend/app/main.py`.

Primary responsibilities:

- expose REST APIs for doctors, patients, vitals, alerts, metrics, batch controls
- validate and normalize payloads with Pydantic schemas
- manage persistence through SQLAlchemy models
- run background services:
  - Kafka consumer for vitals/alerts stream processing
  - simulator thread for demo data generation
  - scheduled batch job for aggregate analytics
- publish live updates to WebSocket clients

### Backend API Areas

- `/doctors` and auth routes: registration/login/profile flows
- `/patients`: patient CRUD + transfer/discharge workflows
- `/vitals`: vital records access
- `/alerts`: alert access
- `/stats`: patient stats + batch status
- `/metrics`:
  - `/streaming`
  - `/batch`
  - `/batch-insights`
  - `/comparison`
  - `/streaming-alerts`
- `/batch`:
  - run now
  - interval/cron/schedule configuration
  - progress/status endpoints
- `/ws`: live event channel

## Frontend

Frontend entrypoint is `frontend/src/main.jsx`; routes are defined in `frontend/src/App.jsx`.

Key pages include:

- dashboard and live monitoring views
- batch analytics page
- alerts page
- patient details and medical history pages
- diagnosis/admission history pages
- doctor profile and auth pages

Frontend behavior:

- fetches REST data via `frontend/src/services/api.js`
- subscribes to live updates via `frontend/src/services/ws.js`
- renders both immediate streaming metrics and scheduled batch analytics

## Database

Database schema is defined through SQLAlchemy models under `backend/app/models`.
Initialization and startup-time schema checks are handled in `backend/app/db/init_db.py`.

Core tables:

- `patients`: demographics, department, arrival method, admission/discharge state, address
- `doctors`: identity, credentials, specialization
- `vitals`: recorded vital values over time
- `alerts`: generated alerts from abnormal vitals
- `doctor_activities`: operational tasks with status (`incoming`, `completed`, `canceled`)
- `patient_diagnosis`, `patient_allergies`, `patient_medication`, `patient_admission_history`
- `patient_stats`: per-patient aggregated snapshot used by batch views
- `batch_analytics`: persisted batch run analytics snapshots (including advanced JSON analytics)

Relationship model:

- one patient has many vitals, alerts, diagnoses, allergies, medications, admission history entries
- patient-doctor associations are maintained via join tables
- batch snapshots are independent time-series records for historical analytics

## Streaming vs Batch

MedStream intentionally uses both processing models.

### Streaming (real-time, operational)

Purpose: surface urgent state changes immediately.

Flow:

1. vitals are produced continuously (simulator or external producers)
2. Kafka consumer ingests vitals
3. thresholds are evaluated
4. alerts are generated instantly when needed
5. events are pushed to frontend via WebSocket
6. streaming metrics window is updated in memory

Used for:

- “what is happening now”
- immediate triage signals
- live dashboard cards and alerts feed

### Batch (periodic, analytical)

Purpose: provide stable and richer insights over a time window.

Flow:

1. scheduler triggers batch job on interval or cron
2. vitals/alerts are aggregated into `patient_stats`
3. batch snapshot metrics are computed
4. advanced insights are calculated and stored in `batch_analytics`
5. `/metrics/batch*` endpoints expose the latest snapshot to frontend

Used for:

- trend and delta analysis vs previous batch
- department-level aggregates
- alert distribution by type
- patient stability distribution (`stable`, `warning`, `critical`)
- activity status summary (`incoming`, `completed`, `canceled`)

## Batch Analytics Coverage

Current batch insights include:

- base metrics:
  - average heart rate
  - average oxygen
  - average temperature
  - alerts count
  - active patients
- trend metrics:
  - delta avg heart rate vs previous batch
  - delta avg temperature vs previous batch
  - delta alerts count vs previous batch
- top problematic patients:
  - highest HR (name + value)
  - lowest O2 (name + value)
- department analytics:
  - average vitals and alerts count by department
- alert distribution:
  - heart rate, oxygen, temperature
- stability distribution:
  - stable, warning, critical
- activity summary:
  - incoming, completed, canceled

## Local Development

### Prerequisites

- Python 3.11+
- Node.js 18+
- Docker (for PostgreSQL + Kafka stack)

### Start Infrastructure

```bash
docker compose up -d
```

### Start Backend

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --reload
```

Backend URL: `http://localhost:8000`

### Start Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend URL: `http://localhost:5173`

## Configuration

Example environment values:

```env
DATABASE_URL=postgresql://medstream:medstream@localhost:5432/medstream
POSTGRES_DB=medstream
POSTGRES_USER=medstream
POSTGRES_PASSWORD=medstream
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
KAFKA_VITALS_TOPIC=vitals-events
KAFKA_ALERTS_TOPIC=alerts-events
KAFKA_BATCH_TOPIC=batch-events
BATCH_INTERVAL_SECONDS=300
```

Default local ports:

- Frontend: `5173`
- Backend: `8000`
- PostgreSQL: `5432`
- pgAdmin: `5050`
- Kafka UI: `8080`

## Seed & Demo Data

The simulator and seed utilities can populate doctors/patients and generate live traffic.

Common commands:

```bash
python3 -m backend.app.simulator.seed
python3 -m backend.app.simulator.seed_doctors
python3 -m backend.app.simulator.seed_all
```

Example doctor credentials (after seeding):

- Email: `elena.popescu@medstream.local`
- Password: `password123`

## Notes

- Schema evolution is currently handled at app startup (`init_db`) with defensive column checks.
- For production, explicit versioned migrations are recommended.
