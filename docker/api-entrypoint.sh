#!/bin/sh
set -e

# Runs as root to fix ownership on the persistent /app/data volume
# (volumes provisioned by older root-owned deploys won't be writable by the
# unprivileged `app` user otherwise). Errors are ignored on read-only FS.
if [ "$(id -u)" = "0" ]; then
	chown -R app:app /app/data 2>/dev/null || true
	exec su-exec app "$0" "$@"
fi

# Running as app user from here on.
npx prisma db push \
	--schema=apps/api/prisma/central/schema.prisma \
	--skip-generate

exec node apps/api/dist/index.js
