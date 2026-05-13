# MedStream

## 1. Project Overview
MedStream is a hospital operations platform for patient workflows, live vitals monitoring, alerting, and analytics.

## 2. Features
- Doctor authentication, profile management, and email verification
- Patient admission, transfer, discharge, and readmission
- Real-time vitals ingestion and alert generation
- Live dashboard with alert preview and telemetry updates
- Batch analytics for stable, periodic insights
- Medical history modules: diagnoses, allergies, medications, admission history

## 3. Tech Stack
- Backend: FastAPI, SQLAlchemy, Pydantic
- Frontend: React, Vite, React Router
- Database: PostgreSQL
- Streaming: Kafka + WebSocket
- Local infrastructure: Docker Compose

## 4. Architecture (High-level)
- Frontend consumes REST APIs and a WebSocket event stream
- Backend handles business rules, persistence, streaming consumer logic, and batch jobs
- PostgreSQL stores operational and analytical data
- Kafka transports vitals/alerts events for near real-time processing

## 5. Setup Instructions
### Prerequisites
- Docker

### Run Everything With Docker
```bash
docker compose up --build
```

This starts the frontend, backend, PostgreSQL, pgAdmin, Kafka, and Kafka UI together.

### Optional: Run Services Manually
If you prefer running the app outside Docker, use Python 3.11+ and Node.js 18+.

#### Backend
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --reload
```

#### Frontend
```bash
cd frontend
npm install
npm run dev
```

## 6. Running the App
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`
- PostgreSQL: `localhost:5432`
- pgAdmin: `http://localhost:5050`
- Kafka UI: `http://localhost:8080`

## 7. Key Concepts (Streaming vs Batch)
### Streaming
- Low-latency updates for live monitoring
- Immediate alerting and dashboard refresh
- Best for operational decisions

### Batch
- Scheduled aggregation over time windows
- Stable trend and distribution analysis
- Best for periodic reporting and comparisons

## 8. Notes
- `init_db` assumes a fresh database and creates schema directly from models.
- For schema evolution in long-lived environments, use explicit migrations.
- Example environment values can be configured with `DATABASE_URL`, Kafka topic variables, and batch interval settings.
