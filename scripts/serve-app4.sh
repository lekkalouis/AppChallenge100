#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-8080}"

printf 'Serving AppChallenge100 on http://0.0.0.0:%s\n' "$PORT"
printf 'Open from another device on your network with: http://<your-local-ip>:%s\n' "$PORT"
python3 -m http.server "$PORT" --bind 0.0.0.0
