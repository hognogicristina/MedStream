# MedStream

MedStream is a hospital monitoring application for managing patients, tracking live vitals, reviewing alerts, and documenting admission-related clinical activity.

## Overview

MedStream combines patient administration, clinical monitoring, and medical record tracking in a single web application. It supports real-time vital sign updates, automatic alert generation, patient admission and discharge workflows, and structured patient documentation such as allergies, diagnosis entries, and medical history.

The system includes a FastAPI backend, a PostgreSQL database, a React frontend, and a live monitoring pipeline that streams vitals into the application and updates the interface through WebSocket connections.

## Purpose of the Application

Hospitals and clinical teams need a consolidated view of patient status that is both operational and medically useful. MedStream addresses this need by:

- centralizing patient identity and admission data
- exposing live vital-sign monitoring in the interface
- generating alerts when abnormal thresholds are crossed
- preserving structured medical records for allergies, diagnosis, and history
- supporting discharge and readmission workflows with an admission history timeline

From a clinical perspective, the application is designed to reduce fragmentation between patient management, live monitoring, and historical review.

## Key Features

### Patient Management

- Create patients with structured demographic and identity data
- Edit patient information after creation
- Track core patient fields such as:
  - CNP
  - phone number
  - birth date
  - gender
  - department
  - arrival method
  - full address
- Transfer patients between departments
- Discharge patients
- Readmit discharged patients

### Monitoring

- Live vitals tracking for:
  - heart rate
  - oxygen saturation
  - temperature
  - blood pressure
- Automatic alert generation when configured thresholds are exceeded
- Real-time dashboard updates through WebSocket messages
- Patient-specific live monitoring on the patient page

### Medical Data

- Patient medical history entries
- Patient diagnosis timeline
- Patient allergies
- Medication administration records

### Admission System

- Discharge workflow with reason tracking
- Readmission workflow with required reason
- Dedicated admission history timeline
- Separate admission-history page for each patient

### Analytics

- Department-oriented dashboard overview
- Aggregated patient statistics from batch processing
- Batch status visibility
- Calculated metrics such as average heart rate, average temperature, total alerts, and anomaly rate

## Architecture

### Backend

The backend is built with FastAPI and SQLAlchemy. It is responsible for:

- exposing REST endpoints for doctors, patients, alerts, vitals, and analytics
- validating incoming payloads with Pydantic schemas
- persisting application data in PostgreSQL
- broadcasting live updates through WebSocket connections
- running background threads for simulation, consumption, and batch analytics

### Frontend

The frontend is built with React, Vite, React Router, and Tailwind CSS. It provides:

- authenticated application routing
- dashboard and patient workflows
- doctor account management
- responsive monitoring views
- notification feedback for backend-driven operations

### Data Flow

The main application flow is:

1. Data is created or updated through frontend forms or backend simulators.
2. The FastAPI backend validates and stores the data in PostgreSQL.
3. Real-time monitoring updates are broadcast through WebSocket.
4. The React frontend listens for live vital and alert messages and updates the UI.
5. Batch jobs compute aggregated statistics used by the dashboard analytics views.

## Streaming vs Batch Processing

MedStream uses two different processing styles because not all hospital data has the same urgency.

### Streaming

Streaming is used for information that must appear immediately:

- live vitals are produced continuously
- the backend consumes those vital messages
- alerts are generated as soon as abnormal values are detected
- vitals and alerts are pushed to the frontend through WebSocket

In simple terms, streaming handles what is happening right now.

### Batch Processing

Batch processing is used for data that is summarized over time:

- aggregated statistics are computed in the background
- department-level metrics are updated periodically
- dashboard analytics are based on stored and processed values rather than a single live sample

In simple terms, batch processing handles trends and summaries rather than immediate bedside changes.

## Database Design

The application is centered around the `patients` table and several related clinical tables.

### Core Tables

- `patients`
  - stores patient identity, demographics, admission status, department, arrival method, and address
- `patient_allergies`
  - stores allergy name, severity, patient reference, and creation time
- `patient_medical_history`
  - stores structured history entries such as illnesses, chronic conditions, surgeries, and injuries
- `patient_diagnosis`
  - stores diagnosis records and notes for each patient
- `patient_admission_history`
  - stores discharge and readmission actions with reason and timestamp

### Related Monitoring Tables

- `vitals`
  - stores recorded vital sign values
- `alerts`
  - stores alerts created from abnormal vital values
- `medication_administrations`
  - stores administered medications and dosage
- `patient_stats`
  - stores computed analytics snapshots

### Relationships

- One patient can have many allergy entries.
- One patient can have many medical-history entries.
- One patient can have many diagnosis entries.
- One patient can have many admission-history entries.
- One patient can have many vital records, alerts, and medication administrations.

## Validation & Error Handling

Validation is primarily backend-driven.

- FastAPI and Pydantic validate request payloads
- backend schemas normalize and validate fields such as phone numbers, departments, and required text
- API responses return structured success and error messages
- the frontend mostly handles presentation and form UX
- user-facing notifications are driven by backend response messages

This means validation rules are enforced consistently at the API level rather than duplicated across the client.

## Installation

### Backend

1. Create a Python virtual environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

2. Install backend dependencies:

```bash
pip install -r backend/requirements.txt
```

3. Start the backend:

```bash
uvicorn backend.app.main:app --reload
```

The backend runs on `http://localhost:8000`.

### Frontend

1. Install frontend dependencies:

```bash
cd frontend
npm install
```

2. Start the development server:

```bash
npm run dev
```

The frontend runs on `http://localhost:5173`.

### Docker

The project includes Docker Compose for infrastructure services.

Start containers from the project root:

```bash
docker compose up -d
```

This starts:

- PostgreSQL
- pgAdmin
- Zookeeper
- Kafka
- Kafka UI

An optional convenience script is also included:

```bash
./start-dev.sh
```

This script starts the local development stack from one entry point when dependencies are already installed.

## Configuration

The backend reads configuration from environment variables through a `.env` file.

Typical values include:

```env
DATABASE_URL=postgresql://medstream:medstream@localhost:5432/medstream
POSTGRES_DB=medstream
POSTGRES_USER=medstream
POSTGRES_PASSWORD=medstream
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
KAFKA_VITALS_TOPIC=vitals-events
```

Default ports used in local development:

- Frontend: `5173`
- Backend: `8000`
- PostgreSQL: `5432`
- pgAdmin: `5050`
- Kafka UI: `8080`

## Seed Data

The project contains seed scripts that generate realistic demo data for development and presentation.

- patient data is generated with varied departments and demographics
- medical-like values are generated for vitals
- allergies, diagnosis history, medical history, and admission history are generated automatically
- doctor seed data is also available

Useful commands:

```bash
python3 -m backend.app.simulator.seed
python3 -m backend.app.simulator.seed_doctors
python3 -m backend.app.simulator.seed_all
```

Example demo credentials after seeding doctors:

- Email: `elena.popescu@medstream.local`
- Password: `password123`

## Usage

### Create a Patient

1. Open the application and navigate to the patient creation page.
2. Enter identity, demographic, arrival, and address information.
3. Submit the form to create a new patient record.

### Monitor a Patient

1. Open the dashboard to review live metrics and alerts.
2. Open a patient page to review patient-specific vitals and alert activity.
3. Continue monitoring as live WebSocket updates arrive.

### Discharge or Readmit a Patient

1. Open the patient page or the admission history page.
2. If the patient is admitted, use the discharge widget and provide a reason.
3. If the patient is discharged, use the readmit widget and provide a reason.
4. Review the admission history timeline for the recorded action.

### Add Diagnosis or Medical History

1. Open the patient page to add medical history and allergies.
2. Open the diagnosis page to add diagnosis entries.
3. Review the paginated lists to browse older entries.

## Future Improvements

- richer risk scoring based on multi-signal patient conditions
- more advanced anomaly detection beyond static thresholds
- deeper analytics and trend exploration per department and patient
- role expansion beyond doctor-focused access
- production-ready migrations instead of schema evolution through startup initialization
