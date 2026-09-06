#!/usr/bin/env bash
# GuardianAI - Backend Server
set -euo pipefail

cd "$(dirname "$0")"

NEED_INSTALL=0
for arg in "$@"; do
  [ "$arg" = "--install" ] && NEED_INSTALL=1
done

if [ ! -d venv ]; then
  echo "Creating virtual environment..."
  python3 -m venv --system-site-packages venv
  NEED_INSTALL=1
fi

# shellcheck disable=SC1091
source venv/bin/activate

if ! python -c "import uvicorn, fastapi, cv2, ultralytics" >/dev/null 2>&1; then
  NEED_INSTALL=1
fi

if [ "$NEED_INSTALL" = "1" ]; then
  echo "Installing / updating dependencies..."
  pip install -r requirements.txt
fi

echo
echo "Starting GuardianAI Backend on http://localhost:8000"
echo "Press Ctrl+C to stop"
echo

exec python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
