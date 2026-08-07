# MINCOM Appraisal — Ubuntu 24.04 LTS Production Deployment Runbook

**Target host:** Ubuntu 24.04 LTS (Noble Numbat), 16 GB RAM, ~100 GB disk
**Stack:** Docker Engine + Docker Compose plugin (native `apt` install — no Docker Desktop)
**Images:** `ghcr.io/ejay4u/mincom-appraisal/...`
**Compose file:** `docker-compose.prod.yml`
**User base:** ~500 users
**Audience:** Linux sysadmin comfortable with `apt`, `systemd`, `ufw`, and Docker.

This runbook is preferred over `windows-server-2019-deployment.md` for new deployments. The host may be a DigitalOcean
Droplet, AWS EC2 instance, on-prem VM, or bare metal — instructions are host-agnostic except
where noted.

---

## Why Ubuntu 24.04 Native, Not WSL2

Docker Engine on native Linux has no WSL2 translation layer, no Windows Scheduled Task
workaround, and no Hyper-V networking quirks to manage after patches. Ubuntu 24.04 LTS is
supported through April 2029, matches the Windows Server 2019 support horizon, and reclaims
the ~2–3 GB of RAM Windows Server + WSL2 overhead consumed — giving noticeably more headroom
at the same hardware budget.

---

## Memory Budget — 16 GB / ~500 Users

| Component | Reserved |
|---|---|
| Ubuntu kernel + systemd | ~1.0 GB |
| MySQL (innodb_buffer_pool_size + connections) | ~3.0 GB |
| Redis (maxmemory 512 MB + overhead) | ~0.5 GB |
| PHP-FPM backend (`php` service) | ~2.0 GB |
| Messenger consumers (scheduler + notifications) | ~1.0 GB |
| Nginx + Portainer CE | ~0.5 GB |
| **Used at typical load** | **~8.0 GB** |
| **Headroom** | **~8.0 GB** |

> **For smaller hosts (e.g. 8 GB):** the container limits in `docker-compose.prod.yml` are tuned for ~7.75 GB hosts (5 GB containers + 2.75 GB OS/cache). At this size, expect comfortable capacity for ~200 concurrent users and degraded performance for 500 concurrent users under peak operations (cycle activation, mass PDF export). To scale beyond 200 active concurrent users, upgrade the host to 16 GB.

Compared with the Windows Server 2019 deployment (~6 GB headroom), native Ubuntu recovers
2–3 GB previously consumed by the Windows kernel, svchost overhead, and the WSL2 VM boundary.
During appraisal cycle activation — when bulk Messenger jobs run and hundreds of employees
open forms simultaneously — this extra headroom provides meaningful cushion. Monitor with
`docker stats --no-stream` during the first cycle and have a pre-approved path to 24 GB ready
if metrics warrant it.

---

## Pre-Deployment Checklist

Confirm all of the following before touching the server.

**Server / networking:**

- [ ] Ubuntu 24.04 LTS installed, fully patched, SSH accessible
- [ ] Static IP assigned (cloud provider elastic IP, or on-prem DHCP reservation)
- [ ] DNS A record created: e.g. `appraisal.mincom.internal` or `appraisal.mincom.com` pointing at the host IP
- [ ] Inbound ports 22 (SSH), 80 (HTTP), 443 (HTTPS) confirmed open at cloud/network level before `ufw` is configured
- [ ] For cloud VMs: security group / firewall policy updated at the provider console *in addition* to host `ufw`
- [ ] For on-prem: upstream perimeter firewall rule confirmed for the same ports
- [ ] IT VLAN CIDR noted for Portainer restriction (Phase 6) — e.g. `10.10.5.0/24`
- [ ] SMTP relay server, port, credentials, SPF/DKIM confirmed — **do not go live without this**

**Accounts / secrets:**

- [ ] GHCR personal access token (PAT) created at `github.com/settings/tokens` with `read:packages` scope — copy the value now, it is not shown again
- [ ] `APP_VERSION` tag agreed with the dev team (e.g. `v1.2.0`) — never deploy `latest`
- [ ] All `.env` values prepared (see Phase 4)
- [ ] TLS certificate and key files available (corporate CA) OR domain is publicly reachable for Let's Encrypt (Phase 7)
- [ ] Redis TLS cert/key generated locally if preferred, or generated on the server in Phase 4

---

## Phase 1 — OS Preparation

All commands run as a user with `sudo`. Log in via SSH.

```bash
# Update all packages
sudo apt-get update && sudo apt-get upgrade -y

# Required by Redis: prevent background-save (BGSAVE/fork) failures under low memory.
# Without this, Redis logs: "WARNING Memory overcommit must be enabled!"
# and may fail to persist data under memory pressure.
echo "vm.overcommit_memory = 1" | sudo tee /etc/sysctl.d/99-redis.conf
sudo sysctl -p /etc/sysctl.d/99-redis.conf

# Set timezone to UTC (critical — all application datetimes are UTC)
sudo timedatectl set-timezone UTC
timedatectl status    # confirm: "Time zone: UTC"

# Set a meaningful hostname (replace with your actual FQDN short name)
sudo hostnamectl set-hostname mincom-appraisal-prod

# Create a dedicated non-root service user
sudo useradd -m -s /bin/bash -c "MINCOM Appraisal service account" mincom
sudo passwd mincom    # set a strong password; store in password manager
# Note: mincom is NOT granted sudo. Docker group membership (Phase 2) is sufficient
# for all stack operations. Only your initial admin account needs sudo.
```

**SSH hardening** — edit `/etc/ssh/sshd_config` and confirm or set these values:

```
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```

Copy your public key to the `mincom` account, then reload SSH:

```bash
# From your local machine
ssh-copy-id mincom@<server-ip>

# On the server
sudo systemctl reload ssh
```

Verify you can log in as `mincom` with your key before closing the current session.

---

## Phase 2 — Install Docker Engine

These commands follow the official Docker `apt` repository method. Run them as `mincom`
(or any sudo-capable user).

```bash
# Remove any old Docker packages that may be pre-installed
# Only docker.io, containerd, and runc exist in the Ubuntu 24.04 default repos;
# docker and docker-engine are legacy names not present in Noble's package index.
sudo apt-get remove -y docker.io containerd runc 2>/dev/null || true

# Install prerequisites
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release

# Add Docker's official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add the Docker apt repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker CE, Compose plugin, and Buildx plugin
sudo apt-get update
sudo apt-get install -y \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-compose-plugin \
  docker-buildx-plugin

# Add the mincom service user to the docker group
sudo usermod -aG docker mincom

# Enable and start the Docker daemon
sudo systemctl enable docker
sudo systemctl start docker
```

Log out and log back in as `mincom` so the group membership takes effect, then smoke-test:

```bash
docker run --rm hello-world
docker compose version
```

Both must succeed before proceeding. On native Linux, Docker starts automatically on every
boot via systemd — no Scheduled Task workaround is needed.

---

## Phase 3 — Firewall (ufw)

```bash
# Ensure ufw is installed (it is on Ubuntu 24.04 by default)
sudo apt-get install -y ufw

# Default policy: deny all inbound, allow all outbound
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow SSH (do this first — do not lock yourself out)
sudo ufw allow 22/tcp comment 'SSH'

# Allow HTTP and HTTPS for the application
sudo ufw allow 80/tcp  comment 'HTTP (nginx redirect)'
sudo ufw allow 443/tcp comment 'HTTPS (nginx TLS)'

# Enable the firewall
sudo ufw enable

# Confirm rules
sudo ufw status verbose
```

**Docker and ufw — important caveat:** Docker manipulates `iptables` directly and bypasses
`ufw` rules for published container ports. A container bound to `0.0.0.0:3306` will be
publicly reachable even if `ufw` has no rule for port 3306. The safe pattern used in
`docker-compose.prod.yml` is:

- Internal services (MySQL, Redis, the `php` app container, and the Messenger consumers)
  have no `ports:` mapping at all — they are accessible only on the Docker internal network,
  never on the host interface.
- Only Nginx (80, 443) is published externally.
- Portainer (9443) is restricted by an explicit `ufw` rule added in Phase 6.

Do not add `ports:` mappings to `db` or `redis` in the compose file.

---

## Phase 4 — Bring Up the Application Stack

```bash
# Create the application directory, owned by the mincom service user
sudo mkdir -p /opt/mincom-appraisal
sudo chown mincom:mincom /opt/mincom-appraisal

# Clone the repository (use HTTPS + PAT for a server)
git clone https://github.com/ejay4u/mincom-appraisal.git /opt/mincom-appraisal

cd /opt/mincom-appraisal

# Copy the env template and populate every value
cp .env.example .env
nano .env   # or vi, or transfer a pre-prepared file via scp
```

Generate the secret values you will need before editing `.env`:

```bash
# APP_SECRET — Symfony's own framework secret (CSRF tokens, signed URIs, etc.)
openssl rand -hex 32

# FIELD_ENCRYPTION_KEY — must be a 64-character hex string (32 raw bytes).
# App\Service\FieldEncryptor calls hex2bin(FIELD_ENCRYPTION_KEY) at use time;
# a non-hex (e.g. base64) value throws: FIELD_ENCRYPTION_KEY must be a
# hex-encoded 32-byte (64 hex character) key.
openssl rand -hex 32

# AUDIT_HMAC_KEY — same format requirement, used to HMAC-sign every AuditLog entry
openssl rand -hex 32

# JWT_PASSPHRASE — protects the JWT signing keypair (the keypair itself is
# generated automatically on first container boot; see the JWT note below)
openssl rand -hex 32
```

Store all generated values in your team's secret manager before pasting them into `.env`.

> **IMPORTANT — rotate ALL passwords before starting the stack.** If you copied
> `.env` from `.env.example`, every `<CHANGE-ME-USE-OPENSSL-RAND>` placeholder must be
> replaced with a real secret before running `docker compose up -d`.  A deployment with
> placeholder values still in place is a critical security exposure.  Generate each
> password with: `openssl rand -base64 32 | tr -d '/+="'`

Mandatory `.env` values (all others in `.env.example` also apply):

```
APP_SECRET=<generated above>

DATABASE_URL=mysql://mincom_user:<db_password>@db:3306/mincom_appraisal?serverVersion=8.0.32&charset=utf8mb4
DB_PASSWORD=<db_password>   # must match the password in DATABASE_URL

# rediss:// = Redis over TLS; port 6380 (prod Redis disables plaintext 6379);
# ?ssl_cert_reqs=none skips cert verification for the self-signed Redis TLS cert.
REDIS_URL=rediss://:<redis_password>@redis:6380/0?ssl_cert_reqs=none
# Messenger transport (backs the async/scheduler_main/notification_email
# queues, replacing Celery's broker + result backend). Uses the same
# rediss:// scheme as REDIS_URL above (the redis-messenger transport
# factory only recognizes redis:/rediss:/valkey:/valkeys: as scheme
# prefixes — a bare tls:// scheme is rejected), but with bracketed ssl[...]
# query params rather than ssl_cert_reqs for TLS options. Database index
# /2, distinct from the cache's /0.
MESSENGER_TRANSPORT_DSN=rediss://:<redis_password>@redis:6380/2?ssl[verify_peer]=0&ssl[verify_peer_name]=0
REDIS_PASSWORD=<redis_password>   # must match the password embedded in REDIS_URL
                                  # and MESSENGER_TRANSPORT_DSN above
                                  # must NOT contain a literal " character — the redis
                                  # healthcheck command will break; generate with:
                                  # openssl rand -base64 32 | tr -d '/+="'

FIELD_ENCRYPTION_KEY=<generated above>
AUDIT_HMAC_KEY=<generated above>

# JWT signing keypair — generated automatically on first container boot by
# entrypoint.sh (php bin/console lexik:jwt:generate-keypair --skip-if-exists)
# into the named symfony_jwt_keys Docker volume mounted at /app/config/jwt in
# the `php` service. No manual RSA keypair generation or file-mount secrets
# needed — just set the passphrase that protects it:
JWT_PASSPHRASE=<generated above>
JWT_ACCESS_TOKEN_LIFETIME_MINUTES=15
JWT_REFRESH_TOKEN_LIFETIME_DAYS=7

TURNSTILE_SECRET_KEY=<from Cloudflare Turnstile>

# Production uses Postmark's SMTP relay (not Postmark's HTTP API) — the
# server token is used as BOTH username and password. Percent-encode any
# "@" in the token as %40.
MAILER_DSN=smtp://<postmark-server-token>:<postmark-server-token>@smtp.postmarkapp.com:587
MAILER_FROM_ADDRESS=appraisal@mincom.internal
POSTMARK_MESSAGE_STREAM=outbound

SENTRY_DSN=<from your Sentry project>
ENVIRONMENT=production
APP_VERSION=v1.2.0      # use a real released tag — never "latest"
```

> **No `ALLOWED_HOSTS` / `CSRF_TRUSTED_ORIGINS` / `CORS_ALLOWED_ORIGINS` equivalent.**
> Symfony has nothing analogous to Django's `ALLOWED_HOSTS` host-header allowlist — the
> bundled nginx in front of `php` is the only thing routing requests to it, so there is no
> separate trusted-host check to configure. There is also no CORS allowlist to maintain:
> the production nginx serves the built React SPA and proxies `/api/` from the *same*
> origin, so the browser never makes a cross-origin request in the first place. The one
> origin-shaped value that still exists is `FRONTEND_URL` (`.env.prod.local`), used only to
> build links inside outgoing emails — it does not gate incoming requests.

Configure Compose to always load both the base and prod overlay files. Add this to `.env`
so that every subsequent `docker compose` command — including day-2 `pull`, `up`, and
`exec` — automatically uses the correct file combination without needing `-f` flags:

```bash
echo 'COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml' >> /opt/mincom-appraisal/.env
```

Without this line, running `docker compose up` with only `docker-compose.prod.yml` causes
errors like "service messenger-consume-scheduler refers to undefined volume symfony_jwt_keys:
invalid compose project" because the volumes and base service definitions live in
`docker-compose.yml`.

Secure the `.env` file so only the `mincom` user can read it:

```bash
chmod 600 /opt/mincom-appraisal/.env
```

Generate Redis TLS certificates (self-signed is appropriate — Redis never leaves the Docker
internal network):

```bash
cd /opt/mincom-appraisal
mkdir -p secrets
openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
  -subj "/CN=redis" \
  -keyout secrets/redis_tls_key.pem \
  -out    secrets/redis_tls_cert.pem
chmod 644 secrets/redis_tls_key.pem secrets/redis_tls_cert.pem
```

No manual JWT keypair generation is needed. On first boot, `symfony-backend/entrypoint.sh`
runs `php bin/console lexik:jwt:generate-keypair --skip-if-exists --no-interaction`, writing
the RS256 keypair into the named `symfony_jwt_keys` Docker volume (mounted at
`/app/config/jwt` in the `php` service) — idempotent, so it is a no-op on every subsequent
restart. All you provide is the passphrase that protects the keypair, `JWT_PASSPHRASE`,
already generated above and set in `.env`.

> **WARNING — the `symfony_jwt_keys` volume is irreplaceable.** Deleting it (or recreating
> the stack with `docker compose down -v`) forces a fresh keypair to be generated on next
> boot, which invalidates every outstanding access/refresh token and forces all users to
> re-login. In a multi-replica setup, every replica must share this same volume, or each
> would sign tokens with a different key. Back up the volume the same way you back up the
> database.

**Why 644, not 600 for the private key?** Docker secrets are passed into the container as
files owned by root with the host file permissions preserved. The in-container Redis process
runs as UID 999 (the built-in `redis` user in `redis:7-alpine`), which is not the host owner
of the file. With 600, Redis cannot read the key and fails with a "Permission denied" error.
With 644, Redis reads it successfully. Host-level access is still restricted: the `secrets/`
directory is owned by `mincom` (`/opt/mincom-appraisal` is owned by `mincom`), so other
system users cannot access it without `sudo`. Do not tighten these files to 600 — the service
will fail to start.

Log in to GHCR using the PAT from the pre-deployment checklist:

```bash
echo "<YOUR_GHCR_PAT>" | docker login ghcr.io -u <github_username> --password-stdin
```

Pull images and start the stack:

```bash
cd /opt/mincom-appraisal

export APP_VERSION=v1.2.0   # must match APP_VERSION in .env
```

> **Note:** `APP_VERSION` must match a tag published to GHCR at
> `https://github.com/ejay4u/mincom-appraisal/pkgs/container/mincom-appraisal%2Fsymfony-backend`.
> If the tag does not exist in GHCR, Compose silently falls back to building the image
> locally from source — which is slow and is not the supported production path. Verify
> the tag exists before running `docker compose pull`.

```bash
# COMPOSE_FILE in .env means -f flags are not needed here or in any day-2 command
docker compose pull

docker compose up -d

# Verify all services are healthy
docker compose ps
```

Expected output: `backend`, `php`, `messenger-consume-scheduler`,
`messenger-consume-notifications`, `db`, and `redis` all showing `running` or `healthy`.
`backend` is the single public web tier — TLS termination, the built React SPA's static
files, and FastCGI routing to the `php` service for `/api` and `/admin`; it is not the
process running application code.

> **Startup ordering — `php` completes init before the messenger consumers start.**
> On a fresh deployment, `php`'s `entrypoint.sh` generates the JWT signing keypair (first
> boot only, into the `symfony_jwt_keys` volume), applies pending Doctrine migrations —
> including the data migrations that seed BSC Perspectives, Competencies, and Score
> Descriptor reference data, so there is no separate manual seeding step — and runs
> `app:bootstrap-admin`/`app:bootstrap-superuser` (only when their respective env var pairs
> are set) before its healthcheck passes. `messenger-consume-scheduler` and
> `messenger-consume-notifications` have `php: condition: service_healthy` in their
> `depends_on` block, so Docker Compose holds them in the "starting" state until the `php`
> healthcheck returns healthy. You can observe this with `docker compose ps` immediately
> after `docker compose up -d`: `php` will be `starting` (running init), while the two
> messenger containers show `created` or `starting` but have not yet launched their consumer
> processes. Within ~30 seconds of `php` turning `healthy`, both messenger containers will
> transition to `healthy` as well and begin consuming their respective transports.

---

## Phase 5 — Portainer CE

Portainer gives the support team a browser-based UI to view logs, restart services, and
inspect volumes without needing CLI access.

```bash
docker volume create portainer_data

docker run -d \
  --name portainer \
  --restart always \
  -p 127.0.0.1:9443:9443 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v portainer_data:/data \
  portainer/portainer-ce:2.21.0
```

By binding to `127.0.0.1:9443`, the port is not reachable from the network by default.
Open it only to your admin IP range via `ufw`:

```bash
# Replace 10.10.5.0/24 with your actual IT VLAN CIDR or specific admin IP
sudo ufw allow from 10.10.5.0/24 to any port 9443 proto tcp comment 'Portainer — IT VLAN'
```

Portainer is now accessible at `https://<server-ip>:9443` from the permitted range only.
On first visit, create the admin password (minimum 12 characters).

---

## Phase 6 — TLS

All three options below write the final certificate and key to:

```
/opt/mincom-appraisal/secrets/ssl_cert.pem   ← certificate (+ chain)
/opt/mincom-appraisal/secrets/ssl_key.pem    ← private key (no passphrase)
```

`docker-compose.prod.yml` declares these as Docker secrets, which Docker mounts inside
the backend container at `/run/secrets/ssl_cert.pem` and `/run/secrets/ssl_key.pem` — the
exact paths `symfony-backend/docker/nginx/default.prod.conf` references. Every option ends at the same outcome:
Nginx serving HTTPS on port 443.

Choose one option based on your network topology.

### Option A: Self-signed certificate (intranet / IP-based, no public DNS)

Use this path when the deployment is reachable only on the corporate LAN and has no
public DNS name — for example, when operators access it via IP address or an internal
hostname like `appraisal.mincom.internal`.

```bash
cd /opt/mincom-appraisal
mkdir -p secrets

# Replace <server-ip> and <internal-hostname> with the actual values.
# -addext SAN is required — modern browsers reject certs without a Subject Alternative Name.
openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
  -subj "/CN=<server-ip-or-hostname>" \
  -addext "subjectAltName=IP:<server-ip>,DNS:<internal-hostname>" \
  -keyout secrets/ssl_key.pem \
  -out    secrets/ssl_cert.pem
chmod 644 secrets/ssl_cert.pem secrets/ssl_key.pem

docker compose up -d backend
```

> **Browser warning — expected behaviour:** Browsers will show "Your connection is not
> private" (`NET::ERR_CERT_AUTHORITY_INVALID`) because the certificate is self-signed and
> not trusted by the OS certificate store.  Click **Advanced → Proceed** to continue.
> This is normal for intranet deployments.  To eliminate the warning, import
> `secrets/ssl_cert.pem` into the corporate CA store via Group Policy (Windows) or
> `/usr/local/share/ca-certificates/` + `update-ca-certificates` (Linux).

### Option B: Corporate / internal CA certificate

Use this path when your IT department issues certificates from a corporate CA — the
certificate is already trusted by all corporate workstations.

```bash
cd /opt/mincom-appraisal
mkdir -p secrets

# Copy your corporate-issued certificate files to the server via scp:
#   fullchain.pem  — certificate + any intermediate CA chain (concatenated PEM)
#   privkey.pem    — private key (no passphrase)
# Then install them into the secrets/ directory:
install -m 644 /tmp/fullchain.pem secrets/ssl_cert.pem
install -m 644 /tmp/privkey.pem   secrets/ssl_key.pem

docker compose up -d backend
```

Verify the backend container loaded the certificate:

```bash
docker compose logs backend | grep -E "ssl|start|error"
```

### Option C: Let's Encrypt (public internet deployments)

Use this path when the domain resolves publicly and port 80 is reachable from the
internet (required for the HTTP-01 ACME challenge).

> **Note:** `certbot --nginx` manages a host-level Nginx binary and will not work here
> because Nginx runs inside a container.  Use `--standalone` instead: certbot starts
> its own temporary HTTP listener on port 80, so the backend container must be stopped
> first.

```bash
# Install certbot (standalone mode — no nginx plugin needed)
sudo apt-get install -y certbot

# Stop the backend container to free port 80 for the ACME challenge
cd /opt/mincom-appraisal && docker compose stop backend

# Obtain the certificate (replace domain and email)
sudo certbot certonly --standalone \
  -d appraisal.mincom.com \
  --non-interactive --agree-tos \
  -m admin@mincom.com

# Copy the issued files into the Docker secrets directory.
# Certbot writes to /etc/letsencrypt/live/<domain>/ — the backend container does NOT
# bind-mount /etc/letsencrypt, so the files must be copied here explicitly.
mkdir -p /opt/mincom-appraisal/secrets
install -m 644 /etc/letsencrypt/live/appraisal.mincom.com/fullchain.pem \
               /opt/mincom-appraisal/secrets/ssl_cert.pem
install -m 644 /etc/letsencrypt/live/appraisal.mincom.com/privkey.pem \
               /opt/mincom-appraisal/secrets/ssl_key.pem

# Start Nginx
cd /opt/mincom-appraisal && docker compose up -d backend
```

Certbot installs a systemd timer that renews certificates automatically. Verify it:

```bash
sudo systemctl list-timers | grep certbot
sudo certbot renew --dry-run
```

Renewal requires stopping the backend container (to free port 80), copying the renewed
files, and reloading Nginx. Create pre/deploy hooks so the systemd timer handles this
automatically:

```bash
# Pre-hook — stop the backend container before certbot takes port 80
sudo tee /etc/letsencrypt/renewal-hooks/pre/stop-nginx.sh > /dev/null <<'EOF'
#!/bin/bash
cd /opt/mincom-appraisal
docker compose stop backend
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/pre/stop-nginx.sh

# Deploy hook — copy renewed cert files into secrets/ and reload Nginx
sudo tee /etc/letsencrypt/renewal-hooks/deploy/copy-and-reload.sh > /dev/null <<'EOF'
#!/bin/bash
# RENEWED_LINEAGE is set by certbot to the live/ path for the renewed domain
install -m 644 "${RENEWED_LINEAGE}/fullchain.pem" /opt/mincom-appraisal/secrets/ssl_cert.pem
install -m 644 "${RENEWED_LINEAGE}/privkey.pem"   /opt/mincom-appraisal/secrets/ssl_key.pem
cd /opt/mincom-appraisal
docker compose up -d backend
docker compose exec backend nginx -s reload
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/copy-and-reload.sh
```

With these hooks in place, `certbot renew` (invoked by the systemd timer) stops the
backend container, renews the cert, copies the files into `secrets/`, and reloads
Nginx — no manual intervention required. Downtime during renewal is typically under
10 seconds.

---

## Phase 7 — Nightly Backup

Save the backup script, then wire it to a systemd timer. Systemd timers are preferred over
cron: they log to the journal, support dependency ordering, and are inspectable with
`systemctl list-timers`.

### Backup script

```bash
sudo mkdir -p /var/backups/mincom-appraisal
sudo chown mincom:mincom /var/backups/mincom-appraisal

sudo tee /usr/local/bin/mincom-backup.sh > /dev/null <<'SCRIPT'
#!/bin/bash
set -euo pipefail

BACKUP_DIR="/var/backups/mincom-appraisal"
RETAIN_DAYS=30
TIMESTAMP=$(date +"%Y-%m-%d_%H%M%S")
DUMP_FILE="${BACKUP_DIR}/mincom_appraisal_${TIMESTAMP}.sql.gz"
LOG_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}.log"

exec >> "$LOG_FILE" 2>&1

echo "INFO: Backup started at ${TIMESTAMP}"

# Extract DB credentials from .env
DB_PASSWORD=$(grep '^DATABASE_URL=' /opt/mincom-appraisal/.env \
  | sed 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/')

if [[ -z "$DB_PASSWORD" ]]; then
    echo "ERROR: Could not extract DB_PASSWORD from .env" >&2
    exit 1
fi

# Dump and gzip in one pipe — never writes an uncompressed file to disk.
# Pass the password via MYSQL_PWD so it is set inside the container's environment,
# not passed as a -p<password> argument that would show up in `ps` output.
# cd to the project directory so Docker Compose picks up COMPOSE_FILE from .env
# (which sets COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml).
cd /opt/mincom-appraisal
docker compose \
  exec -T \
  -e MYSQL_PWD="$DB_PASSWORD" \
  db \
  sh -c "mysqldump -u mincom_user mincom_appraisal | gzip -9" > "$DUMP_FILE"

echo "INFO: Dump written: ${DUMP_FILE} ($(du -sh "$DUMP_FILE" | cut -f1))"

# -----------------------------------------------------------------------
# Offsite copy — uncomment ONE of the two options below
# -----------------------------------------------------------------------

# Option A: rsync to a separate backup host over SSH
# Requires passwordless SSH key for mincom@backup-host
# rsync -az --no-perms "$DUMP_FILE" mincom@backup-host:/backups/mincom-appraisal/

# Option B: upload to S3-compatible storage (DO Spaces, AWS S3, MinIO)
# Requires rclone configured with a remote named "spaces" (run: rclone config)
# rclone copy "$DUMP_FILE" spaces:mincom-appraisal-backups/ --s3-acl private
# -----------------------------------------------------------------------

# 30-day local retention
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +${RETAIN_DAYS} -delete
echo "INFO: Retention cleanup done (kept last ${RETAIN_DAYS} days)"

echo "INFO: Backup complete"
SCRIPT

sudo chmod +x /usr/local/bin/mincom-backup.sh
```

### systemd service unit

```bash
sudo tee /etc/systemd/system/mincom-backup.service > /dev/null <<'EOF'
[Unit]
Description=MINCOM Appraisal nightly mysqldump
After=docker.service
Requires=docker.service
OnFailure=mincom-backup-alert.service

[Service]
Type=oneshot
User=mincom
WorkingDirectory=/opt/mincom-appraisal
ExecStart=/usr/local/bin/mincom-backup.sh
StandardOutput=journal
StandardError=journal
EOF

# Optional: create a lightweight alert service that fires on backup failure.
# Replace the ExecStart command with your preferred notification mechanism
# (e.g. curl to a Sentry webhook, a Slack webhook, or a simple email via mail(1)).
sudo tee /etc/systemd/system/mincom-backup-alert.service > /dev/null <<'EOF'
[Unit]
Description=Alert on MINCOM backup failure

[Service]
Type=oneshot
ExecStart=/bin/bash -c 'echo "MINCOM backup failed on $(hostname) at $(date -u)" | \
  mail -s "MINCOM backup FAILED" ops@mincom.internal'
# Alternative: POST to a Sentry or webhook URL:
# ExecStart=/usr/bin/curl -s -X POST "https://sentry.io/api/0/projects/<org>/<proj>/events/" \
#   -H "Authorization: DSN <SENTRY_DSN>" -d '{"message":"MINCOM backup failed"}'
EOF
sudo systemctl daemon-reload
```

### systemd timer unit

```bash
sudo tee /etc/systemd/system/mincom-backup.timer > /dev/null <<'EOF'
[Unit]
Description=Trigger MINCOM Appraisal nightly backup at 02:00 UTC

[Timer]
OnCalendar=*-*-* 02:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now mincom-backup.timer
```

Confirm the timer is scheduled:

```bash
systemctl list-timers mincom-backup.timer
```

Test immediately:

```bash
sudo systemctl start mincom-backup.service
# Wait ~60 seconds, then inspect the log
journalctl -u mincom-backup.service -n 30
# Confirm dump file exists
ls -lh /var/backups/mincom-appraisal/
```

---

## Phase 8 — Smoke Test + Reboot Validation

### Pre-flight: time-sync verification

JWT and session expiry depend on accurate UTC time. Verify before the smoke test:

```bash
timedatectl show | grep NTPSynchronized
# Expected: NTPSynchronized=yes
```

If NTP is not synchronised, enable it:

```bash
sudo timedatectl set-ntp true
sudo systemctl restart systemd-timesyncd
timedatectl show | grep NTPSynchronized
```

### Application health check

```bash
# Health endpoint — expect HTTP 200 and "ok" body
curl -sf http://localhost/healthz && echo "PASS" || echo "FAIL"

# All containers should be running or healthy
cd /opt/mincom-appraisal && docker compose ps
```

Expected: `backend`, `php`, `messenger-consume-scheduler`,
`messenger-consume-notifications`, `db`, `redis` — all `running` or `healthy`.

### Login as bootstrap admin

Open a browser and navigate to `https://appraisal.mincom.internal` (or your FQDN). Log in
with the bootstrap admin credentials. Confirm the dashboard loads and the user list is
accessible.

### Escalation email test

Trigger a test notification from the admin panel. Confirm the email arrives in an inbox —
not spam. If it lands in spam, stop and resolve SPF/DKIM with IT before announcing the
system to users.

### Restore-from-backup drill

Do this before go-live, not after an incident.

```bash
# Identify the most recent dump
if ! ls /var/backups/mincom-appraisal/*.sql.gz 1>/dev/null 2>&1; then
    echo "ERROR: No backup files found in /var/backups/mincom-appraisal/" >&2
    exit 1
fi
DUMP=$(ls -t /var/backups/mincom-appraisal/*.sql.gz | head -1)
echo "Restoring from: $DUMP"

# Extract DB password — needed for all mysql calls into the container
DB_PASSWORD=$(grep '^DATABASE_URL=' /opt/mincom-appraisal/.env \
  | sed 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/')
if [[ -z "$DB_PASSWORD" ]]; then
    echo "ERROR: Could not extract DB_PASSWORD from .env" >&2
    exit 1
fi

# cd so Docker Compose picks up COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml from .env
cd /opt/mincom-appraisal

# Create a temporary restore database (MySQL has no OWNER clause — ownership is
# implicit via the GRANTs already in place for mincom_user)
docker compose \
  exec -T \
  -e MYSQL_PWD="$DB_PASSWORD" \
  db mysql -u mincom_user \
  -e "CREATE DATABASE IF NOT EXISTS mincom_appraisal_restore CHARACTER SET utf8mb4;"

# Copy the gzip file into the container, then decompress and restore inside it.
# Consistent with the Day-2 restore pattern — avoids host-tool differences (zcat vs gunzip).
docker compose \
  cp "$DUMP" db:/tmp/restore.sql.gz

docker compose \
  exec -T \
  -e MYSQL_PWD="$DB_PASSWORD" \
  db sh -c "gunzip -c /tmp/restore.sql.gz | mysql -u mincom_user mincom_appraisal_restore && rm /tmp/restore.sql.gz"

# Verify row counts roughly match production
docker compose \
  exec -T \
  -e MYSQL_PWD="$DB_PASSWORD" \
  db mysql -u mincom_user mincom_appraisal_restore \
  -e "SELECT count(*) FROM appraisals_appraisal;"

# Drop the restore database when satisfied
docker compose \
  exec -T \
  -e MYSQL_PWD="$DB_PASSWORD" \
  db mysql -u mincom_user \
  -e "DROP DATABASE mincom_appraisal_restore;"
```

### Reboot validation

```bash
sudo reboot
```

After the server comes back up (allow 2–3 minutes):

```bash
ssh mincom@<server-ip>
cd /opt/mincom-appraisal && docker compose ps
```

All services must be `running` or `healthy` without manual intervention. Docker's
`restart: unless-stopped` policy in `docker-compose.prod.yml` guarantees this on native
Linux — unlike the WSL2 Scheduled Task workaround, no special configuration is required.

If a container has not started, check:

```bash
journalctl -u docker.service -n 50
cd /opt/mincom-appraisal && docker compose logs <service-name>
```

---

## Day-2 Ops for the Support Team

Portainer CE (Phase 5) gives the support team browser-based access for common operations.
Train them on:

- **Restart a service** — Containers → click service → Restart.
- **Tail logs** — Containers → click service → Logs (live tail in browser).
- **Deploy a new version** — update `APP_VERSION` in `/opt/mincom-appraisal/.env`, then
  Stacks → click stack → Update the stack → pull and redeploy.
- **Inspect DB / run one-off SQL** — Containers → `db` → Console → Connect → run `mysql -u mincom_user mincom_appraisal` interactively.
- **Inspect volumes** — Volumes → click volume → Browse files.
- **Check backup timer** — Support team does not need CLI for this; DevOps should forward
  `journalctl -u mincom-backup.service` output via a monitoring alert.

**Restore-from-backup runbook for the support team** (give them this verbatim):

```bash
# SSH to the server as mincom, then:

# 1. Find the latest backup
if ! ls /var/backups/mincom-appraisal/*.sql.gz 1>/dev/null 2>&1; then
    echo "ERROR: No backup files found — check UNC/S3 offsite copy" >&2
    exit 1
fi
DUMP=$(ls -t /var/backups/mincom-appraisal/*.sql.gz | head -1)
echo "Will restore from: $DUMP"

# Extract DB password — needed for all mysql calls into the container
DB_PASSWORD=$(grep '^DATABASE_URL=' /opt/mincom-appraisal/.env \
  | sed 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/')
if [[ -z "$DB_PASSWORD" ]]; then
    echo "ERROR: Could not extract DB_PASSWORD from .env" >&2
    exit 1
fi

# cd so Docker Compose picks up COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml from .env
cd /opt/mincom-appraisal

# 2. Stop the application (prevent writes during restore)
docker compose stop backend php messenger-consume-scheduler messenger-consume-notifications

# 3. Drop and recreate the production database (MySQL has no OWNER clause —
# ownership is implicit via the GRANTs already in place for mincom_user)
docker compose \
  exec -T \
  -e MYSQL_PWD="$DB_PASSWORD" \
  db mysql -u mincom_user \
  -e "DROP DATABASE mincom_appraisal; CREATE DATABASE IF NOT EXISTS mincom_appraisal CHARACTER SET utf8mb4;"

# 4. Copy the gzip file into the container, then decompress and restore inside it
docker compose \
  cp "$DUMP" db:/tmp/restore.sql.gz

docker compose \
  exec -T \
  -e MYSQL_PWD="$DB_PASSWORD" \
  db sh -c "gunzip -c /tmp/restore.sql.gz | mysql -u mincom_user mincom_appraisal && rm /tmp/restore.sql.gz"

# 5. Restart the application
docker compose start backend php messenger-consume-scheduler messenger-consume-notifications

# 6. Verify health
curl -sf http://localhost/healthz && echo "PASS" || echo "FAIL"
```

If the offsite backup must be used instead:

```bash
# Option A — rsync from backup host
rsync mincom@backup-host:/backups/mincom-appraisal/mincom_appraisal_<date>.sql.gz \
  /var/backups/mincom-appraisal/

# Option B — download from S3-compatible storage
rclone copy spaces:mincom-appraisal-backups/mincom_appraisal_<date>.sql.gz \
  /var/backups/mincom-appraisal/
```

Then follow steps 2–6 above.

---

## Concerns and Known Limitations

**1. Ubuntu 24.04 LTS end-of-support: April 2029.**
Aligns with the Windows Server 2019 horizon. Begin planning an upgrade to Ubuntu 26.04 LTS
no later than mid-2028.

**2. 16 GB is adequate at normal load but tight at peak cycle activation.**
The 8 GB headroom is comfortable under typical use. During appraisal cycle activation, bulk
Messenger jobs (notifications, WeasyPrint PDF generation) can spike RAM by 2–4 GB
simultaneously. Monitor with `docker stats --no-stream` during the first cycle. Have a
pre-approved change request to upgrade to 24 GB ready to execute within 48 hours.

**3. Docker bypasses ufw for published ports.**
As noted in Phase 3, Docker writes directly to `iptables`, bypassing `ufw` rules. Mitigate
this by never publishing internal service ports (MySQL, Redis) in `docker-compose.prod.yml`.
Only Nginx (80, 443) and Portainer (9443, restricted) should have `ports:` mappings.

**4. SMTP relay + SPF/DKIM must be confirmed before go-live.**
The application sends escalation emails and appraisal deadline reminders. If the SMTP relay
is misconfigured or SPF/DKIM records are absent for the `MAILER_FROM_ADDRESS` domain, emails
are silently dropped or marked as spam. Test end-to-end with IT before announcing the system.

**5. Single-host — no high availability.**
This deployment has no redundancy. A hardware failure means the application is offline until
the host is recovered. Document the restore SLA explicitly in the service agreement (e.g.
RTO 4 hours, RPO 24 hours from nightly backups). If the appraisal cycle is time-critical,
plan for a warm standby VM before the next major cycle.

**6. `unattended-upgrades` configuration.**
Ubuntu 24.04 installs `unattended-upgrades` by default. Leave it enabled for `-security`
patches but disable automatic upgrades of the Docker CE packages — a Docker daemon upgrade
can restart `containerd`, which terminates all running containers.

```bash
# Exclude Docker repo packages from unattended upgrades
sudo tee -a /etc/apt/apt.conf.d/50unattended-upgrades > /dev/null <<'EOF'
Unattended-Upgrade::Package-Blacklist {
    "docker-ce";
    "docker-ce-cli";
    "containerd.io";
    "docker-compose-plugin";
};
EOF
```

Apply Docker CE upgrades manually during a planned maintenance window.

**7. Cloud vs. on-prem differences.**

- **Cloud VMs (DigitalOcean, AWS EC2):** configure the provider-level security group or
  firewall *in addition to* `ufw`. Provider firewalls apply before traffic reaches the host.
- **DigitalOcean Managed Database / Spaces:** if migrating to managed MySQL or DO Spaces
  for backups later, update `DATABASE_URL` to the managed DB connection string and configure
  `rclone` with the DO Spaces access key. The application code is unchanged.
- **On-prem VMs:** ensure the hypervisor host clock is NTP-synchronised; container time
  inherits the host clock and all JWT/session expiry depends on accurate UTC time.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ValueError: non-hexadecimal number found in fromhex()` | `FIELD_ENCRYPTION_KEY` is base64 instead of hex | Regenerate with `openssl rand -hex 32` |
| `AUDIT_HMAC_KEY must be a valid hex-encoded key` | Same — base64 not hex | Regenerate with `openssl rand -hex 32` |
| `JWT signing key is required in production` | `JWT_PASSPHRASE` not set, or the `symfony_jwt_keys` volume was deleted/recreated | Set `JWT_PASSPHRASE` in `.env` and confirm `docker-compose.prod.yml` declares the `symfony_jwt_keys` named volume mounted at `/app/config/jwt` in the `php` service; recreate `php` so `entrypoint.sh` regenerates the keypair |
| `Failed to load private key: /run/secrets/redis_tls_key … Permission denied` | `chmod 600` on host file — in-container UID 999 (Redis) cannot read it | `chmod 644 secrets/redis_tls_key.pem secrets/redis_tls_cert.pem` on the host |
| `dependency redis failed to start` (Redis shows `Up` but `unhealthy`) | Healthcheck still targets plaintext port 6379; TLS mode disables it | Confirm the healthcheck override in `docker-compose.prod.yml` is present (targets port 6380 with `--tls`) and that the operator pulled the latest compose file |
| Messenger consumer logs `NameResolutionError` for `sentry.io`; Sentry events missing | `messenger-consume-scheduler`/`messenger-consume-notifications` was on the `internal: true` network with no egress | Add `frontend_net` to the `networks:` list for both services in `docker-compose.prod.yml`. If `SENTRY_DSN` is unset the SDK is a no-op and these warnings do not appear. |
| `service "messenger-consume-scheduler" refers to undefined volume "symfony_jwt_keys": invalid compose project` | Only the prod overlay was loaded without the base file | Set `COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml` in `.env` (see Phase 4) |
| Unexpected `axllent/mailpit` pull/start in production | Dev-only service not under a profile | Ensure the operator pulled the latest `docker-compose.yml` (`mailpit` is `profiles: ["dev"]`); run `docker compose --profile '' up -d` to skip dev profiles explicitly if needed |
| `Permission denied while trying to connect to … docker.sock` | `mincom` user not in docker group, or group not active in current shell | `sudo usermod -aG docker mincom` then log out and back in; or run `newgrp docker` in the current shell |
| `Cannot connect to redis://:**@redis:6379/0: Error 111 connecting to redis:6379. Connection refused` | Using plaintext scheme/port; prod Redis only listens on TLS port 6380 | Change `REDIS_URL` and `MESSENGER_TRANSPORT_DSN` in `.env` to use `rediss://` on port 6380 (both use the same scheme; only the TLS query-param syntax differs — `ssl_cert_reqs` for `REDIS_URL`, bracketed `ssl[...]` for `MESSENGER_TRANSPORT_DSN`) |
| nginx fails to start; `cannot load certificate "/run/secrets/ssl_cert.pem": No such file or directory` | TLS cert secrets not declared or cert files not generated in `secrets/` | Run Phase 6 Option A (self-signed) or Option B (corporate CA) to create `secrets/ssl_cert.pem` and `secrets/ssl_key.pem`, then `docker compose up -d backend` |
| Browser shows "Your connection is not private" / `NET::ERR_CERT_AUTHORITY_INVALID` | Self-signed certificate; browser does not trust it | Expected for Option A. Click **Advanced → Proceed** (intranet). To eliminate the warning permanently, import `secrets/ssl_cert.pem` into the corporate CA store via Group Policy (Windows) or `update-ca-certificates` (Linux). |
| `dev*` or `<CHANGE-ME>` passwords still in production `.env` | Copied from `.env.example` without rotation | Generate new passwords with `openssl rand -base64 32 \| tr -d '/+="'` and update all `*_PASSWORD` variables and the URLs that embed them (`DATABASE_URL`, `REDIS_URL`, `MESSENGER_TRANSPORT_DSN`) |
| nginx perpetually unhealthy; logs show `"GET /healthz HTTP/1.1" 301 162` | Healthcheck hits HTTP port 8080; prod nginx redirects all traffic to HTTPS, so wget receives a 301 and treats it as failure | `default.prod.conf`'s HTTP block has a `/healthz` location that returns 200 before the redirect; confirm `docker-compose.prod.yml`'s healthcheck override targets HTTPS port 8443 directly; pull the latest compose and image and restart `backend` |
