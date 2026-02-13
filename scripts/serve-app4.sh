#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-8080}"

printf 'Serving AppChallenge100 on http://0.0.0.0:%s\n' "$PORT"
printf 'Open from another device on your network with: http://<your-local-ip>:%s\n' "$PORT"

if command -v python3 >/dev/null 2>&1; then
  python3 -m http.server "$PORT" --bind 0.0.0.0
elif command -v python >/dev/null 2>&1; then
  python -m http.server "$PORT" --bind 0.0.0.0
elif command -v py >/dev/null 2>&1; then
  py -3 -m http.server "$PORT" --bind 0.0.0.0
else
  cat <<'MSG'
No Python runtime was found in PATH.

Install Python 3 and ensure one of these commands is available:
  - python3
  - python
  - py (Windows launcher)

On Windows, if `python` opens the Microsoft Store shortcut, install Python from
https://www.python.org/downloads/ and disable the App Execution Alias if needed.
MSG
  exit 1
fi
