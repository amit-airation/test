#!/usr/bin/env bash
# Issue or renew a Let's Encrypt TLS certificate for the nginx edge.
# Target: EC2 Ubuntu (Docker required). Also works on any Linux host.
#
# Defaults (SAN cert):
#   DOMAINS=test.amitverma01.dev,api.test.amitverma01.dev
#   EMAIL=amitz.airation@gmail.com
#
# Usage (on the EC2 box):
#   ./scripts/generate-ssl-cert.sh              # first issue (standalone; :80 free)
#   ./scripts/generate-ssl-cert.sh --webroot    # renew while nginx is running
#   ./scripts/generate-ssl-cert.sh --staging    # Let's Encrypt staging
#   npm run ssl:cert
#
# Prerequisites:
#   - DNS A/AAAA for every domain → this instance's public IP
#   - Security group / ufw allows inbound TCP 80 (and 443 for the edge)
#   - Docker Engine + Compose plugin installed (see scripts/ec2-bootstrap.sh)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERT_DIR="${ROOT_DIR}/docker/nginx/certs"
WEBROOT_DIR="${ROOT_DIR}/docker/nginx/certbot/www"
LE_DIR="${ROOT_DIR}/docker/nginx/certbot/letsencrypt"

DOMAINS_CSV="${DOMAINS:-test.amitverma01.dev,api.test.amitverma01.dev}"
EMAIL="${EMAIL:-amitz.airation@gmail.com}"
MODE="standalone"
STAGING_ARGS=()

trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --webroot) MODE="webroot"; shift ;;
    --standalone) MODE="standalone"; shift ;;
    --staging) STAGING_ARGS+=(--staging); shift ;;
    --domains|--domain) DOMAINS_CSV="$2"; shift 2 ;;
    --email) EMAIL="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

IFS=',' read -r -a DOMAIN_LIST <<< "${DOMAINS_CSV}"
PRIMARY_DOMAIN="$(trim "${DOMAIN_LIST[0]}")"
DOMAIN_ARGS=()
for raw in "${DOMAIN_LIST[@]}"; do
  d="$(trim "$raw")"
  [[ -n "$d" ]] || continue
  DOMAIN_ARGS+=(-d "$d")
done

if [[ ${#DOMAIN_ARGS[@]} -eq 0 ]]; then
  echo "No domains provided." >&2
  exit 1
fi

mkdir -p "${CERT_DIR}" "${WEBROOT_DIR}" "${LE_DIR}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. On a fresh EC2 Ubuntu host run:" >&2
  echo "  sudo bash scripts/ec2-bootstrap.sh" >&2
  exit 1
fi

# Avoid needing sudo for docker when the user is in the docker group.
DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1 && sudo docker info >/dev/null 2>&1; then
    DOCKER=(sudo docker)
  else
    echo "Cannot talk to the Docker daemon. Add your user to the docker group or use sudo." >&2
    exit 1
  fi
fi

echo "Issuing certificate for ${DOMAINS_CSV} (email ${EMAIL}, mode ${MODE})..."

if [[ "${MODE}" == "standalone" ]]; then
  if "${DOCKER[@]}" ps --format '{{.Names}}' | grep -qx 'hirance-nginx'; then
    echo "Stopping hirance-nginx so standalone can bind :80..."
    "${DOCKER[@]}" stop hirance-nginx >/dev/null
    RESTART_NGINX=1
  else
    RESTART_NGINX=0
  fi

  # Free host :80 if something else (apache/nginx) is bound — common on Ubuntu AMIs.
  if command -v ss >/dev/null 2>&1; then
    if ss -ltn | awk '{print $4}' | grep -Eq '(:|\\.)80$'; then
      echo "Warning: something is already listening on :80. Standalone certbot may fail." >&2
      echo "Stop that service or use --webroot after nginx is up with ACME location." >&2
    fi
  fi

  "${DOCKER[@]}" run --rm \
    -v "${LE_DIR}:/etc/letsencrypt" \
    -v "${WEBROOT_DIR}:/var/www/certbot" \
    -p 80:80 \
    certbot/certbot certonly \
    --standalone \
    --preferred-challenges http \
    "${DOMAIN_ARGS[@]}" \
    --email "${EMAIL}" \
    --agree-tos \
    --non-interactive \
    --expand \
    --keep-until-expiring \
    ${STAGING_ARGS[@]+"${STAGING_ARGS[@]}"}

  if [[ "${RESTART_NGINX}" -eq 1 ]]; then
    echo "Starting hirance-nginx again..."
    "${DOCKER[@]}" start hirance-nginx >/dev/null || true
  fi
else
  "${DOCKER[@]}" run --rm \
    -v "${LE_DIR}:/etc/letsencrypt" \
    -v "${WEBROOT_DIR}:/var/www/certbot" \
    certbot/certbot certonly \
    --webroot \
    -w /var/www/certbot \
    "${DOMAIN_ARGS[@]}" \
    --email "${EMAIL}" \
    --agree-tos \
    --non-interactive \
    --expand \
    --keep-until-expiring \
    ${STAGING_ARGS[@]+"${STAGING_ARGS[@]}"}
fi

LIVE_PATH="/etc/letsencrypt/live/${PRIMARY_DOMAIN}"
"${DOCKER[@]}" run --rm \
  -v "${LE_DIR}:/etc/letsencrypt:ro" \
  -v "${CERT_DIR}:/out" \
  alpine:3.20 \
  sh -c "test -f ${LIVE_PATH}/fullchain.pem && test -f ${LIVE_PATH}/privkey.pem && cp -L ${LIVE_PATH}/fullchain.pem /out/fullchain.pem && cp -L ${LIVE_PATH}/privkey.pem /out/privkey.pem && chmod 644 /out/fullchain.pem && chmod 600 /out/privkey.pem"

# Ensure the ubuntu deploy user can read certs when mounting into nginx.
chmod 755 "${CERT_DIR}" 2>/dev/null || true

echo "Wrote:"
echo "  ${CERT_DIR}/fullchain.pem"
echo "  ${CERT_DIR}/privkey.pem"
echo
echo "Next:"
echo "  docker compose up -d --build"
echo "  docker exec hirance-nginx nginx -s reload"
echo "Reload if nginx is already running:"
echo "  docker exec hirance-nginx nginx -s reload"
