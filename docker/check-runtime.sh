#!/bin/sh
set -eu

# Smoke-test only synthetic credentials and disposable in-memory databases.
IMAGE="$1"
CONTAINER="time-report-security-$$"
LOG=$(mktemp)
cleanup() {
	docker rm -fv "$CONTAINER" >/dev/null 2>&1 || true
	rm -f "$LOG"
}
trap cleanup EXIT

docker run -d --name "$CONTAINER" --network none --read-only \
	--tmpfs /data:mode=0755 --tmpfs /tmp \
	-e DATABASE_DIR=/data -e AUTH_DATABASE_URL=file:/data/auth.db \
	-e USER_DATABASE_URL=file:/data/placeholder.db \
	-e JWT_SECRET=container-test-access-secret-at-least-32-characters \
	-e JWT_REFRESH_SECRET=container-test-refresh-secret-at-least-32-characters \
	-e TOKEN_ENCRYPTION_KEY=dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHQ= \
	-e FRONTEND_URL=https://example.test "$IMAGE" >/dev/null

ready=false
for attempt in $(seq 1 30); do
	if docker exec "$CONTAINER" node -e 'fetch("http://127.0.0.1:3000/api/health").then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))' >/dev/null 2>&1; then
		ready=true
		break
	fi
	sleep 1
done
if [ "$ready" != true ]; then
	docker logs "$CONTAINER" >&2
	exit 1
fi
docker exec "$CONTAINER" sh -eu -c '
	uid=$(awk "/^Uid:/ {print \$2}" /proc/1/status)
	[ "$uid" = 1001 ]
	[ "$(stat -c %a /data/auth.db)" = 600 ]
'
docker rm -fv "$CONTAINER" >/dev/null

# A read-only data directory must stop startup before Prisma or Node runs.
if docker run --rm --network none --read-only -e DATABASE_DIR=/usr/local \
	"$IMAGE" >"$LOG" 2>&1; then
	echo 'Startup unexpectedly succeeded with an unwritable data directory' >&2
	exit 1
fi
if grep -q 'running as UID=' "$LOG"; then
	echo 'Startup continued after a data-directory permission failure' >&2
	exit 1
fi

# A failed privilege drop must also stop startup, even on a writable volume.
if docker run --rm --network none --cap-drop=SETUID --tmpfs /data \
	-e DATABASE_DIR=/data "$IMAGE" >"$LOG" 2>&1; then
	echo 'Startup unexpectedly succeeded without permission to drop privileges' >&2
	exit 1
fi
if grep -q 'running as UID=' "$LOG"; then
	echo 'Startup continued after a failed privilege drop' >&2
	exit 1
fi
echo 'Runtime checks passed: UID 1001, private database files, fail-closed startup'
