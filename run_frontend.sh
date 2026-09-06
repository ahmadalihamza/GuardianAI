#!/usr/bin/env bash
# GuardianAI - Next.js Dashboard
set -euo pipefail

cd "$(dirname "$0")/frontend"

if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm was not found on PATH." >&2
  echo "Install Node.js 18.18 or newer, then try again." >&2
  exit 1
fi

NEED_INSTALL=0
PROD=0
for arg in "$@"; do
  [ "$arg" = "--install" ] && NEED_INSTALL=1
  [ "$arg" = "--prod" ] && PROD=1
done
[ -d node_modules ] || NEED_INSTALL=1

if [ "$NEED_INSTALL" = "1" ]; then
  echo "Installing / updating Node dependencies..."
  npm install
fi

DEFAULT_PORT=3000
if command -v ss >/dev/null 2>&1 && ss -tlpn 'sport = :3000' 2>/dev/null | grep -q :3000; then
  DEFAULT_PORT=3001
elif command -v lsof >/dev/null 2>&1 && lsof -i :3000 >/dev/null 2>&1; then
  DEFAULT_PORT=3001
fi
PORT="${PORT:-$DEFAULT_PORT}"

echo
echo "Starting GuardianAI Dashboard on http://localhost:${PORT}"
echo "Backend is expected on http://localhost:8000 (override with BACKEND_URL)"
echo "Press Ctrl+C to stop"
echo

if [ "$PROD" = "1" ]; then
  npm run build
  exec npx next start -p "$PORT"
fi

exec npx next dev -p "$PORT"
