# MINCOM Appraisal — Windows Server 2019 Production Deployment Runbook

**Target host:** Windows Server 2019 (build 19041+, KB4566116+), 16 GB RAM
**Runtime:** Docker Desktop for Windows with the WSL2 backend
**Images:** `ghcr.io/ejay4u/mincom-appraisal/...`
**Compose file:** `docker-compose.prod.yml`
**User base:** ~500 users
**Audience:** Windows sysadmin comfortable with PowerShell; Linux familiarity not assumed.

---

## Licensing Decision — Read Before Proceeding

Docker Desktop is **free** for personal use, small businesses (fewer than 250 employees AND under $10 M USD annual revenue), education, and non-commercial open source.

For commercial use at organisations that exceed either threshold, a paid **Docker Business** subscription is required (currently ~$21 USD per admin/operator seat per month — this is per person who operates Docker, not per application user).

Before proceeding, confirm with procurement:

- [ ] Is MINCOM below both the 250-employee and $10 M revenue thresholds? If yes, free tier applies.
- [ ] If not, has a Docker Business subscription been purchased for the sysadmin(s) who will manage this server?
- [ ] Has legal signed off on the [Docker Subscription Service Agreement](https://www.docker.com/legal/docker-subscription-service-agreement/)?

Do not proceed with installation until procurement has provided written confirmation.

---

## Memory Budget — 16 GB / ~500 Users

| Component | Reserved |
|---|---|
| Windows Server kernel + Docker Desktop tray + WSL2 VM overhead | ~4.5 GB |
| MySQL (innodb_buffer_pool_size + connections) | ~3.0 GB |
| Redis (maxmemory 512 MB + overhead) | ~0.5 GB |
| PHP-FPM application container (`php`) | ~1.5 GB |
| Messenger consumers (`messenger-consume-scheduler` + `messenger-consume-notifications`) | ~1.0 GB |
| `backend` (nginx: TLS termination, the built SPA, and FastCGI to `php`) + Portainer CE | ~1.0 GB |
| **Used** | **~11.5 GB** |
| **Headroom** | **~4.5 GB** |

> **For smaller hosts (e.g. 8 GB):** the container limits in `docker-compose.prod.yml` are tuned for ~7.75 GB hosts (5 GB containers + 2.75 GB OS/cache). At this size, expect comfortable capacity for ~200 concurrent users and degraded performance for 500 concurrent users under peak operations (cycle activation, mass PDF export). To scale beyond 200 active concurrent users, upgrade the host to 16 GB.

Docker Desktop's GUI process and WSL2 VM management layer consume roughly 2 GB more than running Docker Engine directly in WSL2. The 4.5 GB headroom is workable for normal operation but tighter than the Engine-in-WSL2 path (~6 GB headroom). During cycle activation — when hundreds of employees open appraisal forms simultaneously and the Messenger consumers process bulk notification jobs — RAM spikes of 2–4 GB are expected. Monitor closely during the first cycle activation and have a pre-approved change request to expand to 24 GB RAM ready to execute within 48 hours if metrics warrant it.

The WSL2 backend's memory ceiling is configured via `.wslconfig` (see Concerns section). Set it explicitly before go-live.

---

## Pre-Deployment Checklist

Before touching the server, confirm all of the following with IT.

**Windows / networking:**

- [ ] Server is patched to build 19041+ with KB4566116 installed (required for WSL2)
- [ ] Virtualisation is enabled in BIOS/Hyper-V (WSL2 requires Hyper-V virtualisation extensions)
- [ ] Static IP assigned on the corporate LAN, confirmed in DNS as `appraisal.mincom.internal` (or your chosen FQDN)
- [ ] Firewall rules allow inbound 443 (HTTPS) and 80 (HTTP redirect) from corporate network
- [ ] IT VLAN CIDR noted (needed for Portainer firewall rule — Phase 5)
- [ ] UNC backup share path confirmed, e.g. `\\fileserver\backups\mincom-appraisal\`, and the `mincom-docker` account has write access (see Phase 3)
- [ ] SMTP relay server, port, credentials, SPF/DKIM confirmed — **do not go live without this**, or escalation emails will land in junk

**Accounts / secrets:**

- [ ] Licensing confirmed with procurement (see above)
- [ ] GHCR personal access token (PAT) created at `github.com/settings/tokens` with `read:packages` scope — note the token value, you will not see it again
- [ ] `APP_VERSION` tag agreed with the dev team (e.g. `v1.2.0`) — never deploy `latest`
- [ ] `.env` values prepared (see Phase 4)
- [ ] TLS certificate and key files available (corporate CA or self-signed for internal use)
- [ ] Redis TLS cert/key generated (see Phase 4)

---

## Phase 1 — Install WSL2 Prerequisites

Docker Desktop bundles its own WSL2 distributions (`docker-desktop` and `docker-desktop-data`). You do **not** need to install Ubuntu manually — the Docker Desktop installer handles that. You only need to enable the Windows features and update the WSL2 kernel.

Open PowerShell as Administrator.

```powershell
# Enable required Windows features
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart

# Reboot
Restart-Computer -Force
```

After the reboot, open PowerShell as Administrator again.

```powershell
# Download and install the WSL2 Linux kernel update package
$wslKernelUrl = "https://wslstorestorage.blob.core.windows.net/wslblob/wsl_update_x64.msi"
$wslKernelMsi = "$env:TEMP\wsl_update_x64.msi"
Invoke-WebRequest -Uri $wslKernelUrl -OutFile $wslKernelMsi
Start-Process msiexec.exe -Wait -ArgumentList "/I $wslKernelMsi /quiet"

# Set WSL2 as the default version
wsl --set-default-version 2
```

---

## Phase 2 — Install Docker Desktop

Run the following from PowerShell as Administrator. This performs a silent install with the WSL2 backend.

The URL below points to the `main` channel (latest release). For a pinned version, see
https://docs.docker.com/desktop/release-notes/ and substitute the direct download URL for
the specific release you have tested and approved.

```powershell
$installerUrl  = "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe"
$installerPath = "$env:TEMP\DockerDesktopInstaller.exe"
Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath
Start-Process -Wait -FilePath $installerPath `
    -ArgumentList "install --quiet --accept-license --backend=wsl-2"
```

Reboot when the installer finishes.

```powershell
Restart-Computer -Force
```

After the reboot, log in to the server console (or RDP) and complete the first-run setup:

1. Launch **Docker Desktop** from the Start menu.
2. Accept the licence agreement when prompted.
3. Open **Settings → General** and confirm:
   - "Use the WSL 2 based engine" is **on**.
   - "Start Docker Desktop when you log in" is **on**.
   - "Open Docker Dashboard at startup" is **off** (reduces noise on a server desktop).
4. Open **Settings → Software updates** and **uncheck "Always update Docker Desktop automatically"**. Apply updates manually during planned maintenance windows — automatic updates have caused unexpected restarts in production environments.
5. Click **Apply & Restart**.

Verify the installation from PowerShell:

```powershell
docker version
docker compose version
```

Both commands must return version output before proceeding.

---

## Phase 3 — Configure Unattended Startup

Docker Desktop requires an active Windows user session to keep its daemon running. The production pattern for unattended servers is:

1. Create a dedicated local admin account `mincom-docker`.
2. Configure auto-login so that account signs in automatically on boot.
3. Lock the screen immediately after auto-login so the console is never unattended.
4. Docker Desktop — already configured to start on login (Phase 2) — starts within ~2 minutes of the auto-login firing.

**Step 1 — Create the `mincom-docker` account**

```powershell
# Generate a long random password — store this in your team's secret manager
$securePassword = (New-Guid).Guid + (New-Guid).Guid -replace "-", ""
$securePassword = $securePassword.Substring(0, 48)

Write-Host "SAVE THIS PASSWORD NOW: $securePassword"

New-LocalUser -Name "mincom-docker" `
    -Password (ConvertTo-SecureString $securePassword -AsPlainText -Force) `
    -FullName "MINCOM Docker Service Account" `
    -PasswordNeverExpires `
    -UserMayNotChangePassword

Add-LocalGroupMember -Group "Administrators" -Member "mincom-docker"
```

**Step 2 — Configure auto-login via registry**

> **WARNING:** The commands below store the `mincom-docker` password in **plaintext** in the
> Windows registry under `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon`. Any
> local user who can read that key can extract the password. The default ACL already restricts
> that key to Administrators, but verify it: run `Get-Acl "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" | Format-List` and confirm that only `BUILTIN\Administrators` and
> `NT AUTHORITY\SYSTEM` have Full Control. Revoke any non-Administrator read access
> immediately after setting these registry values.

```powershell
$RegPath = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"
Set-ItemProperty -Path $RegPath -Name "AutoAdminLogon"  -Value "1"
Set-ItemProperty -Path $RegPath -Name "DefaultUserName" -Value "mincom-docker"
Set-ItemProperty -Path $RegPath -Name "DefaultPassword" -Value $securePassword
Set-ItemProperty -Path $RegPath -Name "DefaultDomainName" -Value $env:COMPUTERNAME
```

**Step 3 — Lock the screen immediately after auto-login**

Create a startup script that fires when `mincom-docker` signs in and immediately locks the workstation:

```powershell
$startupFolder = "C:\Users\mincom-docker\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup"
New-Item -ItemType Directory -Force -Path $startupFolder | Out-Null

$lockScript = @"
rundll32.exe user32.dll,LockWorkStation
"@
Set-Content -Path "$startupFolder\lock-on-login.bat" -Value $lockScript
```

**Step 4 — Set Docker Desktop per-user settings as `mincom-docker`**

The "Start Docker Desktop when you log in" setting is stored per user profile. You configured it in Phase 2 while logged in as the current admin. You must also verify it while logged in as `mincom-docker`:

1. RDP to the server and log in as `mincom-docker`.
2. Docker Desktop should start automatically. If it does not, launch it manually.
3. Confirm **Settings → General → Start Docker Desktop when you log in** is **on**.
4. Sign out (not reboot — just sign out).

**Step 5 — Test the full unattended boot cycle**

```powershell
Restart-Computer -Force
```

After the server comes back up (allow 3–5 minutes):

- The server should auto-login as `mincom-docker` and immediately lock the screen.
- Docker Desktop should start within ~2 minutes of the lock screen appearing.

Verify from a separate PowerShell session (RDP or remote):

```powershell
docker ps
```

An empty container list (no error) confirms Docker Desktop's daemon is reachable. If you see "error during connect", wait 30 seconds and retry — the WSL2 backend takes a moment on first boot.

---

## Phase 4 — Bring Up the Application Stack

All commands in this phase run in **PowerShell on the Windows host**. Docker Desktop installs the `docker` and `docker compose` CLI tools directly on Windows, so there is no need to enter a WSL shell.

```powershell
# Create the app directory
New-Item -ItemType Directory -Force -Path "C:\opt\mincom-appraisal"

# Clone the repository using Git for Windows
# Install Git for Windows from https://git-scm.com/download/win if not already present
git clone https://github.com/ejay4u/mincom-appraisal.git C:\opt\mincom-appraisal

Set-Location C:\opt\mincom-appraisal

# Copy the env template and populate every value
Copy-Item .env.example .env
notepad .env
```

Generate the secret values you will need before editing `.env`. Run these in PowerShell:

```powershell
# APP_SECRET — Symfony's own framework secret (CSRF tokens, signed URIs, etc.),
# 32 raw bytes, hex-encoded. Equivalent generation: openssl rand -hex 32
$asBytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($asBytes)
"APP_SECRET=" + (($asBytes | ForEach-Object { $_.ToString("x2") }) -join "")

# FIELD_ENCRYPTION_KEY — must be a 64-character hex string (32 raw bytes).
# App\Service\FieldEncryptor calls hex2bin(FIELD_ENCRYPTION_KEY) at startup;
# a malformed value fails with: FIELD_ENCRYPTION_KEY must be a hex-encoded 32-byte (64 hex character) key.
$fekBytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($fekBytes)
"FIELD_ENCRYPTION_KEY=" + (($fekBytes | ForEach-Object { $_.ToString("x2") }) -join "")

# AUDIT_HMAC_KEY — hex-encoded key used as the HMAC-SHA256 signing key for
# every AuditLog entry's tamper-detection hash (see Entity\AuditLog).
$hmacBytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($hmacBytes)
"AUDIT_HMAC_KEY=" + (($hmacBytes | ForEach-Object { $_.ToString("x2") }) -join "")

# JWT_PASSPHRASE — protects the JWT signing keypair. Unlike the old Django
# service, the RSA keypair itself is NOT generated by hand here — see the
# note after the mandatory `.env` block below.
$jwtBytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($jwtBytes)
"JWT_PASSPHRASE=" + (($jwtBytes | ForEach-Object { $_.ToString("x2") }) -join "")
```

Store all generated values in your team's secret manager before pasting them into `.env`.

> **IMPORTANT — rotate ALL passwords before starting the stack.** If you copied
> `.env` from `.env.example`, every `<CHANGE-ME-USE-OPENSSL-RAND>` placeholder must be
> replaced with a real secret before running `docker compose up -d`.  A deployment with
> placeholder values still in place is a critical security exposure.  Generate each
> password with Git-for-Windows OpenSSL:
> `& "$Env:ProgramFiles\Git\usr\bin\openssl.exe" rand -base64 32`
> then strip unsafe URL characters manually before pasting.

Mandatory `.env` values for this deployment (all others in `.env.example` also apply):

```
APP_SECRET=<generated above>
APP_ENV=prod

DATABASE_URL=mysql://mincom_user:<db_password>@db:3306/mincom_appraisal?serverVersion=8.0.32&charset=utf8mb4
DB_PASSWORD=<db_password>   # must match the password in DATABASE_URL

# rediss:// = Redis over TLS; port 6380 (prod Redis disables plaintext 6379);
# ?ssl_cert_reqs=none skips cert verification for the self-signed Redis TLS cert.
REDIS_URL=rediss://:<redis_password>@redis:6380/0?ssl_cert_reqs=none
REDIS_PASSWORD=<redis_password>   # must match the password in REDIS_URL and MESSENGER_TRANSPORT_DSN below
                                  # must NOT contain a literal " character — the redis
                                  # healthcheck command will break; generate with a charset
                                  # that excludes it, e.g.: openssl rand -base64 32 | tr -d '/+="'

# Symfony's redis-messenger transport (backs the async/scheduler_main/
# notification_email queues — see config/packages/messenger.yaml) uses the
# same rediss:// scheme as REDIS_URL above (the transport factory only
# recognizes redis:/rediss:/valkey:/valkeys: as scheme prefixes — a bare
# tls:// scheme is rejected), but passes TLS options as bracketed ssl[...]
# query params rather than ssl_cert_reqs. Database index /2, distinct from
# the cache's /0 above.
MESSENGER_TRANSPORT_DSN=rediss://:<redis_password>@redis:6380/2?ssl[verify_peer]=0&ssl[verify_peer_name]=0

FIELD_ENCRYPTION_KEY=<generated above>
AUDIT_HMAC_KEY=<generated above>

# JWT_PASSPHRASE protects the signing keypair, which entrypoint.sh generates
# automatically on first container boot (php bin/console lexik:jwt:generate-keypair
# --skip-if-exists) into the symfony_jwt_keys named volume — no manual RSA
# keypair generation or file-mount secrets needed. See the note below.
JWT_PASSPHRASE=<generated above>
JWT_ACCESS_TOKEN_LIFETIME_MINUTES=15
JWT_REFRESH_TOKEN_LIFETIME_DAYS=7

NGINX_HOST=appraisal.mincom.internal

# Production uses Postmark's SMTP relay (not Postmark's HTTP API) — the
# server token is used as BOTH username and password. Percent-encode any
# literal "@" in the token as %40.
MAILER_DSN=smtp://<postmark-server-token>:<postmark-server-token>@smtp.postmarkapp.com:587
MAILER_FROM_ADDRESS=appraisal@mincom.internal
POSTMARK_MESSAGE_STREAM=outbound

SENTRY_DSN=<from your Sentry project>
ENVIRONMENT=production
APP_VERSION=v1.2.0      # <-- use a real released tag, never "latest"
```

> **No `ALLOWED_HOSTS` / `CSRF_TRUSTED_ORIGINS` / `CORS_ALLOWED_ORIGINS` equivalent needed.**
> Django validated the HTTP `Host` header against `ALLOWED_HOSTS` and required scheme-qualified
> entries in `CSRF_TRUSTED_ORIGINS`/`CORS_ALLOWED_ORIGINS`. Symfony has no equivalent host-allowlist
> setting to configure here — `APP_ENV=prod` covers environment selection, and Symfony trusts
> requests forwarded by the bundled nginx in front of it. There is nothing to replace these three
> variables with; simply omit them from `.env`.

Configure Compose to always load both the base and prod overlay files. Add this to `.env`
so that every subsequent `docker compose` command automatically uses the correct file
combination without needing `-f` flags:

```powershell
Add-Content -Path "C:\opt\mincom-appraisal\.env" -Value "COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml"
```

Without this line, running `docker compose up` with only `docker-compose.prod.yml` causes
errors about undefined services/volumes (e.g. `backend` or `symfony_jwt_keys`) because the
base service and volume definitions live in `docker-compose.yml`.

Generate the Redis TLS certificates (PowerShell, requires OpenSSL — bundled with Git for Windows):

```powershell
$SecretsDir = "C:\opt\mincom-appraisal\secrets"
New-Item -ItemType Directory -Force -Path $SecretsDir | Out-Null

openssl req -x509 -newkey rsa:2048 -nodes -days 3650 `
  -subj "/CN=redis" `
  -keyout "$SecretsDir\redis_tls_key.pem" `
  -out    "$SecretsDir\redis_tls_cert.pem"
```

> **No manual JWT keypair generation needed.** Unlike the old Django backend, there is no
> `secrets\jwt_private.pem` / `secrets\jwt_public.pem` pair to generate by hand and no
> `JWT_PRIVATE_KEY_PATH` / `JWT_PUBLIC_KEY_PATH` env vars to set. `symfony-backend/entrypoint.sh`
> runs `php bin/console lexik:jwt:generate-keypair --skip-if-exists --no-interaction` on first
> container boot, encrypting the private key with `JWT_PASSPHRASE` (set in `.env` above) and
> writing the keypair into the `symfony_jwt_keys` named Docker volume, mounted at
> `/app/config/jwt` in the `php` service. The step is idempotent — it only runs once, on the
> first boot where the volume is empty.
>
> **WARNING — the `symfony_jwt_keys` volume is irreplaceable.** Losing it (e.g. `docker volume rm`,
> or redeploying with a fresh volume) invalidates every issued JWT and forces all users to
> re-login, and running multiple replicas against different volumes would sign tokens
> inconsistently. Back up the volume alongside the database, and never delete it as part of a
> routine redeploy.

**Why no explicit permission restriction on Windows?** Docker Desktop translates Windows
NTFS paths into the WSL2 filesystem using its own UID mapping. The certificate files are
accessible only within the Docker Desktop environment and are not directly reachable from
other Windows processes by default. On Linux hosts, `chmod 644` is required because the
in-container Redis process (UID 999) must be able to read the key file even though it is
not the owner. If you later migrate to a native Linux host, apply `chmod 644` to both
`.pem` files (not 600 — see the Ubuntu runbook for the full explanation).

Log in to GHCR and pull images:

```powershell
# Use the PAT you created in the pre-deployment checklist
"<YOUR_GHCR_PAT>" | docker login ghcr.io -u <github_username> --password-stdin
```

Bring up the stack:

```powershell
Set-Location C:\opt\mincom-appraisal

$env:APP_VERSION = "v1.2.0"   # must match APP_VERSION in .env
```

> **Note:** `APP_VERSION` must match a tag published to GHCR at
> `https://github.com/ejay4u/mincom-appraisal/pkgs/container/mincom-appraisal%2Fsymfony-backend`.
> If the tag does not exist in GHCR, Compose silently falls back to building the image
> locally from source — which is slow and is not the supported production path. Verify
> the tag exists before running `docker compose pull`.

```powershell
# COMPOSE_FILE in .env means -f flags are not needed here or in any day-2 command
docker compose pull

docker compose up -d

# Verify all services are healthy
docker compose ps
```

All services should show `running` or `healthy`. The `init-permissions` service showing `exited (0)` is expected — it is a one-shot container.

> **Startup ordering — `php` completes init before the Messenger consumers start.**
> On a fresh deployment, `entrypoint.sh` in the `php` container runs the JWT keypair
> generation (skipped if the volume already has one), Doctrine migrations (`doctrine:migrations:migrate`,
> which also applies the reference/lookup data migrations — BSC Perspectives, Competencies,
> Score Descriptors — so there is no separate seed step), and the opt-in `app:bootstrap-admin` /
> `app:bootstrap-superuser` commands, before `php`'s healthcheck (`php-fpm-healthcheck`) passes.
> `messenger-consume-scheduler` and `messenger-consume-notifications` declare
> `php: condition: service_healthy` in their `depends_on` block, so Docker Compose holds them
> until `php` reports healthy. You can observe this with `docker compose ps` immediately after
> `docker compose up -d`: `php` will show `starting` (running init) while the two messenger
> containers show `created` or `starting`. Within ~30 seconds of `php` turning `healthy`, both
> messenger containers start consuming their queues. Note that, as currently wired, the
> messenger containers share the same entrypoint and do **not** set `SKIP_INIT`, so each one
> also re-runs the migration/keypair/bootstrap sequence on its own startup — harmless because
> every step is idempotent, just slightly redundant log noise ("nothing to migrate", "keypair
> already exists", etc.).

---

## Phase 5 — Portainer CE

Portainer gives the support team a browser-based UI to view container logs, restart services, and inspect volumes without needing CLI access. The container runs inside Docker Desktop's WSL2 backend; port 9443 is forwarded to the Windows host automatically.

```powershell
docker volume create portainer_data

docker run -d `
  --name portainer `
  --restart always `
  -p 127.0.0.1:9443:9443 `
  -v /var/run/docker.sock:/var/run/docker.sock:ro `
  -v portainer_data:/data `
  portainer/portainer-ce:2.21.0
```

By binding to `127.0.0.1:9443`, the port is not reachable from the network by default — access requires an SSH tunnel or a jump host. To reach Portainer, open an SSH tunnel from your admin workstation:

```powershell
# From your admin workstation (PowerShell or any SSH client)
ssh -L 9443:127.0.0.1:9443 mincom-docker@<server-ip>
# Then open https://localhost:9443 in your browser
```

If your team prefers direct access from an IT management VLAN instead, change the bind address back to `0.0.0.0:9443` and restrict it at the Windows Firewall level. Replace `10.10.5.0/24` with your actual IT VLAN CIDR:

```powershell
New-NetFirewallRule `
  -DisplayName "Portainer CE — IT VLAN only" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 9443 `
  -RemoteAddress "10.10.5.0/24" `
  -Action Allow

New-NetFirewallRule `
  -DisplayName "Portainer CE — block all others" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 9443 `
  -RemoteAddress Any `
  -Action Block `
  -Enabled True
```

The loopback-bind approach (default above) is more secure and matches the Ubuntu runbook.

---

## Phase 6 — TLS

All three options below write the final certificate and key to:

```
C:\opt\mincom-appraisal\secrets\ssl_cert.pem   ← certificate (+ chain)
C:\opt\mincom-appraisal\secrets\ssl_key.pem    ← private key (no passphrase)
```

`docker-compose.prod.yml` declares these as Docker secrets, which Docker mounts inside
the backend container at `/run/secrets/ssl_cert.pem` and `/run/secrets/ssl_key.pem` — the
exact paths `symfony-backend/docker/nginx/default.prod.conf` references.  Every option ends at the same outcome:
Nginx serving HTTPS on port 443.

Choose one option based on your network topology.

### Option A: Self-signed certificate (intranet / IP-based, no public DNS)

Use this path when the deployment is reachable only on the corporate LAN and has no
public DNS name — for example, when operators access it via IP address or an internal
hostname like `appraisal.mincom.internal`.

These commands use the OpenSSL binary bundled with Git for Windows:

```powershell
$SecretsDir = "C:\opt\mincom-appraisal\secrets"
New-Item -ItemType Directory -Force -Path $SecretsDir | Out-Null

# Replace <server-ip> and <internal-hostname> with the actual values.
# -addext SAN is required — modern browsers reject certs without a Subject Alternative Name.
& "$Env:ProgramFiles\Git\usr\bin\openssl.exe" req -x509 -newkey rsa:2048 -nodes -days 3650 `
  -subj "/CN=<server-ip-or-hostname>" `
  -addext "subjectAltName=IP:<server-ip>,DNS:<internal-hostname>" `
  -keyout "$SecretsDir\ssl_key.pem" `
  -out    "$SecretsDir\ssl_cert.pem"

Set-Location C:\opt\mincom-appraisal
docker compose up -d backend
```

> **Browser warning — expected behaviour:** Browsers will show "Your connection is not
> private" (`NET::ERR_CERT_AUTHORITY_INVALID`) because the certificate is self-signed and
> not trusted by the OS certificate store.  Click **Advanced → Proceed** to continue.
> This is normal for intranet deployments.  To eliminate the warning, import
> `secrets\ssl_cert.pem` into the corporate CA store via Group Policy (Trusted Root
> Certification Authorities).

### Option B: Corporate / internal CA certificate

Use this path when your IT department issues certificates from a corporate CA — the
certificate is already trusted by all corporate workstations.

```powershell
$SecretsDir = "C:\opt\mincom-appraisal\secrets"
New-Item -ItemType Directory -Force -Path $SecretsDir | Out-Null

# Copy your corporate-issued certificate files to the server (e.g. via RDP file transfer
# or a network share), then install them into the secrets\ directory:
#   fullchain.pem  — certificate + any intermediate CA chain (concatenated PEM)
#   privkey.pem    — private key (no passphrase)
Copy-Item "C:\path\to\fullchain.pem" "$SecretsDir\ssl_cert.pem" -Force
Copy-Item "C:\path\to\privkey.pem"   "$SecretsDir\ssl_key.pem"  -Force

Set-Location C:\opt\mincom-appraisal
docker compose up -d backend
```

Verify Nginx loaded the certificate:

```powershell
docker compose logs backend | Select-String "ssl|start|error"
```

### Option C: Let's Encrypt (public internet deployments)

Let's Encrypt requires a publicly reachable domain and an HTTP-01 ACME challenge on
port 80.  On Windows Server, the simplest approach is to run certbot inside a temporary
Docker container that binds port 80, obtain the certificate, copy the files into
`secrets\`, and then start Nginx.

> **Note:** `certbot --nginx` manages a host-level Nginx binary and will not work here
> because Nginx runs inside a container.  Use `--standalone` mode.

```powershell
# Stop Nginx to free port 80 for the ACME challenge
Set-Location C:\opt\mincom-appraisal
docker compose stop backend

# Run certbot standalone in a temporary container.
# Replace appraisal.mincom.com and admin@mincom.com with your actual values.
docker run --rm -it `
  -p 80:80 `
  -v "C:\opt\mincom-appraisal\letsencrypt:/etc/letsencrypt" `
  certbot/certbot:latest certonly --standalone `
  -d appraisal.mincom.com `
  --non-interactive --agree-tos `
  -m admin@mincom.com

# Copy the issued files into the Docker secrets directory.
# The backend container does NOT bind-mount the letsencrypt directory, so the files
# must be copied here explicitly.
$LiveDir = "C:\opt\mincom-appraisal\letsencrypt\live\appraisal.mincom.com"
$SecretsDir = "C:\opt\mincom-appraisal\secrets"
New-Item -ItemType Directory -Force -Path $SecretsDir | Out-Null
Copy-Item "$LiveDir\fullchain.pem" "$SecretsDir\ssl_cert.pem" -Force
Copy-Item "$LiveDir\privkey.pem"   "$SecretsDir\ssl_key.pem"  -Force

# Start Nginx
docker compose up -d backend
```

For automated renewal, create a scheduled Task Scheduler job that runs monthly.  Save the
following script as `C:\Scripts\mincom-renew-cert.ps1`:

```powershell
# mincom-renew-cert.ps1 — renew Let's Encrypt cert and reload Nginx
# Must run as mincom-docker (Docker Desktop is session-bound)

Set-Location C:\opt\mincom-appraisal

# Stop Nginx to free port 80
docker compose stop backend

# Renew — certbot will skip if cert is not yet due for renewal
docker run --rm `
  -p 80:80 `
  -v "C:\opt\mincom-appraisal\letsencrypt:/etc/letsencrypt" `
  certbot/certbot:latest renew --standalone --non-interactive

# Copy renewed files (certbot updates live/ in place on renewal)
$LiveDir   = "C:\opt\mincom-appraisal\letsencrypt\live\appraisal.mincom.com"
$SecretsDir = "C:\opt\mincom-appraisal\secrets"
Copy-Item "$LiveDir\fullchain.pem" "$SecretsDir\ssl_cert.pem" -Force
Copy-Item "$LiveDir\privkey.pem"   "$SecretsDir\ssl_key.pem"  -Force

# Restart Nginx with the new cert
docker compose up -d backend
docker compose exec backend nginx -s reload
```

Register the renewal task (run as Administrator, replace the password):

```powershell
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NonInteractive -ExecutionPolicy Bypass -File C:\Scripts\mincom-renew-cert.ps1"

$trigger = New-ScheduledTaskTrigger -Monthly -DaysOfMonth 1 -At "03:00"

$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:COMPUTERNAME\mincom-docker" `
    -LogonType Password `
    -RunLevel Highest

Register-ScheduledTask `
    -TaskName "MINCOM Renew TLS Certificate" `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Password "<mincom-docker-password>" `
    -Description "Monthly Let's Encrypt cert renewal for MINCOM Appraisal."
```

---

## Phase 7 — Nightly Backup

Because Docker Desktop's daemon is accessible from the `mincom-docker` user session, `docker compose exec` works directly from PowerShell — no `wsl -d Ubuntu-22.04 -- bash -c "..."` wrapper is needed. This is one of the concrete operational wins over the Engine-in-WSL2 path.

**Important:** the Task Scheduler task in this phase must run **as `mincom-docker`**, not as SYSTEM. Docker Desktop's socket is bound to the desktop user's session; SYSTEM cannot reach it.

Save the following script as `C:\Scripts\mincom-backup.ps1`.

```powershell
# mincom-backup.ps1 — Nightly mysqldump of the MINCOM Appraisal database
# Must run as mincom-docker (NOT SYSTEM) — Docker Desktop is session-bound.

$BackupRoot = "C:\Backups\mincom-appraisal"
$UncShare   = "\\fileserver\backups\mincom-appraisal"
$RetainDays = 30
$Timestamp  = (Get-Date -Format "yyyy-MM-dd_HHmmss")
$DumpFile   = "$BackupRoot\mincom_appraisal_$Timestamp.sql.gz"
$LogFile    = "$BackupRoot\backup_$Timestamp.log"

New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

# Load DB password from .env
$EnvFile    = "C:\opt\mincom-appraisal\.env"
$DbPassword = (Get-Content $EnvFile |
    Where-Object { $_ -match "^DATABASE_URL=" }) -replace '.*:([^@]+)@.*', '$1'

if ([string]::IsNullOrEmpty($DbPassword) -or $DbPassword.StartsWith("DATABASE_URL=")) {
    Write-Error "Failed to extract DB_PASSWORD from .env DATABASE_URL"
    exit 1
}

# Run mysqldump + gzip entirely inside the db container.
# Pass the password via MYSQL_PWD so it is set inside the container's environment,
# not passed as a -p<password> argument that would show up in process listings.
# PowerShell '>' redirection receives the already-gzipped byte stream from container stdout.
# If your PowerShell host mangles bytes with '>', replace the last line with the cp fallback:
#   docker compose cp $DumpFile db:/tmp/restore.sql.gz
# Set-Location so Docker Compose reads COMPOSE_FILE from C:\opt\mincom-appraisal\.env
Set-Location "C:\opt\mincom-appraisal"
docker compose `
    exec -T `
    -e MYSQL_PWD=$DbPassword `
    db `
    sh -c "mysqldump -u mincom_user mincom_appraisal | gzip -9" > $DumpFile

if ($LASTEXITCODE -ne 0) {
    "ERROR: mysqldump failed at $Timestamp — exit code $LASTEXITCODE" |
        Tee-Object -FilePath $LogFile
    exit 1
}

"INFO: Dump completed: $DumpFile" | Tee-Object -FilePath $LogFile

# Mirror to UNC share
try {
    Copy-Item -Path $DumpFile -Destination $UncShare -Force
    "INFO: Copied to $UncShare" | Add-Content $LogFile
} catch {
    "ERROR: Failed to copy to UNC share — $_" | Add-Content $LogFile
    exit 1
}

# 30-day local retention
Get-ChildItem -Path $BackupRoot -Filter "*.sql.gz" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetainDays) } |
    Remove-Item -Force

"INFO: Retention cleanup complete. Kept last $RetainDays days." | Add-Content $LogFile
```

Register the Task Scheduler job. This task runs as `mincom-docker` with a stored password so it has access to the Docker socket. Open PowerShell as Administrator and replace `<mincom-docker-password>` with the actual password from your secret manager:

```powershell
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NonInteractive -ExecutionPolicy Bypass -File C:\Scripts\mincom-backup.ps1"

$trigger = New-ScheduledTaskTrigger -Daily -At "02:00"

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
    -RestartCount 2 `
    -RestartInterval (New-TimeSpan -Minutes 30) `
    -StartWhenAvailable $true

$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:COMPUTERNAME\mincom-docker" `
    -LogonType Password `
    -RunLevel Highest

Register-ScheduledTask `
    -TaskName "MINCOM Appraisal Nightly Backup" `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Password "<mincom-docker-password>" `
    -Description "mysqldump MINCOM Appraisal DB, gzip, copy to UNC share, 30-day local retention."
```

Test it immediately:

```powershell
Start-ScheduledTask -TaskName "MINCOM Appraisal Nightly Backup"
# Wait ~60 seconds, then check:
Get-Content "C:\Backups\mincom-appraisal\backup_*.log" | Select-Object -Last 20
```

Confirm a `.sql.gz` file exists in both `C:\Backups\mincom-appraisal\` and the UNC share.

---

## Phase 8 — Smoke Test + Reboot Validation

### Pre-flight: time-sync verification

JWT and session expiry depend on accurate UTC time. Verify before the smoke test:

```powershell
w32tm /query /status
# Confirm "Leap Indicator: 0" and "Source:" is your NTP server (not "Local CMOS Clock")
```

If the source is `Local CMOS Clock`, configure a domain or external NTP server:

```powershell
w32tm /config /manualpeerlist:"pool.ntp.org" /syncfromflags:manual /reliable:YES /update
Restart-Service w32time
w32tm /resync
```

### Application health check

```powershell
# From PowerShell on the Windows host
Invoke-WebRequest -Uri http://localhost/healthz -UseBasicParsing |
    Select-Object -ExpandProperty StatusCode

# All containers should be running
Set-Location C:\opt\mincom-appraisal; docker compose ps
```

Expected: all six services (`backend`, `php`, `messenger-consume-scheduler`, `messenger-consume-notifications`, `db`, `redis`) show `running` or `healthy`.

> **Service name reference:** `backend` is the single public web tier — an internet-facing
> nginx doing TLS termination, serving the built React SPA's static files, and FastCGI
> routing to `php` for `/api` and `/admin`. `php` is the actual PHP-FPM application
> container. Use `php` in `docker compose exec`/`logs` commands when you need a shell or
> logs from the application itself (e.g. `docker compose exec php bin/console ...`) — not
> `backend`, which is just the web/nginx layer in front of it.

### Login as bootstrap admin

Open a browser on a workstation in the corporate network and navigate to `https://appraisal.mincom.internal`. Log in with the bootstrap admin credentials. Confirm the dashboard loads and the user list is accessible.

### Escalation email test

Trigger a test notification from the admin panel and confirm the email arrives in an inbox (not spam). If it lands in spam, stop and resolve SPF/DKIM with IT before announcing the system.

### Restore-from-backup drill (do this before go-live, not after an incident)

```powershell
# Restore the most recent dump to a test database
$latest = Get-ChildItem "C:\Backups\mincom-appraisal\*.sql.gz" |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1

# Extract DB password — needed for all mysql calls into the container
$EnvFile    = "C:\opt\mincom-appraisal\.env"
$DbPassword = (Get-Content $EnvFile |
    Where-Object { $_ -match "^DATABASE_URL=" }) -replace '.*:([^@]+)@.*', '$1'
if ([string]::IsNullOrEmpty($DbPassword) -or $DbPassword.StartsWith("DATABASE_URL=")) {
    Write-Error "Failed to extract DB_PASSWORD from .env DATABASE_URL"; exit 1
}

# Set-Location so Docker Compose reads COMPOSE_FILE from C:\opt\mincom-appraisal\.env
Set-Location "C:\opt\mincom-appraisal"

# MySQL has no OWNER clause — ownership is implicit via the GRANTs already
# in place for mincom_user
docker compose `
    exec -T `
    -e MYSQL_PWD=$DbPassword `
    db mysql -u mincom_user -e "CREATE DATABASE IF NOT EXISTS mincom_appraisal_restore CHARACTER SET utf8mb4;"

# Copy the gzip file into the container, then decompress and restore inside it.
# This avoids PowerShell 5.1 byte-stream pipe issues on Windows Server 2019.
docker compose `
    cp $latest.FullName db:/tmp/restore.sql.gz

docker compose `
    exec -T `
    -e MYSQL_PWD=$DbPassword `
    db sh -c "gunzip -c /tmp/restore.sql.gz | mysql -u mincom_user mincom_appraisal_restore && rm /tmp/restore.sql.gz"

# Verify row counts roughly match production
docker compose `
    exec -T `
    -e MYSQL_PWD=$DbPassword `
    db mysql -u mincom_user mincom_appraisal_restore `
    -e "SELECT count(*) FROM appraisals_appraisal;"

# Clean up
docker compose `
    exec -T `
    -e MYSQL_PWD=$DbPassword `
    db mysql -u mincom_user -e "DROP DATABASE mincom_appraisal_restore;"
```

### Reboot validation

```powershell
Restart-Computer -Force
```

After the server comes back up (allow 3–5 minutes):

- The server auto-logins as `mincom-docker` and the screen locks immediately.
- Docker Desktop starts within ~2 minutes of the lock screen appearing.
- All containers come back automatically because of `restart: unless-stopped` in the compose file.

Verify from a remote PowerShell session (RDP or WinRM):

```powershell
Set-Location C:\opt\mincom-appraisal; docker compose ps
```

All services must show `running` or `healthy` without any manual intervention.

**If Docker Desktop fails to start after reboot:**

1. RDP to the server and log in as `mincom-docker`.
2. Check Docker Desktop's logs:
   - Host-side: `%LOCALAPPDATA%\Docker\log\host\`
   - VM-side: `%LOCALAPPDATA%\Docker\log\vm\`
3. Common causes: WSL2 kernel update pending reboot, Hyper-V service not running, or Docker Desktop needs to re-accept a licence after an auto-update (disable auto-updates — see Phase 2).

---

## Day-2 Ops for the Support Team

Portainer CE (Phase 5) gives the support team a web UI for the common day-to-day operations. Train them on:

- **Restart a service** — Containers → click service → Restart.
- **Tail logs** — Containers → click service → Logs (live tail in browser).
- **Deploy a new version** — update `APP_VERSION` in `C:\opt\mincom-appraisal\.env`, then Stacks → click stack → Update → "Re-pull image".
- **Inspect DB / run one-off SQL** — Containers → `db` → Console → Connect → run `mysql` interactively.
- **Inspect volumes** — Volumes → click volume → Browse files.

Restore-from-backup runbook for the support team (give them this verbatim — must be run as `mincom-docker` or from a PowerShell session that can reach Docker):

```powershell
$latest = Get-ChildItem \\fileserver\backups\mincom-appraisal\*.sql.gz |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1

Copy-Item $latest.FullName "C:\Backups\restore.sql.gz" -Force

# Extract DB password — needed for all mysql calls into the container
$EnvFile    = "C:\opt\mincom-appraisal\.env"
$DbPassword = (Get-Content $EnvFile |
    Where-Object { $_ -match "^DATABASE_URL=" }) -replace '.*:([^@]+)@.*', '$1'
if ([string]::IsNullOrEmpty($DbPassword) -or $DbPassword.StartsWith("DATABASE_URL=")) {
    Write-Error "Failed to extract DB_PASSWORD from .env DATABASE_URL"; exit 1
}

# Set-Location so Docker Compose reads COMPOSE_FILE from C:\opt\mincom-appraisal\.env
Set-Location "C:\opt\mincom-appraisal"

# Stop the application to prevent writes during restore
docker compose `
    stop backend php messenger-consume-scheduler messenger-consume-notifications

# Drop and recreate the production database (MySQL has no OWNER clause —
# ownership is implicit via the GRANTs already in place for mincom_user)
docker compose `
    exec -T `
    -e MYSQL_PWD=$DbPassword `
    db mysql -u mincom_user `
    -e "DROP DATABASE mincom_appraisal; CREATE DATABASE IF NOT EXISTS mincom_appraisal CHARACTER SET utf8mb4;"

# Copy the gzip file into the container, then decompress and restore inside it.
# This avoids PowerShell 5.1 byte-stream pipe issues on Windows Server 2019.
docker compose `
    cp "C:\Backups\restore.sql.gz" db:/tmp/restore.sql.gz

docker compose `
    exec -T `
    -e MYSQL_PWD=$DbPassword `
    db sh -c "gunzip -c /tmp/restore.sql.gz | mysql -u mincom_user mincom_appraisal && rm /tmp/restore.sql.gz"

# Restart the application
docker compose `
    start backend php messenger-consume-scheduler messenger-consume-notifications

# Verify health
Invoke-WebRequest -Uri http://localhost/healthz -UseBasicParsing |
    Select-Object -ExpandProperty StatusCode
```

---

## Concerns and Known Limitations

**1. Licensing recap.**
If MINCOM crosses either the 250-employee or $10 M revenue threshold, Docker Desktop requires a paid Business subscription. Costs scale with the number of admin/operator seats, not application users. Review annually at contract renewal.

**2. Logged-in-user dependency.**
Docker Desktop's daemon runs inside the `mincom-docker` user session. If that session ends (e.g. someone logs it off from the console), Docker stops. The auto-login + immediate lock pattern in Phase 3 is the standard mitigation. Ensure all support staff know: **do not log off `mincom-docker` from the console** — disconnect RDP sessions instead. Closing the RDP window disconnects without ending the session; signing out ends it.

**3. Disable Docker Desktop automatic updates.**
Docker Desktop can apply an update and restart without warning if "Always update automatically" is left on. Disable it in **Settings → Software updates** (Phase 2) and apply updates only during a planned maintenance window. Uncontrolled updates have caused daemon restarts and brief application outages in production environments.

**4. WSL2 memory ceiling — configure `.wslconfig` before go-live.**
Without an explicit limit, Docker Desktop's WSL2 backend can consume up to 50% of physical RAM on demand, which can starve Windows. Create or update `C:\Users\mincom-docker\.wslconfig` with the following content (adjust `processors` to match your CPU core count, up to 4):

```ini
[wsl2]
memory=12GB
processors=4
swap=0
# swap=0 — WSL2 swap is backed by a pagefile inside the virtual disk; enabling it causes
# I/O latency spikes when database or Messenger consumer workloads exceed the memory limit. With the
# explicit 12 GB cap above there is enough headroom for normal load, and an OOM is
# preferable to a degraded-but-running database under memory pressure.
```

This leaves ~4 GB for Windows Server and the Docker Desktop tray process. Reboot (or run `wsl --shutdown` from PowerShell then reboot) for this to take effect.

**5. SMTP relay + SPF/DKIM must be confirmed before go-live.**
The application sends escalation emails and appraisal deadline reminders. If the SMTP relay is not configured or SPF/DKIM records are missing for the `MAILER_FROM_ADDRESS` domain, these emails will be silently dropped or marked as spam. Test end-to-end with IT before announcing the system to users.

**6. Single-host — no high availability.**
This deployment has no redundancy. A hardware failure or OS corruption means the application is offline until the host is recovered. Document the restore SLA explicitly in the service agreement (e.g. RTO 4 hours, RPO 24 hours based on nightly backups). If MINCOM's appraisal cycle is time-critical, plan for at least a warm standby on a second VM before the next major cycle.

**7. Windows Server 2019 end-of-support: January 2029.**
Begin planning a migration to Windows Server 2022 no later than mid-2027 to allow a 12-month runway. Server 2022 has native WSL2 support improvements and a longer support horizon.

**8. Memory headroom at peak cycle activation.**
The 4.5 GB headroom is tighter than the Engine-in-WSL2 path (~6 GB). During cycle activation, bulk Messenger consumer jobs can spike RAM by 2–4 GB simultaneously. Monitor with `docker stats --no-stream` during the first cycle and have a pre-approved change request to expand to 24 GB RAM ready to execute within 48 hours if metrics warrant it.

**9. Redis vm.overcommit_memory — not required on Docker Desktop / WSL2.**
On native Linux hosts, Redis requires `vm.overcommit_memory = 1` in the host kernel to
safely fork for background saves (BGSAVE). On Docker Desktop, Redis runs inside the WSL2
VM managed by Docker Desktop, which already sets this value internally. No host-level
`sysctl` change is needed on Windows Server. If you ever migrate to a native Linux host,
apply the setting as documented in the Ubuntu runbook (Phase 1).

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `FIELD_ENCRYPTION_KEY must be a hex-encoded 32-byte (64 hex character) key.` | `FIELD_ENCRYPTION_KEY` is base64 (or otherwise malformed) instead of hex | Regenerate with the PowerShell hex snippet in Phase 4, or Git-for-Windows OpenSSL: `openssl rand -hex 32` |
| `Refusing to boot with APP_ENV=prod: … AUDIT_HMAC_KEY is still set to the dev-only placeholder value` | `.env` still has the placeholder from `.env.example`/`.env.prod.local.dist` | Regenerate with the PowerShell hex snippet in Phase 4 |
| JWT authentication fails after a redeploy, or `Unable to load private key` in `php` logs | The `symfony_jwt_keys` named volume was deleted/recreated, or `JWT_PASSPHRASE` was changed without regenerating the keypair | Never delete `symfony_jwt_keys` as part of a routine redeploy. To rotate deliberately: `docker compose exec php bin/console lexik:jwt:generate-keypair --overwrite` (invalidates every existing token; all users must re-login) |
| `Failed to load private key: /run/secrets/redis_tls_key … Permission denied` | File permissions too restrictive — in-container UID 999 (Redis) cannot read it | On Windows, Docker Desktop handles UID mapping automatically; verify the file is not marked read-only in NTFS properties. On Linux hosts, run `chmod 644 secrets/redis_tls_key.pem`. |
| `dependency redis failed to start` (Redis shows `Up` but `unhealthy`) | Healthcheck still targets plaintext port 6379; TLS mode disables it | Confirm the healthcheck override in `docker-compose.prod.yml` is present (targets port 6380 with `--tls`) and that the operator pulled the latest compose file |
| `messenger-consume-scheduler`/`messenger-consume-notifications` logs show `NameResolutionError`/DNS failures for `sentry.io`; Sentry events missing | The consumer was on the `internal: true` network with no egress | Add `frontend_net` to the `networks:` list for both `messenger-consume-scheduler` and `messenger-consume-notifications` in `docker-compose.prod.yml`. If `SENTRY_DSN` is unset the SDK is a no-op and these warnings do not appear. |
| `service "php" refers to undefined volume "symfony_jwt_keys": invalid compose project` (or similar undefined service/volume error) | Only the prod overlay was loaded without the base file | Set `COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml` in `.env` (see Phase 4) |
| Unexpected `axllent/mailpit` pull/start in production | Dev-only service not under a profile | Ensure the operator pulled the latest `docker-compose.yml` (`mailpit` is `profiles: ["dev"]`) |
| Docker Desktop daemon unreachable after reboot | `mincom-docker` session not active or Docker Desktop did not start | RDP to server and confirm `mincom-docker` is auto-logged in with the screen locked; check `%LOCALAPPDATA%\Docker\log\host\` for errors |
| `Cannot connect to redis://:**@redis:6379/0: Error 111 connecting to redis:6379. Connection refused` | Using plaintext scheme/port; prod Redis only listens on TLS port 6380 | Change `REDIS_URL` in `.env` to `rediss://:<pw>@redis:6380/0?ssl_cert_reqs=none` (note double-`s`) and `MESSENGER_TRANSPORT_DSN` to `rediss://redis:6380/2?ssl[verify_peer]=0&ssl[verify_peer_name]=0` |
| nginx fails to start; `cannot load certificate "/run/secrets/ssl_cert.pem": No such file or directory` | TLS cert secrets not declared or cert files not generated in `secrets\` | Run Phase 6 Option A (self-signed) or Option B (corporate CA) to create `secrets\ssl_cert.pem` and `secrets\ssl_key.pem`, then `docker compose up -d backend` |
| Browser shows "Your connection is not private" / `NET::ERR_CERT_AUTHORITY_INVALID` | Self-signed certificate; browser does not trust it | Expected for Option A. Click **Advanced → Proceed** (intranet). To eliminate the warning permanently, import `secrets\ssl_cert.pem` into Trusted Root Certification Authorities via Group Policy. |
| `dev*` or `<CHANGE-ME>` passwords still in production `.env` | Copied from `.env.example` without rotation | Generate new passwords with `& "$Env:ProgramFiles\Git\usr\bin\openssl.exe" rand -base64 32` and update all `*_PASSWORD` variables and the URLs that embed them (`DATABASE_URL`, `REDIS_URL`, `MESSENGER_TRANSPORT_DSN`) |
| nginx perpetually unhealthy; logs show `"GET /healthz HTTP/1.1" 301 162` | Healthcheck hits HTTP port 8080; prod nginx redirects all traffic to HTTPS, so wget receives a 301 and treats it as failure | `default.prod.conf`'s HTTP block has a `/healthz` location that returns 200 before the redirect; confirm `docker-compose.prod.yml`'s healthcheck override targets HTTPS port 8443 directly; pull the latest compose and image and restart `backend` |
