#!/bin/sh
set -e

# The persistent data dir is configured by CapRover. Fall back to /app/data
# for local Docker runs that use the Dockerfile's VOLUME.
DATA_DIR="${DATABASE_DIR:-/app/data}"

echo "[entrypoint] v3 starting as UID=$(id -u)"
# Logga bara set/unset för env-vars som kan innehålla credentials (t.ex. en
# framtida Postgres-URL), så de inte läcker till container-loggar.
env_status() {
	if [ -n "$2" ]; then
		echo "[entrypoint] $1: set"
	else
		echo "[entrypoint] $1: <unset>"
	fi
}
env_status "DATA_DIR" "$DATA_DIR"
env_status "AUTH_DATABASE_URL" "$AUTH_DATABASE_URL"

# New database files must not be readable by unrelated users.
umask 077

# Stop on ownership errors instead of ever running the API as root.
if [ "$(id -u)" = "0" ]; then
    mkdir -p "$DATA_DIR"
    chown -R app:app "$DATA_DIR"
    chmod u+rwx "$DATA_DIR"
    exec su-exec app "$0" "$@"
fi

if [ ! -w "$DATA_DIR" ]; then
    echo "[entrypoint] Database directory is not writable; refusing to start" >&2
    exit 1
fi

echo "[entrypoint] running as UID=$(id -u)"

npx prisma db push \
	--schema=apps/api/prisma/central/schema.prisma \
	--skip-generate

exec node apps/api/dist/index.js
