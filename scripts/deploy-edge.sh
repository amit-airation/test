#!/usr/bin/env bash
# Start / refresh the production nginx edge on EC2 Ubuntu.
#
# Usage:
#   ./scripts/deploy-edge.sh           # build + up
#   ./scripts/deploy-edge.sh --cert    # issue/renew certs first, then up
#   ./scripts/deploy-edge.sh --down    # stop the edge
#   npm run edge:up
#
# Expects API on host :3001 and web on host :3000 unless API_UPSTREAM /
# WEB_UPSTREAM are set. Certs must exist in docker/nginx/certs/ (or pass --cert).

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
      sed -n '2,14p' "$0"
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

COMPOSE=("${DOCKER[@]}" compose -f docker-compose.prod.yml)

if [[ "${DOWN}" -eq 1 ]]; then
  "${COMPOSE[@]}" down
  echo "Edge stopped."
  exit 0
fi

if [[ "${WITH_CERT}" -eq 1 ]]; then
  bash "${ROOT_DIR}/scripts/generate-ssl-cert.sh"
fi

CERT_FULL="${ROOT_DIR}/docker/nginx/certs/fullchain.pem"
CERT_KEY="${ROOT_DIR}/docker/nginx/certs/privkey.pem"
if [[ ! -f "${CERT_FULL}" || ! -f "${CERT_KEY}" ]]; then
  echo "Missing TLS material:" >&2
  echo "  ${CERT_FULL}" >&2
  echo "  ${CERT_KEY}" >&2
  echo "Run: npm run ssl:cert   (or ./scripts/deploy-edge.sh --cert)" >&2
  exit 1
fi

export UI_SERVER_NAME="${UI_SERVER_NAME:-test.amitverma01.dev}"
export API_SERVER_NAME="${API_SERVER_NAME:-api.test.amitverma01.dev}"
export API_UPSTREAM="${API_UPSTREAM:-host.docker.internal:3001}"
export WEB_UPSTREAM="${WEB_UPSTREAM:-host.docker.internal:3000}"

"${COMPOSE[@]}" up -d --build

echo
echo "Edge is up:"
echo "  UI  https://${UI_SERVER_NAME}"
echo "  API https://${API_SERVER_NAME}/api/health/live"
echo "  WS  https://${API_SERVER_NAME}  (Socket.IO /socket.io/)"
echo
"${DOCKER[@]}" ps --filter name=hirance-nginx
