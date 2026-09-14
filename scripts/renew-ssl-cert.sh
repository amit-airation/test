#!/usr/bin/env bash
# Renew Let's Encrypt certs via ACME webroot (nginx must be running),
# then reload nginx. Safe for cron on EC2 Ubuntu.
#
#   0 3 1 * * cd /path/to/compettion && ./scripts/renew-ssl-cert.sh >> /var/log/hirance-ssl-renew.log 2>&1

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

bash "${ROOT_DIR}/scripts/generate-ssl-cert.sh" --webroot "$@"

DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1 && sudo docker info >/dev/null 2>&1; then
    DOCKER=(sudo docker)
  else
    echo "Cannot talk to the Docker daemon." >&2
    exit 1
  fi
fi

if "${DOCKER[@]}" ps --format '{{.Names}}' | grep -qx 'hirance-nginx'; then
  "${DOCKER[@]}" exec hirance-nginx nginx -s reload
  echo "nginx reloaded."
else
  echo "hirance-nginx is not running; certs renewed on disk only."
fi
