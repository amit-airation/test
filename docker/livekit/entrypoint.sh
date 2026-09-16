#!/bin/sh
# LiveKit entrypoint: always advertise a reachable public IP for ICE.
# Docker bridge + use_external_ip alone often causes:
#   NegotiationError: negotiation timed out
set -eu

CONFIG="${LIVEKIT_CONFIG:-/etc/livekit.yaml}"

NODE_IP="${LIVEKIT_NODE_IP:-}"
if [ -z "${NODE_IP}" ]; then
  NODE_IP="$(
    wget -qO- --timeout=3 https://checkip.amazonaws.com 2>/dev/null \
      || wget -qO- --timeout=3 https://api.ipify.org 2>/dev/null \
      || true
  )"
  NODE_IP="$(printf '%s' "${NODE_IP}" | tr -d '[:space:]')"
fi

if [ -z "${NODE_IP}" ]; then
  echo "ERROR: Set LIVEKIT_NODE_IP to the EC2 Elastic IP (required for screen share)." >&2
  echo "Example: LIVEKIT_NODE_IP=3.xx.xx.xx in repo-root .env" >&2
  exit 1
fi

echo "LiveKit node IP (ICE advertise): ${NODE_IP}"
exec livekit-server --config "${CONFIG}" --node-ip "${NODE_IP}"
