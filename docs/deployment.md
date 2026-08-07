# MINCOM Appraisal Platform — Deployment Runbook

This document is the authoritative step-by-step guide for deploying the MINCOM Employee
Performance Appraisal Platform to a fresh DigitalOcean Droplet. Follow every numbered step
in order. All commands use absolute paths.

---

## 1. Prerequisites

| Requirement | Detail |
|---|---|
| DigitalOcean account | With billing enabled and a project created |
| Domain name | DNS A record pointing to the Droplet IP (see Step 2) |
| SSH key pair | Public key uploaded to DigitalOcean; private key on your local machine |
| GitHub PAT | Personal Access Token with `write:packages` scope for pushing to GHCR |
| Local tools | `ssh`, `openssl`, `docker` (for local testing only) |

---

## 2. Droplet Provisioning

1. Log in to the DigitalOcean Control Panel at `https://cloud.digitalocean.com`.

2. Create a new Droplet:
   - **Image:** Ubuntu 22.04 LTS (x64)
   - **Size:** 4 GB RAM / 2 vCPUs minimum (s-2vcpu-4gb or larger)
   - **Region:** Choose the region closest to your users
   - **VPC Network:** Create or select a private VPC network
   - **Authentication:** SSH key — select the key uploaded to your account
   - **Hostname:** `mincom-appraisal-prod`

3. Note the assigned IPv4 address. Add a DNS A record:

   ```
   appraisal.<your-domain.com>   IN  A  <DROPLET_IPv4>
   ```

4. Set the following GitHub Actions secrets in your repository under
   **Settings → Secrets and variables → Actions**:

   | Secret name | Value |
   |---|---|
   | `DO_DROPLET_IP` | The Droplet's IPv4 address |
   | `DO_SSH_USER` | `root` (initial) or `mincom` (hardened) |
   | `DO_SSH_PRIVATE_KEY` | Contents of your PEM private key |
   | `GHCR_TOKEN` | GitHub PAT with `write:packages` scope |

---

## 3. Server Setup

SSH into the Droplet:

```bash
ssh root@<DROPLET_IPv4>
```

1. Update the package index and install Docker Engine:

   ```bash
   apt-get update
   apt-get install -y ca-certificates curl gnupg lsb-release
   install -m 0755 -d /etc/apt/keyrings
   curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
     | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
   chmod a+r /etc/apt/keyrings/docker.gpg
   echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
     https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
     > /etc/apt/sources.list.d/docker.list
   apt-get update
   apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   ```

2. Verify Docker is running:

   ```bash
   docker version
   docker compose version
   ```

3. Create the application directory and system user:

   ```bash
   useradd --system --no-create-home --shell /bin/false --uid 1001 mincom
   mkdir -p /opt/mincom
   chown root:root /opt/mincom
   chmod 755 /opt/mincom
   ```

4. Add your SSH public key to `root`'s authorized keys (it should already be there
   from Droplet provisioning). For a hardened setup, add it for the `mincom` user:

   ```bash
   mkdir -p /home/mincom/.ssh
   cp /root/.ssh/authorized_keys /home/mincom/.ssh/authorized_keys
   chown -R mincom:mincom /home/mincom/.ssh
   chmod 700 /home/mincom/.ssh
   chmod 600 /home/mincom/.ssh/authorized_keys
   ```

---

## 4. Clone Repository

```bash
git clone https://github.com/<ORG>/mincom-appraisal.git /opt/mincom
cd /opt/mincom
```

---

## 5. Environment Configuration

1. Copy the example file to `.env`:

   ```bash
   cp /opt/mincom/.env.example /opt/mincom/.env
   chmod 600 /opt/mincom/.env
   ```

2. Edit `/opt/mincom/.env` and fill in every variable. Key values to set
   (see `.env.example` in the repo root for the authoritative list and
   comments — this table only calls out the ones that trip people up):

   | Variable | Value |
   |---|---|
   | `APP_SECRET` | Output of `openssl rand -hex 32` |
   | `DATABASE_URL` | `mysql://mincom:<DB_PASSWORD>@db:3306/mincom_appraisal?serverVersion=8.0.32&charset=utf8mb4` |
   | `DB_PASSWORD` | A strong random password (must match the password in `DATABASE_URL`) |
   | `REDIS_URL` | `rediss://:<REDIS_PASSWORD>@redis:6380/0?ssl_cert_reqs=none` (TLS port) |
   | `MESSENGER_TRANSPORT_DSN` | `rediss://redis:6380/2?ssl[verify_peer]=0&ssl[verify_peer_name]=0` (same `rediss://` scheme as `REDIS_URL`, but with bracketed `ssl[...]` query params rather than `ssl_cert_reqs` — Symfony's redis-messenger transport parses TLS options differently than the cache adapter) |
   | `REDIS_PASSWORD` | A strong random password (must match `REDIS_URL`/`MESSENGER_TRANSPORT_DSN`; no literal `"` character) |
   | `JWT_PASSPHRASE` | Output of `openssl rand -hex 32` — the keypair itself is generated automatically on first boot (see Step 6) |
   | `FIELD_ENCRYPTION_KEY` | Output of `openssl rand -hex 32` |
   | `AUDIT_HMAC_KEY` | Output of `openssl rand -hex 32` (must differ from `FIELD_ENCRYPTION_KEY` and `APP_SECRET`) |
   | `MAILER_DSN` | `smtp://<postmark-server-token>:<postmark-server-token>@smtp.postmarkapp.com:587` (the Postmark server token is used as both username and password; percent-encode any `@` in it as `%40`) |
   | `MAILER_FROM_ADDRESS` | A verified Postmark Sender Signature address |
   | `POSTMARK_MESSAGE_STREAM` | `outbound` |
   | `TURNSTILE_SECRET_KEY` | Your Cloudflare Turnstile secret (blank disables CAPTCHA verification) |
   | `SENTRY_DSN` | Your Sentry project DSN |
   | `ENVIRONMENT` | `production` |
   | `APP_VERSION` | Leave empty; CI/CD sets this at deploy time |
   | `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` / `BOOTSTRAP_ADMIN_NAME` | First-run HR/System Admin account (ignored once any admin user exists) |
   | `BOOTSTRAP_SUPERUSER_EMAIL` / `BOOTSTRAP_SUPERUSER_PASSWORD` | Optional investigative-only `/admin` account — leave blank if not needed |
   | `MYSQL_USER` | `mincom` |
   | `MYSQL_DATABASE` | `mincom_appraisal` |

   There is no Symfony equivalent of Django's `DEBUG`, `ALLOWED_HOSTS`, or
   `DJANGO_SETTINGS_MODULE` — `APP_ENV=prod` (already set in
   `docker-compose.prod.yml`) covers environment selection, and Symfony
   trusts all hosts by default behind the bundled nginx.

---

## 6. JWT Signing Keys

The application signs authentication tokens with an RS256 key pair
(lexik/jwt-authentication-bundle). Unlike the old Django setup, there
is no manual key generation step and no `secrets/jwt_private.pem` /
`secrets/jwt_public.pem` files to create — `symfony-backend/entrypoint.sh`
generates the keypair automatically on first container boot (idempotent;
it skips generation if a keypair already exists) and persists it in the
named Docker volume `symfony_jwt_keys`, mounted at
`/app/config/jwt` inside the `php` service.

All you need to provide is the passphrase that protects the keypair:

```bash
# In /opt/mincom/.env
JWT_PASSPHRASE=<output of `openssl rand -hex 32`>
```

> **The `symfony_jwt_keys` volume must persist across container
> recreation/redeploys.** If it's ever removed, every restart mints a
> new keypair, invalidating every outstanding access/refresh token, and
> (in a multi-replica setup) each replica would sign with a different
> key. Do not run `docker compose down -v` on this volume in production.
> Back up `JWT_PASSPHRASE` itself to a secure secrets manager (e.g.,
> DigitalOcean Spaces with SSE, HashiCorp Vault, or 1Password Secrets
> Automation) — losing it makes the persisted keypair undecryptable.

---

## 7. GHCR Authentication

Authenticate the Docker daemon on the Droplet so it can pull images from GHCR:

```bash
echo <GHCR_TOKEN> | docker login ghcr.io -u <GITHUB_USERNAME> --password-stdin
```

This writes credentials to `/root/.docker/config.json` (or `~mincom/.docker/config.json`
for the service user). Verify with:

```bash
docker pull ghcr.io/ejay4u/mincom-appraisal/symfony-backend:<APP_VERSION>
```

---

## 8. First Start

Doctrine migrations run automatically via the container entrypoint
(`symfony-backend/entrypoint.sh` runs `php bin/console
doctrine:migrations:migrate --no-interaction` before handing off to the
container's CMD) — no manual migration step is required.

```bash
cd /opt/mincom
export APP_VERSION=<short-sha-or-tag>
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Wait for all 7 services to reach a healthy state:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

Expected output shows `Up` or `running` for: `nginx`, `backend`, `php`,
`messenger-consume-scheduler`, `messenger-consume-notifications`, `db`, `redis`.
(`backend` is Symfony's own inner nginx, proxying to `php` — the actual
application container — via FastCGI; `messenger-consume-scheduler` and
`messenger-consume-notifications` replace Celery/Celery Beat, running
`php bin/console messenger:consume async scheduler_main` and
`php bin/console messenger:consume notification_email` respectively.)

---

## 9. Seed Data

No manual step is required here. Reference data (BSC Perspectives,
Competencies, Score Descriptors) ships as data migrations under
`symfony-backend/migrations/` and is applied automatically as part of
Step 8's `doctrine:migrations:migrate` run, alongside the initial
`BOOTSTRAP_ADMIN_*`/`BOOTSTRAP_SUPERUSER_*` account bootstrap (also
run automatically by the entrypoint — see `docs/ops/django-admin.md`
for details on those two commands).

`php bin/console app:seed-dev-data` exists but is for local
development/demo data only (sample employees, an in-progress appraisal
cycle, etc.) — do **not** run it against production.

---

## 10. SSL Certificate Provisioning

### Install Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### Verify DNS

Confirm the domain resolves to the Droplet's IP before requesting a certificate:

```bash
dig +short <your-domain.com>
# Must return the Droplet's IPv4 address
```

### Issue the Certificate

```bash
sudo certbot --nginx -d <your-domain.com> -d www.<your-domain.com>
```

Replace `<your-domain.com>` with the production domain. Certbot modifies the Nginx
config automatically and registers auto-renewal.

### Fix Read Permissions for Rootless Nginx Container

The Nginx container runs as UID 1001 (non-root). Certbot sets `/etc/letsencrypt/live/`
to `0700` (root-only). Grant world-read/execute access after issuance:

```bash
sudo chmod -R o+rx /etc/letsencrypt/live/ /etc/letsencrypt/archive/
```

Run this command again after every certificate renewal.

### Restart Nginx to Load the New Certificate

```bash
docker compose -f /opt/mincom/docker-compose.yml -f /opt/mincom/docker-compose.prod.yml \
  restart nginx
```

### Certificate Paths Used by Nginx

```
/etc/letsencrypt/live/<your-domain.com>/fullchain.pem
/etc/letsencrypt/live/<your-domain.com>/privkey.pem
```

These paths are mounted read-only into the Nginx container via:

```yaml
- /etc/letsencrypt:/etc/letsencrypt:ro
```

### Automatic Renewal

Certbot installs a systemd timer or cron job at `/etc/cron.d/certbot` that runs
`certbot renew` twice daily. No manual action is required.

### Renewal Test

```bash
sudo certbot renew --dry-run
```

This command must exit 0. Run it after the initial setup to confirm the renewal
configuration is working correctly.

---

## 11. Smoke Test

1. Check all 7 services are running:

   ```bash
   docker compose -f /opt/mincom/docker-compose.yml -f /opt/mincom/docker-compose.prod.yml ps
   ```

   Expected: `nginx`, `backend`, `php`, `messenger-consume-scheduler`,
   `messenger-consume-notifications`, `db`, `redis` all show `Up` or `running`.

2. Verify the health endpoint responds:

   ```bash
   curl -sf https://<your-domain.com>/api/v1/health/ | python3 -m json.tool
   ```

3. Test API login:

   ```bash
   curl -X POST https://<your-domain.com>/api/v1/auth/login/ \
     -H "Content-Type: application/json" \
     -d '{"identifier": "<ADMIN_EMAIL>", "password": "<ADMIN_PASSWORD>"}' \
     | python3 -m json.tool
   ```

   A successful response returns `access` and `refresh` tokens.

4. Check application logs for errors:

   ```bash
   docker compose -f /opt/mincom/docker-compose.yml -f /opt/mincom/docker-compose.prod.yml \
     logs --tail=50 php
   ```

   (`backend` only carries nginx's own access/error logs; application
   errors and Monolog output come from the `php` service.)

---

## 12. Subsequent Deployments

All deployments after the first are handled automatically by the CI/CD pipeline.
On every push to `main`, GitHub Actions:

1. Builds and pushes images to GHCR (`.github/workflows/deploy.yml`, `build-and-push` job)
2. SSHes to the Droplet and runs `docker compose pull && docker compose up -d` (`deploy` job)

No manual intervention is required. To trigger a manual redeploy:

```bash
cd /opt/mincom
export APP_VERSION=<target-sha-or-tag>
export GITHUB_REPOSITORY_OWNER=<your-org-name>
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

## Backup and Restore

### Scheduling Backups

Add the backup script to the root crontab on the Droplet:

```bash
crontab -e
```

Append the following line:

```
0 2 * * * /opt/mincom/scripts/backup.sh >> /var/log/mincom_backup.log 2>&1
```

This runs the backup daily at 02:00 UTC. The script retains 30 daily dumps and
deletes files older than 30 days automatically.

### Verifying a Backup

1. List backup files:

   ```bash
   ls -lh /opt/mincom/backups/
   ```

2. Test the integrity of a dump file (must exit 0):

   ```bash
   gunzip -t /opt/mincom/backups/<FILENAME>.sql.gz
   ```

### Restore Procedure

1. Stop application services (leave `db` and `redis` running):

   ```bash
   docker compose -f /opt/mincom/docker-compose.yml -f /opt/mincom/docker-compose.prod.yml \
     stop backend php messenger-consume-scheduler messenger-consume-notifications
   ```

2. Restore the database from a dump:

   ```bash
   gunzip -c /opt/mincom/backups/<FILENAME>.sql.gz \
     | docker compose -f /opt/mincom/docker-compose.yml -f /opt/mincom/docker-compose.prod.yml \
       exec -T -e MYSQL_PWD="$DB_PASSWORD" db mysql -u "$MYSQL_USER" "$MYSQL_DATABASE"
   ```

   Source `.env` first to ensure `$DB_PASSWORD`, `$MYSQL_USER`, and `$MYSQL_DATABASE` are
   in scope (`MYSQL_PWD` avoids the password showing up in `ps` output, the same concern
   the old Postgres `PGPASSWORD` pattern had):

   ```bash
   source /opt/mincom/.env
   ```

3. Restart all services:

   ```bash
   docker compose -f /opt/mincom/docker-compose.yml -f /opt/mincom/docker-compose.prod.yml \
     up -d
   ```

4. Run the post-restore smoke test (see section below).

### FIELD_ENCRYPTION_KEY — Critical Warning

> **WARNING:** The `FIELD_ENCRYPTION_KEY` in `.env` encrypts all PII fields in the
> database. If this key is lost, all encrypted employee data is permanently
> unrecoverable even with a valid database backup. The key MUST be backed up
> separately from the database dump — store it in a secrets manager (e.g.,
> DigitalOcean Secrets, HashiCorp Vault, or an offline secure location). Never
> store the encryption key in the same location as the database backup.

Checklist for key custody:
- [ ] `FIELD_ENCRYPTION_KEY` stored in a secrets manager before go-live
- [ ] At least two authorised personnel have access to the key
- [ ] Key rotation procedure documented in the team runbook
- [ ] Key value confirmed different from `APP_SECRET` and `AUDIT_HMAC_KEY`

### Post-Restore Smoke Test

1. Validate the schema and container configuration:

   ```bash
   docker compose -f /opt/mincom/docker-compose.yml -f /opt/mincom/docker-compose.prod.yml \
     exec php bin/console doctrine:schema:validate
   ```

   Must exit 0 with no errors (confirms the restored database matches the
   applied Doctrine migrations).

2. Verify the health endpoint:

   ```bash
   curl -sf https://<your-domain.com>/api/v1/health/
   ```

3. Attempt login with a known account to confirm PII decryption is working
   (this exercises the `FIELD_ENCRYPTION_KEY` path):

   ```bash
   curl -X POST https://<your-domain.com>/api/v1/auth/login/ \
     -H "Content-Type: application/json" \
     -d '{"identifier": "<KNOWN_EMAIL>", "password": "<KNOWN_PASSWORD>"}'
   ```

   A `200 OK` with token fields confirms the encryption key is correct and data
   is readable.
