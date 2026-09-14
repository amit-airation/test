#!/usr/bin/env bash
# Bootstrap an Ubuntu EC2 instance for the Hirance competition edge.
#
# Installs Docker Engine + Compose plugin, opens 80/443 (ufw if active),
# and prepares cert directories. Run once as a sudo-capable user:
#
#   curl -fsSL ... | bash   # or:
#   sudo bash scripts/ec2-bootstrap.sh
#
# After bootstrap:
#   1. Point DNS: test.amitverma01.dev + api.test.amitverma01.dev → EIP
#   2. Open SG inbound: TCP 22 (your IP), 80, 443
#   3. Clone repo, copy production .env files
#   4. npm run ssl:cert && npm run edge:up
#   5. Start API (:3001) + web (:3000) on the host (or adjust API/WEB_UPSTREAM)

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Re-running with sudo..."
  exec sudo -E bash "$0" "$@"
fi

export DEBIAN_FRONTEND=noninteractive

echo "==> Updating apt and installing prerequisites"
apt-get update -y
apt-get install -y ca-certificates curl gnupg lsb-release

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker Engine (official apt repo)"
  install -m 0755 -d /etc/apt/keyrings
  if [[ ! -f /etc/apt/keyrings/docker.asc ]]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
  fi
  ARCH="$(dpkg --print-architecture)"
  CODENAME="$(. /etc/os-release && echo "${VERSION_CODENAME}")"
  echo \
    "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
else
  echo "==> Docker already installed: $(docker --version)"
  apt-get install -y docker-compose-plugin || true
fi

# Allow the invoking login user (not root) to use docker without sudo.
TARGET_USER="${SUDO_USER:-${USER:-}}"
if [[ -n "${TARGET_USER}" && "${TARGET_USER}" != "root" ]]; then
  usermod -aG docker "${TARGET_USER}" || true
  echo "==> Added ${TARGET_USER} to group 'docker' (re-login / newgrp docker required)"
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p \
  "${ROOT_DIR}/docker/nginx/certs" \
  "${ROOT_DIR}/docker/nginx/certbot/www" \
  "${ROOT_DIR}/docker/nginx/certbot/letsencrypt"
chown -R "${TARGET_USER:-root}:${TARGET_USER:-root}" \
  "${ROOT_DIR}/docker/nginx/certs" \
  "${ROOT_DIR}/docker/nginx/certbot" 2>/dev/null || true

if command -v ufw >/dev/null 2>&1; then
  echo "==> Configuring ufw for SSH / HTTP / HTTPS (only if ufw is active)"
  ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp >/dev/null 2>&1 || true
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  if ufw status 2>/dev/null | grep -qi 'Status: active'; then
    echo "    ufw is active; 22/80/443 allowed"
  else
    echo "    ufw is inactive — rely on the EC2 security group for 22/80/443"
  fi
fi

# host.docker.internal is provided by compose extra_hosts: host-gateway on Linux.
cat <<EOF

==> Bootstrap complete

EC2 security group (console) must allow inbound:
  - TCP 22  from your IP
  - TCP 80  from 0.0.0.0/0 (Let's Encrypt + redirect)
  - TCP 443 from 0.0.0.0/0 (UI + API)

DNS:
  test.amitverma01.dev      → this instance Elastic IP
  api.test.amitverma01.dev  → same Elastic IP

Then (as the deploy user, after re-login for docker group):
  cd ${ROOT_DIR}
  # ensure apps/api/.env + apps/web/.env.local are production-ready
  npm run ssl:cert
  npm run edge:up

API should listen on :3001 and web on :3000 on the host
(nginx reaches them via host.docker.internal).

Job server api.hirance.com →
  https://api.test.amitverma01.dev/api/integrations/job-events

Optional TLS renew cron (monthly):
  0 3 1 * * cd ${ROOT_DIR} && npm run ssl:cert:webroot && docker exec hirance-nginx nginx -s reload
EOF
