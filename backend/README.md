# MedStream Backend

A minimal, production-ready FastAPI backend scaffold for MedStream.

## Requirements
- Python 3.10+
- FastAPI (web framework)
- Uvicorn (ASGI server to run FastAPI apps)

## Setup
Create a virtual environment:

```bash
python -m venv venv
```

Activate it:

```bash
# macOS/Linux
source venv/bin/activate

# Windows
venv\Scripts\activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

## Run the server

```bash
uvicorn app.main:app --reload
```

## Data generator

Additional dependencies for the generator:

```bash
pip install -r requirements.txt
```

Configure database access in `backend/.env` using either `DATABASE_URL` or the `POSTGRES_*` variables shown in `.env.example`.

Run the generator from the `backend` folder:

```bash
python -m app.generator.orchestrator
```
