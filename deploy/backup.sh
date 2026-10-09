#!/usr/bin/env bash
# Back up the question log from the running api container (run on the server, next to
# compose.yml). Writes a consistent copy into the volume's backups/ folder and keeps the newest
# KEEP_BACKUPS (default 14); the site stays up. For a nightly backup, add to the host's crontab:
#
#   30 3 * * * cd /srv/starwars-run && ./backup.sh >> backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")"
docker compose exec -T api node api.mjs backup
