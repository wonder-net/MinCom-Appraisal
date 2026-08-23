#!/usr/bin/env bash
#
# scripts/backup.sh — nightly MySQL dump for the MINCOM Appraisal
# production database. Scheduled via cron (see docs/deployment.md,
# "Backup and Restore" section):
#
#   0 2 * * * /opt/mincom/scripts/backup.sh >> /var/log/mincom_backup.log 2>&1
#
# Dumps via `docker compose exec` into the running `db` service (no
# separate mysql client needed on the host), gzips the result, verifies
# the archive isn't corrupt, and prunes dumps older than RETENTION_DAYS.
#
# Reads DB credentials from .env.prod.local. MYSQL_PWD (rather than
# mysqldump's own --password flag) keeps the password out of `ps`
# output — same reasoning the restore procedure in docs/deployment.md
# already uses for the mysql client on the way back in.
#
# --routines --triggers matters here: the very first migration
# installs SIGNAL-based triggers (see docker-compose.prod.yml's comment
# on --log-bin-trust-function-creators) — a dump without them would
# restore an incomplete schema.
set -euo pipefail

APP_DIR="/opt/mincom"
BACKUP_DIR="${APP_DIR}/backups"
RETENTION_DAYS=30
COMPOSE_FILE="${APP_DIR}/docker-compose.prod.yml"

cd "$APP_DIR"

# shellcheck disable=SC1091
source "${APP_DIR}/.env.prod.local"

: "${MYSQL_USER:?MYSQL_USER not set in .env.prod.local}"
: "${MYSQL_PASSWORD:?MYSQL_PASSWORD not set in .env.prod.local}"
: "${MYSQL_DATABASE:?MYSQL_DATABASE not set in .env.prod.local}"

mkdir -p "$BACKUP_DIR"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump_file="${BACKUP_DIR}/mincom_appraisal_${timestamp}.sql.gz"

log() {
    echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"
}

log "Starting backup -> ${dump_file}"

docker compose -f "$COMPOSE_FILE" exec -T -e MYSQL_PWD="${MYSQL_PASSWORD}" db \
    mysqldump -u "${MYSQL_USER}" --single-transaction --quick --routines --triggers "${MYSQL_DATABASE}" \
    | gzip > "$dump_file"

# Fail loudly if the dump is empty/corrupt rather than silently keeping
# a useless backup file around for 30 days undetected.
gunzip -t "$dump_file"

log "Backup OK ($(du -h "$dump_file" | cut -f1))"

# Prune anything older than RETENTION_DAYS.
deleted=$(find "$BACKUP_DIR" -name 'mincom_appraisal_*.sql.gz' -mtime "+${RETENTION_DAYS}" -print -delete)
if [ -n "$deleted" ]; then
    log "Pruned backups older than ${RETENTION_DAYS} days:"
    echo "$deleted"
fi

log "Backup complete."
