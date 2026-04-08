#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_CMD=()

if [ -x "$ROOT_DIR/.venv/bin/python" ]; then
  BACKEND_CMD=("$ROOT_DIR/.venv/bin/python" -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000)
else
  BACKEND_CMD=(python3 -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000)
fi

cleanup() {
  if [ -n "${BACKEND_PID:-}" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi

  if [ -n "${FRONTEND_PID:-}" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

cd "$ROOT_DIR"

docker compose up -d

"${BACKEND_CMD[@]}" &
BACKEND_PID=$!

npm --prefix frontend run dev -- --host 0.0.0.0 &
FRONTEND_PID=$!

echo "MedStream local dev started"
echo "Backend: http://localhost:8000"
echo "Frontend: http://localhost:5173"
echo "Kafka UI: http://localhost:8080"
echo "pgAdmin: http://localhost:5050"

wait -n "$BACKEND_PID" "$FRONTEND_PID"
