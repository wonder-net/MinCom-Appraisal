# MINCOM Appraisal Platform — On-Premise Deployment Guide

Audience: system administrators deploying to a DigitalOcean Droplet or equivalent bare-metal/VM host running Ubuntu 22.04 LTS.

---

## Table of Contents

1. [Server Requirements](#1-server-requirements)
2. [Architecture Overview](#2-architecture-overview)
3. [Pre-deployment Setup](#3-pre-deployment-setup)
4. [Environment Configuration](#4-environment-configuration)
5. [Docker Compose Production](#5-docker-compose-production)
6. [First Deployment Steps](#6-first-deployment-steps)
7. [Email Configuration](#7-email-configuration)
8. [SSL/TLS Setup](#8-ssltls-setup)
9. [Backup Strategy](#9-backup-strategy)
10. [Monitoring and Maintenance](#10-monitoring-and-maintenance)
11. [Security Checklist](#11-security-checklist)

---

## 1. Server Requirements

### Minimum Hardware

| Resource | Minimum       | Recommended   |
|----------|---------------|---------------|
| vCPUs    | 2             | 4             |
| RAM      | 4 GB          | 8 GB          |
| Disk     | 40 GB SSD     | 80 GB SSD     |
| Network  | 1 Gbps        | 1 Gbps        |

DigitalOcean equivalent: `s-2vcpu-4gb` (minimum), `s-4vcpu-8gb` (recommended).

### Operating System

Ubuntu 22.04 LTS (64-bit). Other Debian-based distributions are supported but untested.

### Required Software

| Software              | Version | Notes                                    |
|-----------------------|---------|------------------------------------------|
| Docker Engine         | 26.x+   | Install via official Docker repository   |
| Docker Compose plugin | 2.27+   | Bundled with Docker Engine               |
| Git                   | 2.x+    | For cloning the repository               |
| Certbot               | 2.x+    | Let's Encrypt TLS certificate management |
| python3-certbot-nginx | any     | Certbot nginx plugin                     |
| openssl               | 3.x+    | For generating cryptographic keys        |
| cron                  | any     | For scheduled backups                    |

### Firewall — Required Open Ports (Inbound)

| Port | Protocol | Source     | Purpose                                             |
|------|----------|------------|-----------------------------------------------------|
| 22   | TCP      | Admin IPs  | SSH access                                          |
| 80   | TCP      | 0.0.0.0/0  | HTTP (Certbot ACME challenge, redirect to HTTPS)    |
| 443  | TCP      | 0.0.0.0/0  | HTTPS (application traffic)                         |

All other inbound ports must be blocked. The database (3306), Redis (6380), and PHP-FPM (9000) ports are bound only to the Docker internal network and must not be reachable from the public internet.

```bash
# UFW example
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## 2. Architecture Overview

All services run as Docker containers managed by Docker Compose. There is no external managed database or managed Redis — both run as containers on the same host.

```
Internet
    |
    | 80 / 443 (host ports bound by backend container)
    v
+------------------------------+
|  backend container           |
|  (nginx:alpine, UID 1001)    |
|  - TLS termination           |
|  - Serves the built React    |
|    SPA's static files        |
|  - fastcgi_pass to php:9000  |
|    for /api and /admin       |
+------------------------------+
    |
    | Docker bridge network: internal
    | (internal: true — no public routing, no NAT)
    |
    +-------> php container (Symfony PHP-FPM app, UID 1001)
    |          :9000 (internal only)
    |
    +-------> db container (mysql:8.0)
    |          :3306 (internal only)
    |
    +-------> redis container (redis:7-alpine)
    |          :6380 TLS (internal only, no plain-text port)
    |
    +-------> messenger-consume-notifications container (same image as php)
    |          runs `messenger:consume notification_email` — background email worker
    |
    +-------> messenger-consume-scheduler container (same image as php)
               runs `messenger:consume async scheduler_main` — periodic task
               consumer (MUST be 1 instance)

Named Docker Volumes:
  mysql_data        -- MySQL data files
  redis_data        -- Redis RDB snapshots
  symfony_jwt_keys  -- Auto-generated JWT signing keypair, mounted at
                       /app/config/jwt in the php service. MUST persist
                       across redeploys/restarts — losing it invalidates
                       every outstanding access/refresh token.

Host bind mounts (read-only):
  /etc/letsencrypt  --> backend container (TLS certificates)
  ./secrets/        --> backend container (bundled HTTPS cert/key),
                         redis container (Redis TLS cert/key)
```

Container images are pulled from GitHub Container Registry (GHCR):

- `ghcr.io/ejay4u/mincom-appraisal/symfony-backend:<tag>` — the Symfony PHP-FPM application (`php`, `messenger-consume-scheduler`, and `messenger-consume-notifications` services all share this image, differing only in their `command`)
- `ghcr.io/ejay4u/mincom-appraisal/web:<tag>` — the single public web tier: nginx with the compiled React SPA baked in, TLS termination, and FastCGI routing to `php` for `/api` and `/admin` (the `backend` service)

The `<tag>` is the 7-character Git commit SHA set by CI/CD.

---

## 3. Pre-deployment Setup

### 3.1 Install Docker Engine

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin

# Add deploy user to docker group (re-login required after this)
sudo usermod -aG docker $USER
```

Verify: `docker compose version` should report 2.27 or later.

### 3.2 Install Certbot

```bash
sudo apt-get install -y certbot python3-certbot-nginx
```

### 3.3 Clone the Repository

```bash
sudo git clone https://github.com/ejay4u/mincom-appraisal.git /opt/mincom-appraisal
sudo chown -R $USER:$USER /opt/mincom-appraisal
cd /opt/mincom-appraisal
```

### 3.4 Authenticate with GHCR

A GitHub Personal Access Token (PAT) with `read:packages` scope is required to pull images.

```bash
echo "<GITHUB_PAT>" | docker login ghcr.io -u <github-username> --password-stdin
```

### 3.5 DNS Configuration

Create an A record pointing your domain to the server's public IP before issuing TLS certificates.

| Type | Name                              | Value           |
|------|-----------------------------------|-----------------|
| A    | appraisal.mincom.example.com      | `<server-ip>`   |

Verify propagation before continuing:

```bash
dig +short appraisal.mincom.example.com
# Must return the server's public IP
```

---

## 4. Environment Configuration

### 4.1 Create the .env File

```bash
cp /opt/mincom-appraisal/.env.example /opt/mincom-appraisal/.env
chmod 600 /opt/mincom-appraisal/.env
```

### 4.2 Generate Required Secrets

Run each command and paste the output into the corresponding variable in `.env`.

**APP_SECRET** — Symfony's own framework secret (CSRF tokens, signed URIs, etc.).
```bash
openssl rand -hex 32
```

**FIELD_ENCRYPTION_KEY** — AES-256-GCM key for field-level PII encryption.
WARNING: If this key is lost, all encrypted data (employee names, comments) is permanently unreadable.
```bash
openssl rand -hex 32
```

**AUDIT_HMAC_KEY** — HMAC-SHA256 key for audit log integrity.
```bash
openssl rand -hex 32
```

**DB_PASSWORD**
```bash
openssl rand -base64 32 | tr -d '/+="'
```

**REDIS_PASSWORD**
```bash
openssl rand -base64 32 | tr -d '/+="'
```

**JWT_PASSPHRASE** — passphrase protecting the JWT signing keypair (RS256, lexik/jwt-authentication-bundle).
```bash
openssl rand -hex 32
```

There is no manual RSA keypair generation step. The keypair itself is
generated automatically on first container boot by `symfony-backend/entrypoint.sh`
(`php bin/console lexik:jwt:generate-keypair --skip-if-exists --no-interaction`),
using the `JWT_PASSPHRASE` above, into the named Docker volume `symfony_jwt_keys`
mounted at `/app/config/jwt` in the `php` service. This is idempotent — it only
runs once — but the volume itself **must persist across redeploys**: losing it
invalidates every outstanding access/refresh token, and a multi-replica setup
would have each replica sign with a different key.

**Redis TLS Certificate** — used by the Redis container to encrypt connections on port 6380. `--tls-auth-clients no` means no client certificate is required; TLS encrypts the transport and the password authenticates the client.

```bash
openssl req -x509 -newkey rsa:4096 -days 3650 -nodes \
  -keyout /opt/mincom-appraisal/secrets/redis_tls_key.pem \
  -out /opt/mincom-appraisal/secrets/redis_tls_cert.pem \
  -subj "/CN=redis-internal"

chmod 600 /opt/mincom-appraisal/secrets/redis_tls_key.pem
chmod 644 /opt/mincom-appraisal/secrets/redis_tls_cert.pem
```

Verify the secrets directory:
```bash
ls -la /opt/mincom-appraisal/secrets/
# Expected:
#   600 redis_tls_key.pem
#   644 redis_tls_cert.pem
#   (plus ssl_cert.pem / ssl_key.pem for the backend container's HTTPS listener)
```

### 4.3 Full Environment Variable Reference

Edit `/opt/mincom-appraisal/.env`. Variables marked **REQUIRED** have no fallback; the application will refuse to start if they are missing or invalid.

#### Symfony Core

| Variable       | Required | Description                                                              |
|----------------|----------|---------------------------------------------------------------------------|
| `APP_SECRET`   | REQUIRED | Symfony's framework signing secret (CSRF tokens, signed URIs). Generate with `openssl rand -hex 32`. |
| `FRONTEND_URL` | REQUIRED | The frontend origin this API serves — used to build links in emails. E.g. `https://appraisal.mincom.example.com` |

`APP_ENV` is set to `prod` directly in `docker-compose.prod.yml` — it is not read from `.env`. There is no Django-style `DEBUG`/`ALLOWED_HOSTS`/`DJANGO_SETTINGS_MODULE` equivalent: `APP_ENV=prod` covers environment selection, and Symfony trusts requests arriving behind the bundled nginx.

#### Database

| Variable         | Required | Description                                                                   |
|------------------|----------|-------------------------------------------------------------------------------|
| `DATABASE_URL`   | REQUIRED | `mysql://mincom:<DB_PASSWORD>@db:3306/mincom_appraisal?serverVersion=8.0.32&charset=utf8mb4` |
| `DB_PASSWORD`    | REQUIRED | MySQL password. Must match the password in `DATABASE_URL`. Used by `docker-compose.yml` for both `MYSQL_PASSWORD` (app user) and `MYSQL_ROOT_PASSWORD` — same value for both is fine. |
| `MYSQL_USER`     | REQUIRED | Set to `mincom`                                                               |
| `MYSQL_DATABASE` | REQUIRED | Set to `mincom_appraisal`                                                     |

#### Redis

Redis runs as a container with TLS enabled (port 6380). The plain-text port is disabled in production. Both the cache connection (`REDIS_URL`) and the Messenger transport (`MESSENGER_TRANSPORT_DSN`) use the same `rediss://` (double-s) scheme — Symfony's redis-messenger transport factory only recognizes `redis:`/`rediss:`/`valkey:`/`valkeys:` as valid scheme prefixes, so a bare `tls://` scheme is rejected. The two do differ in how TLS options are passed: the cache adapter uses `?ssl_cert_reqs=none`, while Messenger uses bracketed `?ssl[verify_peer]=0&ssl[verify_peer_name]=0` query params.

| Variable                  | Required | Description                                                                   |
|----------------------------|----------|-------------------------------------------------------------------------------|
| `REDIS_URL`                | REQUIRED | `rediss://:<REDIS_PASSWORD>@redis:6380/0` (cache pool, database index 0)      |
| `REDIS_PASSWORD`           | REQUIRED | Redis AUTH password. Must match the password in `REDIS_URL` and `MESSENGER_TRANSPORT_DSN`. |
| `MESSENGER_TRANSPORT_DSN`  | REQUIRED | `rediss://redis:6380/2?ssl[verify_peer]=0&ssl[verify_peer_name]=0` (Messenger queues, database index 2 — distinct from the cache's index 0). Replaces Celery's `CELERY_BROKER_URL`/`CELERY_RESULT_BACKEND`. |

#### JWT Authentication

| Variable                             | Required | Description                                   |
|--------------------------------------|----------|-----------------------------------------------|
| `JWT_PASSPHRASE`                     | REQUIRED | Passphrase protecting the JWT signing keypair. Generate with `openssl rand -hex 32`. |
| `JWT_ACCESS_TOKEN_LIFETIME_MINUTES`  | Optional | Default: `15`                                 |
| `JWT_REFRESH_TOKEN_LIFETIME_DAYS`    | Optional | Default: `7`                                  |

There are no `JWT_PRIVATE_KEY_PATH`/`JWT_PUBLIC_KEY_PATH` variables and no manual keypair files to provision — the keypair is generated automatically on first boot into the `symfony_jwt_keys` Docker volume (see [Section 4.2](#42-generate-required-secrets)).

#### Field-Level Encryption

| Variable               | Required | Description                                                                          |
|------------------------|----------|--------------------------------------------------------------------------------------|
| `FIELD_ENCRYPTION_KEY` | REQUIRED | 64 hexadecimal characters (32 bytes). **Loss = permanent data loss. Back up now.**   |

#### Audit Log

| Variable         | Required | Description                                          |
|------------------|----------|------------------------------------------------------|
| `AUDIT_HMAC_KEY` | REQUIRED | Minimum 32 hexadecimal characters.                   |

#### Email (SMTP)

All outbound mail (password resets, notifications, welcome emails) is sent via Symfony Mailer, configured entirely through a single DSN — there is no separate host/port/user/password set of variables. Production uses Postmark's SMTP relay; the Postmark Server API Token is used as **both** username and password.

| Variable                   | Required | Description                                                               |
|----------------------------|----------|---------------------------------------------------------------------------|
| `MAILER_DSN`               | REQUIRED | `smtp://<postmark-server-token>:<postmark-server-token>@smtp.postmarkapp.com:587`. Any `@` inside the token/username must be percent-encoded as `%40`. |
| `MAILER_FROM_ADDRESS`      | REQUIRED | Default: `noreply@mincom.com`                                             |
| `POSTMARK_MESSAGE_STREAM`  | Optional | Default: `outbound` (Postmark only)                                       |

#### Sentry

Two separate Sentry projects are supported: one for the Symfony backend (PHP SDK) and one for the React frontend (JavaScript SDK). The DSNs are different.

**Backend Sentry** — runtime environment variables read by `symfony-backend/config/packages/sentry.yaml` (PII scrubbing is implemented in `src/Service/SentryEventScrubber.php`):

| Variable         | Required | Description                                                              |
|------------------|----------|---------------------------------------------------------------------------|
| `SENTRY_DSN`     | Optional | Backend DSN. Leave empty to disable backend Sentry.                     |
| `SENTRY_RELEASE` | Optional | Release tag reported to Sentry (e.g. the commit SHA). Read directly by `config/packages/sentry.yaml`. |

There is no separate `ENVIRONMENT` variable read by the Sentry integration — the environment reported to Sentry defaults to Symfony's own `kernel.environment` (i.e. `APP_ENV`), unlike Django which had no such built-in equivalent.

**Frontend Sentry** — build-time Docker build arg, inlined by Vite at image build time:

| Variable           | Type            | Description                                                                   |
|--------------------|-----------------|-------------------------------------------------------------------------------|
| `VITE_SENTRY_DSN`  | Docker build arg | Frontend DSN. Baked into the JS bundle at build time. Omit to disable.      |

`VITE_SENTRY_DSN` is **not** a runtime environment variable and must not be placed in `.env`. It must be passed as a `--build-arg` when building the `backend` (web) image, which builds the React SPA as one of its stages:

```bash
docker compose build \
  --build-arg VITE_SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project> \
  backend
```

If the client does not want Sentry on the frontend, omit the build arg entirely. The `main.tsx` guard (`if (sentryDsn)`) will skip initialisation when the value is empty.

In CI/CD, `VITE_SENTRY_DSN` is read from the GitHub Actions repository variable `VITE_SENTRY_DSN` (GitHub → Settings → Secrets and variables → Actions → Variables). Sentry DSNs are public keys and do not need to be stored as secrets.

#### Cloudflare Turnstile CAPTCHA

| Variable              | Required | Description                                         |
|-----------------------|----------|-----------------------------------------------------|
| `TURNSTILE_SECRET_KEY`| Optional | Server-side key. Leave empty to skip CAPTCHA.       |
| `TURNSTILE_SITE_KEY`  | Optional | Client-side site key injected into the frontend.    |

#### Security

| Variable                | Required | Description                                               |
|-------------------------|----------|-----------------------------------------------------------|
| `CORS_ALLOWED_ORIGINS`  | Optional | `https://appraisal.mincom.example.com`                    |
| `CSRF_TRUSTED_ORIGINS`  | Optional | `https://appraisal.mincom.example.com`                    |
| `SECURE_SSL_REDIRECT`   | Optional | Default: `True`. Leave `True` when nginx terminates TLS.  |

#### Production Infrastructure

| Variable              | Required | Description                                              |
|-----------------------|----------|----------------------------------------------------------|
| `APP_VERSION`         | REQUIRED | Image tag to pull. E.g. `abc1234` (7-char commit SHA).   |
| `NGINX_HOST`          | REQUIRED | Domain name matching the Let's Encrypt certificate.      |

There are no `GUNICORN_WORKERS`/`GUNICORN_THREADS`/`CELERY_CONCURRENCY` variables — PHP-FPM worker/thread tuning is not exposed via environment variables. If pool sizing needs adjusting, it is configured in the php-fpm pool config inside `symfony-backend/docker/php/` (the Dockerfile / pool `.conf`), not in `.env`.

#### Bootstrap Admin (First Run Only)

Two independent bootstrap commands run automatically on container start (via `symfony-backend/entrypoint.sh`), each gated on its own env var pair being non-empty. Neither requires a manual `docker exec` step.

| Variable                      | Required | Description                                                        |
|-------------------------------|----------|--------------------------------------------------------------------|
| `BOOTSTRAP_ADMIN_NAME`        | Optional | Full name for the initial HR/System Admin account.                 |
| `BOOTSTRAP_ADMIN_EMAIL`       | Optional | Email for the initial admin account.                               |
| `BOOTSTRAP_ADMIN_PASSWORD`    | Optional | Min 8 characters. Remove from `.env` after first successful login. |

`app:bootstrap-admin` creates a full `SYSTEM_ADMIN` user with an `Employee` profile — this account can log into both the SPA and `/admin`.

#### Bootstrap Superuser (Optional — /admin-only access)

| Variable                        | Required | Description                                                        |
|----------------------------------|----------|--------------------------------------------------------------------|
| `BOOTSTRAP_SUPERUSER_EMAIL`      | Optional | Email for an investigative-only `/admin` account.                  |
| `BOOTSTRAP_SUPERUSER_PASSWORD`   | Optional | Min 8 characters.                                                  |

`app:bootstrap-superuser` grants **only** EasyAdmin (`/admin`) access — no `Employee` record, no SPA roles. Leave both empty in environments where `/admin` access is not needed. See `docs/ops/django-admin.md` for the full access model.

### 4.4 Example Production .env (Populated)

```ini
# Symfony core
APP_SECRET=<64-hex-chars>
FRONTEND_URL=https://appraisal.mincom.example.com

# Database
DATABASE_URL=mysql://mincom:<DB_PASSWORD>@db:3306/mincom_appraisal?serverVersion=8.0.32&charset=utf8mb4
DB_PASSWORD=<strong-random-password>
MYSQL_USER=mincom
MYSQL_DATABASE=mincom_appraisal

# Redis (containerised, TLS on port 6380)
REDIS_URL=rediss://:<REDIS_PASSWORD>@redis:6380/0
MESSENGER_TRANSPORT_DSN=rediss://:<redis_password>@redis:6380/2?ssl[verify_peer]=0&ssl[verify_peer_name]=0
REDIS_PASSWORD=<strong-random-password>

# JWT (keypair itself is generated automatically on first boot — see Section 4.2)
JWT_PASSPHRASE=<64-hex-chars>
JWT_ACCESS_TOKEN_LIFETIME_MINUTES=15
JWT_REFRESH_TOKEN_LIFETIME_DAYS=7

# Encryption (BACK THESE UP SEPARATELY — loss = permanent data loss)
FIELD_ENCRYPTION_KEY=<64-hex-chars>
AUDIT_HMAC_KEY=<64-hex-chars>

# Email (Postmark SMTP relay — server token used as both username and password)
MAILER_DSN=smtp://<postmark-server-token>:<postmark-server-token>@smtp.postmarkapp.com:587
MAILER_FROM_ADDRESS=MINCOM Appraisals <noreply@yourdomain.com>
POSTMARK_MESSAGE_STREAM=outbound

# Sentry
SENTRY_DSN=https://<key>@sentry.io/<project>
SENTRY_RELEASE=abc1234

# Security
CORS_ALLOWED_ORIGINS=https://appraisal.mincom.example.com
CSRF_TRUSTED_ORIGINS=https://appraisal.mincom.example.com
SECURE_SSL_REDIRECT=True

# Production infrastructure
NGINX_HOST=appraisal.mincom.example.com

# Bootstrap admin (remove after first successful login)
BOOTSTRAP_ADMIN_NAME=System Administrator
BOOTSTRAP_ADMIN_EMAIL=admin@mincom.example.com
BOOTSTRAP_ADMIN_PASSWORD=<min-8-chars>

# Bootstrap superuser (optional — /admin-only access, leave empty if not needed)
BOOTSTRAP_SUPERUSER_EMAIL=
BOOTSTRAP_SUPERUSER_PASSWORD=
```

---

## 5. Docker Compose Production

### 5.1 How the Production Override Works

The production stack uses two Compose files layered together:

```
docker-compose.yml          -- base service definitions, networks, volumes
docker-compose.prod.yml     -- production overrides applied on top:
                               - GHCR images instead of local builds
                               - APP_ENV=prod (Symfony php-fpm, no Vite/hot-reload)
                               - No source-code volume mounts (no hot-reload)
                               - DB and Redis ports NOT exposed to host
                               - Redis: plain port disabled, TLS port 6380 enabled
                               - /etc/letsencrypt mounted read-only into nginx
                               - CPU and memory resource limits enforced
```

All subsequent `docker compose` commands must include both `-f` flags:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml <command>
```

Create a shell alias to avoid repeating the flags in every command:

```bash
alias dcp='docker compose \
  -f /opt/mincom-appraisal/docker-compose.yml \
  -f /opt/mincom-appraisal/docker-compose.prod.yml'
```

### 5.2 Setting the Image Tag

The `APP_VERSION` variable selects which GHCR image tag to pull. CI/CD sets it to the 7-character commit SHA.

Set it in your shell before running any compose command:

```bash
export APP_VERSION=abc1234
```

Or keep it in `.env`. The compose file will fail with an explicit error if `APP_VERSION` is not set.

### 5.3 Resource Limits (per docker-compose.prod.yml)

| Service                            | CPU limit | Memory limit | CPU reservation | Memory reservation |
|-------------------------------------|-----------|--------------|-----------------|--------------------|
| backend                            | 1.0       | 256 MB       | 0.2             | 64 MB              |
| php                                 | 2.0       | 1536 MB      | 0.5             | 384 MB             |
| messenger-consume-scheduler        | 0.5       | 192 MB       | 0.1             | 64 MB              |
| messenger-consume-notifications    | 0.5       | 192 MB       | 0.1             | 64 MB              |
| db                                  | 2.0       | 2 GB         | —               | —                  |
| redis                               | 0.5       | 512 MB       | —               | —                  |

Six services in total: `backend` (TLS termination, the built React SPA's static files, and `fastcgi_pass` to `php` for `/api` and `/admin` — one container replaces the old separate nginx + frontend containers), `php` (the PHP-FPM application), `messenger-consume-scheduler` and `messenger-consume-notifications` (the two Messenger consumers, replacing Celery worker/beat), `db`, and `redis`. The dev environment additionally runs `mailpit`, which doesn't start in production.

---

## 6. First Deployment Steps

Complete these steps in order on the production server.

### Step 1 — Issue TLS Certificate

DNS must resolve to this server's IP before this step. See [Section 8](#8-ssltls-setup) for full details.

**Prerequisite:** No process may be listening on port 80 when using `--standalone` mode. Certbot binds port 80 directly to complete the ACME challenge. Ensure no containers are running at this point.

```bash
# Verify port 80 is free — this command must return no output before proceeding
sudo ss -tlnp | grep ':80'
```

If the command returns output, stop whatever is listening (e.g. `sudo systemctl stop nginx` or `docker compose down`) before continuing.

```bash
sudo certbot certonly \
  --standalone \
  --non-interactive \
  --agree-tos \
  --email devops@mincom.example.com \
  -d appraisal.mincom.example.com
```

### Step 2 — Fix Certificate Permissions for the Non-Root Backend Container

The backend container runs as UID 1001. Grant read access to the certificate files:

```bash
sudo chmod -R o+rx /etc/letsencrypt/live/
sudo chmod -R o+rx /etc/letsencrypt/archive/
```

### Step 3 — Verify the .env and Secrets

```bash
# Confirm .env exists with correct permissions
ls -la /opt/mincom-appraisal/.env
# Expected: -rw------- (600)

# Confirm secrets directory is populated
ls -la /opt/mincom-appraisal/secrets/
# Expected:
#   -rw------- redis_tls_key.pem
#   -rw-r--r-- redis_tls_cert.pem
#   (plus ssl_cert.pem / ssl_key.pem for the backend container's HTTPS listener)
```

### Step 4 — Pull Production Images

```bash
cd /opt/mincom-appraisal
export APP_VERSION=abc1234   # replace with the actual tag

docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
```

### Step 5 — Schema Migrations and Reference Data (Automatic)

Unlike the old Django deployment, there is no separate manual migrate/seed step. When the `php` container starts, `symfony-backend/entrypoint.sh` automatically:

1. Waits for MySQL to accept connections.
2. Generates the JWT signing keypair if missing (first-run only, idempotent, persisted into the `symfony_jwt_keys` volume).
3. Runs `php bin/console doctrine:migrations:migrate --no-interaction` — this applies both schema changes and the Doctrine data migrations that seed reference data (BSC Perspectives, Competencies, Score Descriptors) under `symfony-backend/migrations/`. Idempotent — safe on every deploy.
4. Runs the bootstrap-admin/bootstrap-superuser commands described in Step 6, if their env vars are set.

This all happens as part of **Step 7 — Start All Services** below; nothing needs to be run manually here. If you want to apply migrations ahead of starting the full stack (e.g. to review timing on a large migration), run:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  run --rm php php bin/console doctrine:migrations:migrate --no-interaction
```

### Step 6 — Bootstrap the First Admin Account (Automatic)

Also handled automatically by `entrypoint.sh` on container start, using `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, and `BOOTSTRAP_ADMIN_PASSWORD` from `.env` (`app:bootstrap-admin`). It is a no-op if those variables are empty. To bootstrap manually instead:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  run --rm php php bin/console app:bootstrap-admin \
  --email=admin@mincom.example.com --password=<min-8-chars> --name="System Administrator"
```

After the first successful login, remove the bootstrap credentials from `.env`:

```bash
# In /opt/mincom-appraisal/.env, delete or comment out:
# BOOTSTRAP_ADMIN_NAME=
# BOOTSTRAP_ADMIN_EMAIL=
# BOOTSTRAP_ADMIN_PASSWORD=
```

There is no separate static-files step: Symfony's admin-panel assets (EasyAdmin's CSS/JS under `/bundles/...`) are baked into the image and served directly — no `collectstatic`-equivalent command and no shared static volume.

### Step 7 — Start All Services

The base `docker-compose.yml` defines `mailpit` as a dev-only service (`profiles: ["dev"]`); it is not started by a plain `docker compose up` and requires no special exclusion in production.

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  up -d
```

### Step 8 — Smoke Test

```bash
# All containers should be running and healthy
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps

# Application health endpoint — verifies DB and Redis connectivity
curl -I https://appraisal.mincom.example.com/api/v1/health/
# Expected: HTTP/2 200

# Nginx internal health check
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  exec nginx wget -qO- http://127.0.0.1:8080/healthz

# Messenger consumer registration (replaces Celery worker ping)
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=20 messenger-consume-scheduler
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=20 messenger-consume-notifications

# Recent application logs
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=50 backend
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=50 php
```

---

## 7. Email Configuration

### 7.1 Postmark (Default)

The production settings module uses `utils.email_backends.PostmarkEmailBackend`. Postmark is the supported SMTP relay for this application.

1. Create a Postmark account at https://postmarkapp.com
2. Create a Server and copy the **Server API Token**
3. Add and verify a Sender Signature for your From address (e.g. `noreply@yourdomain.com`)
4. Set the following in `.env` — a single DSN, no separate host/port/user/password variables:

```ini
MAILER_DSN=smtp://<server-api-token>:<server-api-token>@smtp.postmarkapp.com:587
MAILER_FROM_ADDRESS=MINCOM Appraisals <noreply@yourdomain.com>
POSTMARK_MESSAGE_STREAM=outbound
```

For Postmark, the Server API Token is used as **both** the username and password inside `MAILER_DSN`.

### 7.2 Client's Own SMTP Server

Switching providers requires no code change — everything is driven by the `MAILER_DSN` env var. Set the following in `.env`:

```ini
MAILER_DSN=smtp://appraisals%40yourdomain.com:<smtp-password>@mail.yourdomain.com:587
MAILER_FROM_ADDRESS=MINCOM Appraisals <appraisals@yourdomain.com>
```

Note the `@` in the username is percent-encoded as `%40` inside the DSN.

### 7.3 Test Email Delivery

There is no `sendtestemail`-equivalent management command. Trigger a real notification (e.g. a password reset) through the application, or send a one-off test message with Symfony's console:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  run --rm php php bin/console mailer:test admin@yourdomain.com
```

---

## 8. SSL/TLS Setup

### 8.1 Issue a Certificate with Let's Encrypt

DNS must resolve to this server's public IP before running Certbot.

**Prerequisite:** No process may be listening on port 80 when using `--standalone` mode. Certbot binds port 80 directly to complete the ACME challenge. Ensure no containers are running at this point.

```bash
# Verify port 80 is free — this command must return no output before proceeding
sudo ss -tlnp | grep ':80'
```

If the command returns output, stop whatever is listening (e.g. `sudo systemctl stop nginx` or `docker compose down`) before continuing.

```bash
sudo certbot certonly \
  --standalone \
  --non-interactive \
  --agree-tos \
  --email devops@mincom.example.com \
  -d appraisal.mincom.example.com
```

Certificates will be written to:

```
/etc/letsencrypt/live/appraisal.mincom.example.com/fullchain.pem
/etc/letsencrypt/live/appraisal.mincom.example.com/privkey.pem
```

### 8.2 Fix Certificate Permissions for the Backend Container

The backend container runs as UID 1001 (non-root) and cannot read `/etc/letsencrypt` by default. Fix permissions immediately after issuance and after every renewal:

```bash
sudo chmod -R o+rx /etc/letsencrypt/live/
sudo chmod -R o+rx /etc/letsencrypt/archive/
```

### 8.3 Nginx Production Configuration

The production overlay (`docker-compose.prod.yml`) mounts the host's Let's Encrypt directory into the backend container read-only:

```yaml
volumes:
  - /etc/letsencrypt:/etc/letsencrypt:ro
```

`NGINX_HOST` in `.env` must match the domain name used during certificate issuance.

### 8.4 Automatic Certificate Renewal

Let's Encrypt certificates expire after 90 days. Certbot renews certificates that are within 30 days of expiry. Add a cron job:

```bash
sudo crontab -e
```

Add this line:

```cron
0 3 * * * certbot renew --quiet \
  && chmod -R o+rx /etc/letsencrypt/live/ /etc/letsencrypt/archive/ \
  && docker exec $(docker ps -qf name=mincom-appraisal-backend) nginx -s reload
```

This runs daily at 03:00, renews if due, restores read permissions for the container, and signals the backend container's nginx to reload its certificate without downtime.

Test renewal:

```bash
sudo certbot renew --dry-run
```

### 8.5 Verify HTTPS

```bash
curl -I https://appraisal.mincom.example.com/api/v1/health/
# Expect: HTTP/2 200
# Expect header: strict-transport-security: max-age=31536000; includeSubDomains; preload
```

---

## 9. Backup Strategy

### 9.1 MySQL Database Backup

Create the backup script. Backups are encrypted with GPG AES-256 symmetric encryption. You will be prompted to set a GPG passphrase on first run — store it separately from the backup files.

> **Note on the `db` container:** `docker-compose.yml`'s `db` service runs
> `command: --log-bin-trust-function-creators=1`. MySQL 8.0 enables binary logging by
> default, and creating a trigger (the audit-log append-only triggers applied by the
> initial migration) requires either the `SUPER` privilege or this flag — without it the
> app's own `mincom` user gets "You do not have the SUPER privilege and binary logging is
> enabled" on `doctrine:migrations:migrate`. This is already baked into the compose file;
> no manual action is needed here.

```bash
mkdir -p /opt/mincom-appraisal/scripts
cat > /opt/mincom-appraisal/scripts/backup-db.sh << 'EOF'
#!/bin/bash
set -euo pipefail

BACKUP_DIR=/opt/backups/mysql
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
COMPOSE_DIR=/opt/mincom-appraisal
RETENTION_DAYS=30
BACKUP_FILE="$BACKUP_DIR/mincom_appraisal_${TIMESTAMP}.sql.gz.gpg"

mkdir -p "$BACKUP_DIR"

# Extract DB_PASSWORD from .env so this script can run unattended under cron
# without needing the variable pre-exported into the crontab's environment.
DB_PASSWORD=$(grep '^DATABASE_URL=' "$COMPOSE_DIR/.env" | sed 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/')
if [[ -z "$DB_PASSWORD" ]]; then
  echo "ERROR: Could not extract DB_PASSWORD from .env" >&2
  exit 1
fi

# mysqldump output is gzip-compressed, then piped through GPG symmetric encryption
# (AES-256). The password is passed via MYSQL_PWD so it never appears in `ps` output.
# The GPG passphrase must be set in GPG_PASSPHRASE env var or entered interactively.
# Store the passphrase separately from the backup files.
docker compose \
  -f "$COMPOSE_DIR/docker-compose.yml" \
  -f "$COMPOSE_DIR/docker-compose.prod.yml" \
  exec -T -e MYSQL_PWD="$DB_PASSWORD" db mysqldump \
    -u mincom \
    --single-transaction \
    --routines \
    --triggers \
    mincom_appraisal \
  | gzip -9 \
  | gpg --symmetric \
        --cipher-algo AES256 \
        --batch \
        --passphrase "${GPG_PASSPHRASE:?GPG_PASSPHRASE must be set}" \
        --output "$BACKUP_FILE"

find "$BACKUP_DIR" -name "mincom_appraisal_*.sql.gz.gpg" -mtime "+${RETENTION_DAYS}" -delete

echo "$(date): DB backup complete (encrypted): $BACKUP_FILE"
EOF
chmod +x /opt/mincom-appraisal/scripts/backup-db.sh
```

Set the GPG passphrase before running:

```bash
export GPG_PASSPHRASE='<strong-passphrase>'
```

Store this passphrase in a secrets manager or physically secured location — it is required to restore from backup.

Schedule daily at 02:00:

```bash
sudo crontab -e
```

Add:

```cron
0 2 * * * /opt/mincom-appraisal/scripts/backup-db.sh >> /var/log/mincom-backup.log 2>&1
```

### 9.2 Restore Database from Backup

Backup files are GPG-encrypted, gzip-compressed SQL dumps (`.sql.gz.gpg`). Decrypt, decompress, and pipe directly into `mysql`:

```bash
# Set the GPG passphrase used during backup
export GPG_PASSPHRASE='<passphrase>'

# Extract DB_PASSWORD from .env (same pattern as the backup script)
DB_PASSWORD=$(grep '^DATABASE_URL=' /opt/mincom-appraisal/.env | sed 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/')

gpg --decrypt \
    --batch \
    --passphrase "${GPG_PASSPHRASE}" \
    --output - \
    /opt/backups/mysql/mincom_appraisal_<TIMESTAMP>.sql.gz.gpg \
  | gunzip -c \
  | docker compose -f docker-compose.yml -f docker-compose.prod.yml \
      exec -T -e MYSQL_PWD="$DB_PASSWORD" db mysql \
        -u mincom \
        mincom_appraisal
```

The plain SQL dump (produced with `--single-transaction --routines --triggers`, unlike
Postgres's binary `--format=custom`) recreates tables, routines, and triggers as it runs —
there is no separate `--clean`/`--if-exists` flag needed. If restoring into an existing
database with conflicting data, drop and recreate it first:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  exec -T -e MYSQL_PWD="$DB_PASSWORD" db mysql -u mincom \
  -e "DROP DATABASE mincom_appraisal; CREATE DATABASE IF NOT EXISTS mincom_appraisal CHARACTER SET utf8mb4;"
```

### 9.3 Redis Backup

Redis is configured with RDB persistence (`--save 60 1 --save 300 10`). In production, only the TLS port (6380) is active — the plain-text port is disabled (`--port 0`). All `redis-cli` commands require `--tls --insecure -p 6380`. Use `REDISCLI_AUTH` instead of the `-a` flag to avoid the password appearing in the process list.

```bash
# Export the Redis password (avoids password in process list)
export REDISCLI_AUTH="${REDIS_PASSWORD}"

# Trigger a background save
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  exec -e REDISCLI_AUTH redis \
  redis-cli --tls --insecure -p 6380 BGSAVE

# Wait for completion (returns a Unix timestamp; compare before/after to confirm save ran)
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  exec -e REDISCLI_AUTH redis \
  redis-cli --tls --insecure -p 6380 LASTSAVE

# Copy the RDB file from the container
CONTAINER=$(docker compose -f docker-compose.yml -f docker-compose.prod.yml ps -q redis)
mkdir -p /opt/backups/redis
docker cp "${CONTAINER}:/data/dump.rdb" \
  "/opt/backups/redis/dump_$(date +%Y%m%d_%H%M%S).rdb"
```

### 9.4 Media Files Backup

Not applicable to this stack. There is no `media_files`-equivalent Docker volume: PDF exports (appraisal reports, audit compliance reports) are rendered on demand by dompdf and streamed directly in the HTTP response — they are never written to disk — and there is no server-side file upload storage. The only durable application state is MySQL (Section 9.1), Redis (Section 9.3, best-effort only), and the JWT signing keypair (`symfony_jwt_keys` volume, backed up at the end of Section 9.5 below).

### 9.5 Encryption Key Backup (CRITICAL)

**If `FIELD_ENCRYPTION_KEY` is lost, all encrypted PII fields become permanently unreadable. No recovery is possible, regardless of whether the database backup is intact.**

Backup procedure:

1. Print the key value and store it in a physically secured location (safe or safety deposit box).
2. Store the key in a separate secrets manager (e.g. HashiCorp Vault, Bitwarden Secrets).
3. Never include the encryption key in the same archive as the database.

```bash
# Display the current key (copy to secure storage immediately)
grep FIELD_ENCRYPTION_KEY /opt/mincom-appraisal/.env
```

Back up the entire secrets directory to an encrypted archive:

```bash
mkdir -p /opt/backups/secrets
tar czf - /opt/mincom-appraisal/secrets/ /opt/mincom-appraisal/.env \
  | gpg --symmetric --cipher-algo AES256 \
        --output "/opt/backups/secrets/secrets_$(date +%Y%m%d).tar.gz.gpg"
```

Store the GPG passphrase in a different location than the archive.

**JWT signing keypair:** unlike `FIELD_ENCRYPTION_KEY`/`AUDIT_HMAC_KEY`, the RS256 keypair is not a value in `.env` — it lives in the named Docker volume `symfony_jwt_keys` (mounted at `/app/config/jwt` in the `php` service), generated automatically on first boot. Losing this volume does not destroy encrypted data, but it does invalidate every outstanding access/refresh token. Back it up alongside the database:

```bash
docker run --rm \
  -v mincom-appraisal_symfony_jwt_keys:/source:ro \
  -v /opt/backups/secrets:/backup \
  busybox tar czf "/backup/jwt_keys_$(date +%Y%m%d).tar.gz" -C /source .
```

Adjust `mincom-appraisal_symfony_jwt_keys` if Docker Compose generates a different volume name (check with `docker volume ls`).

---

## 10. Monitoring and Maintenance

### 10.1 Health Check Endpoints

| Endpoint                                    | Expected Response                        |
|---------------------------------------------|------------------------------------------|
| `https://<host>/api/v1/health/`             | `200 OK` (verifies DB + Redis reachable) |
| `https://<host>/healthz`                    | `200 OK` (nginx liveness probe)          |

If the health endpoint returns `503`, check database and Redis container status.

### 10.2 Container Health Status

```bash
# All services
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps

# Single container health detail
docker inspect --format='{{.State.Health.Status}} {{.State.Health.Log}}' \
  $(docker compose -f docker-compose.yml -f docker-compose.prod.yml ps -q php)
```

### 10.3 Viewing Logs

```bash
# All services, follow
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f --tail=100

# Single service
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f php
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f messenger-consume-scheduler
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f messenger-consume-notifications
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f nginx
```

### 10.4 Sentry Error Tracking

Sentry is configured in `symfony-backend/config/packages/sentry.yaml`, with PII scrubbing implemented in `src/Service/SentryEventScrubber.php`:

- Captures unhandled Symfony exceptions, Messenger consumer failures (async/notification/scheduler queues), and Redis errors
- 20% of transactions are sampled for performance monitoring (`traces_sample_rate: 0.2`)
- Profiling sampling is not enabled — the PHP SDK's profiler requires the `excimer` PECL extension, which is not installed (unlike the Python SDK, which profiles out of the box)
- PII is scrubbed before transmission: IP addresses anonymised, request bodies filtered, JWT tokens removed from headers, employee names and scores stripped from extra context

Access the Sentry dashboard at https://sentry.io to configure alert rules and review error trends.

### 10.5 Applying Application Updates

```bash
cd /opt/mincom-appraisal

# Set the new image tag
export APP_VERSION=<new-commit-sha>

# Pull updated images
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull

# Run database migrations before restarting (also runs automatically via
# entrypoint.sh when the php container restarts below — safe to run
# ahead of time to review timing on a large migration)
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  run --rm php php bin/console doctrine:migrations:migrate --no-interaction

# Restart application containers (nginx remains up, no downtime)
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  up -d --no-deps backend php messenger-consume-scheduler messenger-consume-notifications

# Verify
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
curl -s https://appraisal.mincom.example.com/api/v1/health/
```

### 10.6 Rollback Procedure

**Before rolling back, check whether the migrations that ran are reversible:**

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  run --rm php php bin/console doctrine:migrations:list

# Sanity-check current schema state after any restore
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  run --rm php php bin/console doctrine:schema:validate
```

Doctrine migrations do not have a single "plan" command like Django's; check the migration classes under `symfony-backend/migrations/` for the version(s) being rolled back. Each implements a `down()` method — if it throws `Doctrine\Migrations\Exception\IrreversibleMigration` (e.g. for a `DROP COLUMN` or other destructive change), you must restore the database from a pre-upgrade backup before rolling back the image. Attempting to run the old image against a forward-migrated schema will cause startup errors.

```bash
cd /opt/mincom-appraisal

# Step 1 — Stop application services
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  stop backend php messenger-consume-scheduler messenger-consume-notifications

# Step 2 — Restore database backup if schema changed (see Section 9.2)
# Skip this step only if no schema migrations were introduced in the failed version.
# gpg --decrypt ... | gunzip -c | docker compose ... exec -T -e MYSQL_PWD=... db mysql ...

# Step 3 — Pull the previous image tag
export APP_VERSION=<previous-commit-sha>
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull php

# Step 4 — Restart with the previous image
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  up -d --no-deps backend php messenger-consume-scheduler messenger-consume-notifications
```

### 10.7 Disk Space

```bash
# Host disk usage
df -h /

# Docker volume and image usage
docker system df

# Remove images older than 7 days (only after confirming rollback is not needed)
docker image prune -f --filter "until=168h"
```

---

## 11. Security Checklist

Complete every item before allowing user traffic.

### Secrets and Credentials

- [ ] `APP_SECRET` is a freshly generated value (not the example placeholder)
- [ ] `FIELD_ENCRYPTION_KEY` is a randomly generated 64-hex-char value (not the placeholder)
- [ ] `AUDIT_HMAC_KEY` is a randomly generated 64-hex-char value (not the placeholder)
- [ ] `JWT_PASSPHRASE` is a randomly generated value (not the placeholder)
- [ ] `DB_PASSWORD` is a strong random password (not `devpassword`)
- [ ] `REDIS_PASSWORD` is a strong random password (not `devredispassword`)
- [ ] `BOOTSTRAP_ADMIN_PASSWORD` has been removed from `.env` after first login
- [ ] `.env` file permissions are `600` (`chmod 600 /opt/mincom-appraisal/.env`)
- [ ] `secrets/` directory permissions: `700` on directory, `600` on private keys
- [ ] `FIELD_ENCRYPTION_KEY` is backed up to a physically separate, secure location
- [ ] `symfony_jwt_keys` Docker volume is backed up to a separate secure location (see Section 9.5)

### Network and Firewall

- [ ] UFW or cloud firewall restricts inbound traffic to ports 22, 80, 443 only
- [ ] MySQL port 3306 is NOT accessible from the public internet
- [ ] Redis port 6380 is NOT accessible from the public internet
- [ ] SSH access is restricted to specific admin IP addresses where feasible
- [ ] Default SSH port 22 has been changed or key-only auth enforced

### HTTPS and TLS

- [ ] Let's Encrypt certificate issued and `certbot renew --dry-run` passes
- [ ] Auto-renewal cron job configured with permission fix and nginx reload
- [ ] `https://` URL loads successfully with no browser certificate warnings
- [ ] `curl -I` response includes `strict-transport-security` header
- [ ] `SECURE_SSL_REDIRECT=True` is set in `.env`
- [ ] HTTP requests on port 80 are redirected to HTTPS

### Application Configuration

- [ ] `APP_ENV=prod` (set in `docker-compose.prod.yml`, not `.env` — there is no Django-style `DEBUG`/`ALLOWED_HOSTS` to check)
- [ ] `CORS_ALLOWED_ORIGINS` contains only the production frontend origin
- [ ] `CSRF_TRUSTED_ORIGINS` contains only the production frontend origin
- [ ] `SENTRY_DSN` is configured and test errors appear in the Sentry dashboard

### Containers

- [ ] All containers confirmed running as non-root (`docker compose ps` shows no root UIDs)
- [ ] All container health checks are passing (`Status: healthy`)
- [ ] No source code volumes are mounted in production (no `./backend:/app` bind mounts)
- [ ] `mailpit` dev service is not running in production

### Backups

- [ ] Database backup cron job is active and producing files in `/opt/backups/mysql/`
- [ ] A test restore has been performed on a non-production copy of the data
- [ ] `FIELD_ENCRYPTION_KEY` backup has been verified in separate secure storage
- [ ] `symfony_jwt_keys` volume backup is configured and running (no media files volume exists in this stack — PDFs are generated on demand, not persisted)

### Post-Deployment Verification

- [ ] `https://<host>/api/v1/health/` returns `200 OK`
- [ ] Admin login works with bootstrap admin credentials
- [ ] Bootstrap admin password changed immediately after first login
- [ ] Test email delivered successfully
- [ ] Messenger consumers are running: `docker compose ... logs --tail=20 messenger-consume-scheduler messenger-consume-notifications` shows no errors
