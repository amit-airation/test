#!/usr/bin/env bash
# Build and start the full stack (postgres, redis, livekit, api, web, nginx).
#
# Usage:
#   ./scripts/deploy-edge.sh           # docker compose up -d --build
#   ./scripts/deploy-edge.sh --cert    # up, then Let's Encrypt webroot + reload
#   ./scripts/deploy-edge.sh --down
#   npm run edge:up

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

WITH_CERT=0
DOWN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --cert) WITH_CERT=1; shift ;;
    --down) DOWN=1; shift ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1 && sudo docker info >/dev/null 2>&1; then
    DOCKER=(sudo docker)
  else
    echo "Cannot talk to the Docker daemon." >&2
    exit 1
  fi
fi

COMPOSE=("${DOCKER[@]}" compose)

if [[ "${DOWN}" -eq 1 ]]; then
  "${COMPOSE[@]}" down
  echo "Stack stopped."
  exit 0
fi

export UI_SERVER_NAME="${UI_SERVER_NAME:-test.amitverma01.dev}"
export API_SERVER_NAME="${API_SERVER_NAME:-api.test.amitverma01.dev}"

"${COMPOSE[@]}" up -d --build

if [[ "${WITH_CERT}" -eq 1 ]]; then
  echo "Waiting for nginx, then issuing Let's Encrypt certs (webroot)..."
  for i in $(seq 1 30); do
    if "${DOCKER[@]}" ps --format '{{.Names}} {{.Status}}' | grep -q 'hirance-nginx.*Up'; then
      break
    fi
    sleep 2
  done
  bash "${ROOT_DIR}/scripts/generate-ssl-cert.sh" --webroot
  "${DOCKER[@]}" exec hirance-nginx nginx -s reload || true
fi

echo
echo "Stack is up:"
echo "  UI      https://${UI_SERVER_NAME}"
echo "  API     https://${API_SERVER_NAME}/api/health/live"
echo "  WS      https://${API_SERVER_NAME}  (Socket.IO /socket.io/)"
echo "  Screen  LiveKit Cloud (LIVEKIT_PUBLIC_URL in .env)"
echo
"${DOCKER[@]}" compose ps
