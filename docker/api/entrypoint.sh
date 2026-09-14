#!/bin/sh
set -eu
export PATH="/app/node_modules/.bin:${PATH}"
echo "Running prisma migrate deploy..."
prisma migrate deploy
echo "Starting API..."
exec "$@"
