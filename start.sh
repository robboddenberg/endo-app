#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

PORT="${PORT:-8000}"

if [ ! -d "venv" ]; then
  python3 -m venv venv
fi

source venv/bin/activate
pip install -r requirements.txt

if [ ! -f "data/data.json" ]; then
  python3 scripts/build_initial_data.py
fi

uvicorn backend.app.main:app --reload --host 0.0.0.0 --port "$PORT"
