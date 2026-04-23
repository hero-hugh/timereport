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

# Phase 1: running as root — normalize volume ownership, then drop to app.
if [ "$(id -u)" = "0" ]; then
	mkdir -p "$DATA_DIR"

	echo "[entrypoint] $DATA_DIR before chown:"
	ls -la "$DATA_DIR" 2>&1 || true

	if chown -R app:app "$DATA_DIR" 2>&1; then
		echo "[entrypoint] chown $DATA_DIR OK"
	else
		echo "[entrypoint] WARN: chown $DATA_DIR failed"
	fi
	chmod u+rwx,g+rwx "$DATA_DIR" 2>&1 || true

	echo "[entrypoint] $DATA_DIR after chown:"
	ls -la "$DATA_DIR" 2>&1 || true

	# Verify app user can write; fall back to root if not (log loud warning).
	if su-exec app sh -c "touch $DATA_DIR/.perm-test && rm $DATA_DIR/.perm-test" 2>/dev/null; then
		echo "[entrypoint] app user can write — dropping privileges"
		exec su-exec app "$0" "$@"
	else
		echo "[entrypoint] WARN: app cannot write to $DATA_DIR — running as root"
	fi
fi

echo "[entrypoint] phase 2 running as UID=$(id -u)"

npx prisma db push \
	--schema=apps/api/prisma/central/schema.prisma \
	--skip-generate

exec node apps/api/dist/index.js
