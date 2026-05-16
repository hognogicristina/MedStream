# MedStream

MedStream is a full-stack hospital monitoring application for patient operations, live vital signs, clinical alerts, medical records, and batch analytics. It models a complete hospital workflow where doctors can authenticate, manage patients, track patient condition in real time, and compare streaming processing with batch processing.

The project is designed as a demo/portfolio application for real-time healthcare data pipelines and operational dashboards.

## Main Features

- Doctor authentication, registration, email verification, account recovery, and password reset.
- Doctor profile management with specialization, personal details, assigned patients, clinical activities, and account deactivation.
- Patient management: admission, editing, doctor assignment, transfer, discharge, and readmission.
- Department views with filterable patient lists, admission status, alert severity, and treatment outcome filters.
- Live patient monitoring for heart rate, oxygen saturation, temperature, and blood pressure.
- Automated clinical alerts for abnormal vital signs and normalization events.
- Clinical records for diagnoses, allergies, medical conditions, medication, and admission history.
- Patient treatment analysis with events, alerts, medication context, and clinical timeline data.
- Post-discharge clinical summaries generated from batch processing.
- Streaming metrics, batch metrics, and direct comparison of latency, throughput, alert rates, and data stability.
- Backend simulator for continuously generating patients, vitals, alerts, and clinical events.

## Tech Stack

| Area | Technologies |
| --- | --- |
| Frontend | React 19, Vite, React Router, Cloudscape Design, Recharts, Axios |
| Backend | FastAPI, SQLAlchemy, Pydantic, Uvicorn |
| Database | PostgreSQL |
| Streaming | Kafka, Confluent Kafka client, WebSocket |
| Batch processing | APScheduler, Python aggregation jobs |
| Local infrastructure | Docker Compose, pgAdmin, Kafka UI, MailCatcher |
| Testing | Pytest for validators and medical logic |

## Architecture

```mermaid
flowchart LR
  Doctor["Doctor in browser"] --> Frontend["React + Vite"]
  Frontend --> API["FastAPI REST API"]
  Frontend --> WS["WebSocket /ws"]
  API --> DB["PostgreSQL"]
  API --> Batch["Batch scheduler"]
  Simulator["Patient/vitals simulator"] --> Kafka["Kafka topics"]
  Kafka --> Consumer["Kafka consumer"]
  Consumer --> DB
  Consumer --> WS
  Batch --> DB
  API --> Mail["MailCatcher SMTP"]
```

The live flow starts from the simulator or Kafka events. The consumer stores vital signs, updates streaming metrics, and broadcasts events to the frontend through WebSocket. The batch layer runs periodically, aggregates historical data, and produces more stable insights for dashboards and reports.

## Project Structure

```text
MedStream/
  backend/
    app/
      api/              # REST and WebSocket routes
      alerts/           # vital-sign alert rules
      batch/            # scheduler and batch jobs
      core/             # configuration, errors, standard responses
      db/               # database initialization and SQLAlchemy sessions
      helpers/          # CSV data for diagnoses, medication, counties, etc.
      kafka/            # producers, consumers, and topics
      models/           # SQLAlchemy models
      repositories/     # data access layer
      schemas/          # Pydantic DTOs
      service/          # business logic
      simulator/        # patient, vital, activity, and event generation
      validators/       # domain validators
    tests/              # Pytest tests
  frontend/
    src/
      components/       # reusable UI components
      hooks/            # notification and patient-action hooks
      pages/            # application pages
      services/         # API and WebSocket clients
      utils/            # formatting, date, phone, and alert utilities
  docker-compose.yml
```

## Key Pages

| Route | Purpose |
| --- | --- |
| `/login`, `/register` | Doctor access, account creation, and email verification |
| `/dashboard` | High-level view of patients, alerts, and monitoring activity |
| `/departments` and `/departments/:name` | Patients grouped by department, filters, and batch status |
| `/patients/new` | Patient intake/admission form |
| `/patient/:id` | Patient monitoring, live vitals, alerts, and main patient actions |
| `/patients/:id/clinical-records` | Diagnoses, allergies, conditions, and medication |
| `/patients/:id/admission-history` | Admission, discharge, and readmission history |
| `/patients/:id/analysis` | Treatment analysis and clinical correlations |
| `/patients/:id/post-discharge-summary` | Post-discharge clinical summary |
| `/alerts` | Global alert feed and severity charts |
| `/metrics/streaming` | Live streaming-processing monitoring |
| `/metrics/batch` | Batch analytics, schedule, status, and manual run controls |
| `/metrics/comparison` | Streaming vs batch comparison |
| `/profile` | Doctor profile, assigned patients, and clinical activities |
| `/how-it-works` | Visual explanation of streaming, batch, and comparison logic |

## Main API Endpoints

- `POST /register`, `POST /login`, `GET /auth/verify-email`, `POST /auth/forgot-password`, `POST /auth/reset-password`
- `GET /doctors/me`, `PATCH /doctors/me`, `PATCH /doctors/me/email`
- `GET /doctors/{doctor_id}/patients`, `POST /doctors/{doctor_id}/patients/{patient_id}`
- `GET /patients`, `POST /patients`, `GET /patients/{id}`, `PATCH /patients/{id}`
- `PATCH /patients/{id}/discharge`, `POST /patients/{id}/readmit`, `POST /patients/{id}/transfer`
- `GET /patients/{id}/diagnosis`, `GET /patients/{id}/allergies`, `GET /patients/{id}/conditions`, `GET /patients/{id}/medications`
- `GET /vitals?patient_id=...`, `GET /alerts`, `GET /alerts/dashboard-summary`
- `GET /metrics/streaming`, `GET /metrics/batch`, `GET /metrics/comparison`, `GET /metrics/batch-insights`
- `GET /batch/status`, `GET /batch/schedule`, `POST /batch/schedule`, `POST /batch/run`
- `GET /health`, `WS /ws`

FastAPI interactive documentation is available locally at `http://localhost:8000/docs`.

## Run With Docker

Docker is required. From the project root:

```bash
docker compose up -d
```

Started services:

| Service | URL |
| --- | --- |
| Frontend | `http://localhost:5173` |
| Backend API | `http://localhost:8000` |
| Swagger / OpenAPI | `http://localhost:8000/docs` |
| PostgreSQL | `localhost:5432` |
| pgAdmin | `http://localhost:5050` |
| Kafka UI | `http://localhost:8080` |
| MailCatcher | `http://localhost:1080` |

Default pgAdmin credentials:

```text
Email: admin@medstream.com
Password: admin123
```

## Configuration

The backend reads configuration from `.env` in the project root or from `backend/.env`. Important variables:

```env
DATABASE_URL=postgresql://medstream_user:medstream_pass@localhost:5432/medstream
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
KAFKA_VITALS_TOPIC=vitals-events
KAFKA_ALERTS_TOPIC=alerts-events
KAFKA_BATCH_TOPIC=batch-events
FRONTEND_BASE_URL=http://localhost:5173
SMTP_HOST=localhost
SMTP_PORT=1025
BATCH_INTERVAL_SECONDS=30
AUTH_SECRET_KEY=medstream-dev-auth-secret
```

The frontend uses:

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws
```

These values are already configured for local Docker Compose usage.

## Manual Run

Backend:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cd backend
uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

For a full manual setup, PostgreSQL, Kafka, and MailCatcher must also be configured separately or started through Docker.

## Testing

Backend:

```bash
source .venv/bin/activate
pytest
```

Frontend:

```bash
cd frontend
npm run lint
npm run build
```

The existing tests cover address, doctor, and patient validators, plus treatment outcome logic.

## Data and Simulation

When the backend starts, it initializes the database schema directly from the SQLAlchemy models. The application includes helper CSV files for departments, diagnoses, allergies, medication, frequencies, dosages, and activity types.

The simulator runs in the background with the backend and can generate:

- new patients;
- vital sign events;
- alerts on state transitions;
- clinical activities;
- automatic transfers or discharges;
- enough demo data for streaming vs batch comparisons.

Relevant alert thresholds:

- heart rate above `110` becomes `high`, above `130` becomes `critical`;
- oxygen saturation below `92` becomes `low`, below `88` becomes `critical`;
- temperature above `38` becomes `high`, above `39` becomes `critical`.

## Streaming vs Batch

Streaming is used for fast reactions: vital signs are processed immediately, alerts appear almost instantly, and patient/dashboard pages update live.

Batch processing is used for stability and analysis: it aggregates data over time windows, computes averages, department distributions, frequent diagnoses, treatment effectiveness, medication effectiveness, and post-discharge summaries.

The `/metrics/comparison` page shows the difference between the two approaches through metrics such as latency, processed events, alerts, throughput, and alert rate.

## Recommended Manual Review Flow

For a quick, text-only review, walk through these key pages:

- `/dashboard` — application overview, status cards, alert preview, and main navigation.
- `/patient/:id` — patient monitoring with vitals and alert context.
- `/patients/:id/clinical-records` — diagnoses, allergies, conditions, and medication.
- `/alerts` — alert feed and severity details.
- `/metrics/streaming` — live metrics and streaming execution behavior.
- `/metrics/batch` — batch insights, scheduling, and run status.
- `/metrics/comparison` — latency, processed events, alerts, throughput, and alert rate.
- `/departments` — patient lists, filters, and department-level batch status.
- `/patients/:id/analysis` — treatment reasoning and clinical timeline.
- `/how-it-works` — concise explanation of streaming and batch workflow.

## Development Notes

- `init_db()` creates the schema directly from models; long-lived environments should use explicit migrations, for example Alembic.
- CORS is open for local development.
- `AUTH_SECRET_KEY` should be changed outside development.
- MailCatcher is intended for development email testing, not real email delivery.
- Simulator-generated data is demo data and should not be treated as real clinical data.
