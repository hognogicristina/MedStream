#!/bin/bash

echo "Starting MedStream..."

source .venv/bin/activate

cleanup() {
  echo "Stopping MedStream..."
  kill $API_PID $CONSUMER_PID $SIMULATOR_PID 2>/dev/null
  exit 0
}

trap cleanup SIGINT

echo "Starting API..."
uvicorn app.main:app --reload &
API_PID=$!

echo "Starting simulator..."
python3 -m app.kafka.vitals_simulator &
SIMULATOR_PID=$!

echo "All services running. Press CTRL+C to stop."

wait