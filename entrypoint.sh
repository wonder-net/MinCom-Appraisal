#!/bin/sh
# symfony-backend/entrypoint.sh
# Runs before the main CMD in both dev and prod containers (mirrors the
# structure of ../backend/entrypoint.sh for the Django rewrite):
# 1. Waits for the database to accept connections (engine-agnostic — goes
#    through Doctrine DBAL, so this works unchanged against MySQL or Postgres).
# 2. Generates JWT signing keys if missing (first-run only, idempotent).
# 3. Applies pending Doctrine migrations.
# 4. Bootstraps the initial admin user (first-run only, opt-in via env vars —
#    a minimal stand-in for Django's bootstrap_admin, see
#    src/Command/BootstrapAdminCommand.php).
# 5. Bootstraps a narrow, investigative-only /admin superuser (first-run
#    only, opt-in via env vars — port of Django's bootstrap_superuser,
#    see src/Command/BootstrapSuperuserCommand.php).
# 6. Hands off to the CMD passed by docker-compose / docker run.
#
# Set SKIP_INIT=true to skip steps 2-4 — the messenger-consume container
# shares this image but must not race with the php container over
# migrations/keypair generation during parallel startup.

set -e

echo "Waiting for the database..."
until php bin/console dbal:run-sql "SELECT 1" --quiet > /dev/null 2>&1; do
    echo "Database not ready — retrying in 2s..."
    sleep 2
done
echo "Database is ready."

if [ "${SKIP_INIT:-false}" != "true" ]; then
    # NOTE: config/jwt/ must be a persistent volume (or bind mount) in any
    # real deployment. If it's left on the container's ephemeral
    # filesystem, every restart mints a new keypair, invalidating every
    # outstanding access/refresh token, and multiple replicas would each
    # sign with a different key. docker-compose.yml's local dev setup is
    # fine as-is (the whole repo, including config/jwt/, is bind-mounted
    # from the host) — this only matters for a standalone/prod deployment
    # of this image, which is out of scope here (see project gap list).
    echo "Ensuring JWT signing keys exist..."
    php bin/console lexik:jwt:generate-keypair --skip-if-exists --no-interaction

    echo "Running migrations..."
    php bin/console doctrine:migrations:migrate --no-interaction

    if [ -n "${BOOTSTRAP_ADMIN_EMAIL:-}" ] && [ -n "${BOOTSTRAP_ADMIN_PASSWORD:-}" ]; then
        echo "Bootstrapping initial admin..."
        php bin/console app:bootstrap-admin \
            --email="${BOOTSTRAP_ADMIN_EMAIL}" \
            --password="${BOOTSTRAP_ADMIN_PASSWORD}" \
            --name="${BOOTSTRAP_ADMIN_NAME:-System Administrator}"
    fi

    if [ -n "${BOOTSTRAP_SUPERUSER_EMAIL:-}" ] && [ -n "${BOOTSTRAP_SUPERUSER_PASSWORD:-}" ]; then
        echo "Bootstrapping investigative-only /admin superuser..."
        php bin/console app:bootstrap-superuser \
            --email="${BOOTSTRAP_SUPERUSER_EMAIL}" \
            --password="${BOOTSTRAP_SUPERUSER_PASSWORD}"
    fi
fi

# ---------------------------------------------------------------------------
# Execute the container CMD
# ---------------------------------------------------------------------------
exec "$@"
