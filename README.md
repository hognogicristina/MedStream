# MedStream

MedStream is a real-time hospital monitoring system with a FastAPI backend, PostgreSQL, Kafka event streaming, and a React frontend. It supports live vitals streaming, alerting, department-based dashboards, patient detail monitoring, medication administration events, and a story-driven ambulance scenario for demo use.

## Stack

- Backend: FastAPI, SQLAlchemy, PostgreSQL
- Streaming: Kafka, WebSocket
- Frontend: React, Vite, React Router, Recharts
- Auth: basic doctor login with bcrypt password hashing

## Features

- Home page, login page, dashboard, and patient detail page
- Real-time vitals stream over Kafka and WebSocket
- Alert generation for abnormal vitals
- Department grouping for ER, ICU, and Ward
- Patient replay timeline
- Hospital events feed
- Medication administration and live medication events
- Doctor login with seeded demo accounts
- Story-based ambulance scenario simulator

## Project Structure

```text
MedStream/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── batch/
│   │   ├── core/
│   │   ├── db/
│   │   ├── kafka/
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── simulator/
│   │   └── websocket/
│   └── requirements.txt
├── frontend/
│   ├── public/
│   ├── src/
│   └── package.json
└── docker-compose.yml
```

## Prerequisites

- Python 3.11+ recommended
- Node.js 20+ recommended
- npm
- Docker and Docker Compose

## Environment Setup

Create a `.env` file in the project root if you run backend services from the root, or in `backend/` if you run the backend from there.

Example:

```env
POSTGRES_DB=medstream
POSTGRES_USER=medstream
POSTGRES_PASSWORD=medstream
DATABASE_URL=postgresql://medstream:medstream@localhost:5432/medstream
```

The backend also uses these defaults if not overridden:

```env
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
KAFKA_VITALS_TOPIC=vitals-events
KAFKA_EVENTS_TOPIC=hospital-events
```

## Install

### Quick start

From the project root:

```bash
./start-dev.sh
```

This starts Docker services, the FastAPI backend, and the Vite frontend from one place.

Expected local URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`
- Kafka UI: `http://localhost:8080`
- pgAdmin: `http://localhost:5050`

Prerequisites for the one-command flow:

- Docker and Docker Compose running
- frontend dependencies already installed with `npm install --prefix frontend`
- backend dependencies already installed, either in `.venv` or in your active Python environment

### 1. Start infrastructure

From the project root:

```bash
docker compose up -d
```

This starts:

- PostgreSQL on `localhost:5432`
- pgAdmin on `http://localhost:5050`
- Zookeeper on `localhost:2181`
- Kafka on `localhost:9092`
- Kafka UI on `http://localhost:8080`

## Backend Setup

### 1. Create a virtual environment

From the project root:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Install Python dependencies

```bash
pip install -r backend/requirements.txt
```

### 3. Run the backend

From the project root:

```bash
uvicorn backend.app.main:app --reload
```

Backend runs at:

- API: `http://localhost:8000`
- Swagger docs: `http://localhost:8000/docs`

## Frontend Setup

### 1. Install dependencies

```bash
cd frontend
npm install
```

### 2. Run the frontend

```bash
npm run dev
```

Frontend runs at:

- App: `http://localhost:5173`

### 3. Optional production build

```bash
npm run build
npm run preview
```

## First Run

Recommended order:

1. Start Docker services
2. Start backend with `uvicorn`
3. Seed patients
4. Seed doctors
5. Start frontend

If you want one local development entrypoint after dependencies are installed, use:

```bash
./start-dev.sh
```

## Seed Data

### Seed patients

From the project root:

```bash
python3 -m backend.app.simulator.seed
```

This creates realistic demo patients across `ER`, `ICU`, `Cardiology`, `Internal Medicine`, `Neurology`, and `Ward`.

### Seed doctors

From the project root:

```bash
python3 -m backend.app.simulator.seed_doctors
```

This creates the demo doctor roster and updates existing matching records if you run it again.

### Seed all demo data

From the project root:

```bash
python3 -m backend.app.simulator.seed_all
```

This initializes the schema if needed, then runs the doctor and patient seeders in sequence. It is safe to rerun for local demo setup because doctors are matched by email and patients are matched by CNP.

Example login:

- Email: `elena.popescu@medstream.local`
- Password: `password123`

## Running the Demo Flow

### Standard live simulator

The backend starts the general vitals simulator automatically through background threads when the API starts.

### Story-based ambulance scenario

Run this in a separate terminal from the project root:

```bash
python3 -m backend.app.simulator.scenario_simulator
```

This simulates:

1. ambulance arrival with chest pain
2. ER intake
3. critical vitals
4. treatment started
5. ICU transfer if needed
6. stabilization
7. recovery

The frontend dashboard will show both changing vitals and hospital event messages during the scenario.

## Frontend Navigation

- `/` home page
- `/login` doctor login
- `/dashboard` monitoring dashboard
- `/patient/:id` patient detail page

## Alert Audio

The frontend expects an alert sound file at:

```text
frontend/public/alert.mp3
```

Place your audio file there if you want alert playback.

## Main API Endpoints

### Authentication

- `POST /login`
- `POST /doctors/login`

Request body:

```json
{
  "email": "elena.popescu@medstream.local",
  "password": "password123"
}
```

Response:

```json
{
  "token": "doctor-1-..."
}
```

### Doctors

- `GET /doctors`
- `POST /doctors`

### Patients

- `GET /patients?page=1&limit=10`
- `POST /patients`
- `PATCH /patients/{id}/department`
- `POST /patients/{id}/medication`

Example department update:

```json
{
  "department": "ICU"
}
```

Example medication administration:

```json
{
  "medication_name": "Nitroglycerin",
  "dosage": "0.4 mg"
}
```

### Monitoring

- `GET /vitals`
- `GET /alerts`
- `GET /stats`
- `GET /health`
- WebSocket: `ws://localhost:8000/ws`

## How the System Works

### Vitals flow

1. Simulator sends vitals into Kafka
2. Kafka consumer reads vitals
3. Backend stores vitals in PostgreSQL
4. Backend generates alerts when thresholds are crossed
5. Backend broadcasts vitals and alerts through WebSocket
6. Frontend updates dashboard and patient views live

### Event flow

1. Scenario simulator or medication endpoint creates an event
2. Event is sent through Kafka or directly broadcast from the backend endpoint
3. WebSocket clients receive `type: "event"`
4. Frontend updates the event feed

## Useful Commands

### Stop infrastructure

```bash
docker compose down
```

### Stop and remove volumes

```bash
docker compose down -v
```

### Rebuild frontend

```bash
cd frontend
npm run build
```

### Verify backend imports

```bash
python3 -m compileall backend/app
```

## Troubleshooting

### Login fails

- Make sure doctors are seeded
- Verify backend is running on port `8000`
- Try the example seeded credential above

### No live data on dashboard

- Make sure Kafka and Zookeeper are running
- Make sure backend is running
- Make sure patients are seeded
- Check `http://localhost:8080` for Kafka topic activity

### Schema mismatch after model changes

This project uses `create_all`, not migrations. If you already have an older local database schema, new columns or tables may not appear automatically in an existing database. In that case, reset the database volume or recreate the schema.

### Frontend alert sound not playing

- Make sure `frontend/public/alert.mp3` exists
- Browser autoplay policies may require a user interaction first

## Demo Credential

- Email: `elena.popescu@medstream.local`
- Password: `password123`
