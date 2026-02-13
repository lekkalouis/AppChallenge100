#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-8080}"

if command -v cloudflared >/dev/null 2>&1; then
  echo "Starting free Cloudflare quick tunnel to localhost:${PORT}"
  echo "Keep this terminal open while the tunnel is active."
  cloudflared tunnel --url "http://localhost:${PORT}"
  exit 0
fi

echo "cloudflared is not installed."
echo "Install it, then run: cloudflared tunnel --url http://localhost:${PORT}"
exit 1
