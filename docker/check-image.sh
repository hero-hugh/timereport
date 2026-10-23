#!/bin/sh
set -eu

# Inspect application files without networking, host mounts or application startup.
docker run --rm --network none --entrypoint sh "$1" -eu -c '
    for root in /app /usr/share/nginx/html; do
        [ -d "$root" ] || continue
        matches=$(find "$root" -type d -name node_modules -prune -o -type f \( \
            -name ".env*" -o -name "*.db*" -o -name "*.sqlite*" \
            -o -name "*.pem" -o -name "*.key" -o -name "*.p12" \
        \) -print)
        if [ -n "$matches" ]; then
            echo "Forbidden application files in image:" >&2
            printf "%s\n" "$matches" >&2
            exit 1
        fi
    done
'
