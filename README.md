# MINCOM Appraisal — native MAMP dev environment

Symfony rewrite of the original Django backend, plus its React/Vite frontend
(`frontend/`, pulled in from the `mincom-appraisal` monorepo — see below),
consolidated into one tree and served natively through MAMP's Apache rather
than Docker. The rest of this file (Docker/Postgres commands, `symfony` CLI,
etc.) documents the *original* multi-repo/Docker dev setup this was built
in — kept for reference since the code and architecture it describes is
still accurate, but the environment specifics below are what actually apply
**on this machine**.

## How this is actually served (MAMP, not the `symfony` CLI or Docker)

- MySQL via MAMP on port `8889` (`.env.local`'s `DATABASE_URL`) — not
  Postgres. `.env`'s Postgres/Docker-hostname defaults are the *original*
  project's values and are overridden locally.
- MAMP's Apache (port `8888`) serves this whole directory directly via an
  `Alias /MinCom-Appraisal ".../MinCom-Appraisal/public"` in its `httpd.conf`
  — i.e. **the app's base URL is `http://localhost:8888/MinCom-Appraisal/`**,
  with no `/public/` segment (Apache maps that prefix straight to the
  `public/` folder). No `symfony server:start` / Docker needed — as long as
  MAMP's servers are running, the app is live.
- `public/.htaccess` decides, per request, whether to hand off to Symfony's
  front controller (`api/`, `admin*`) or serve the pre-built React SPA
  (`public/index.html` + `public/assets/`) for everything else — add any
  new Symfony-routed path prefix there or it'll silently 200 with the SPA
  shell instead of hitting your route (this bit an earlier `/portal` rollout,
  since removed — see git history if you need it back).
- JWT signing keys at `config/jwt/{private,public}.pem` are this machine's
  own (regenerated for MAMP, not copied from elsewhere) — `.env.local` /
  `.env.test.local` hold the matching passphrase. Don't regenerate the keys
  without also updating the passphrase, or every issued token breaks.

The API is live at `http://localhost:8888/MinCom-Appraisal/api/v1/...`, the
admin panel at `.../admin`, and the React SPA (the actual app end users log
into) at `.../` (`/login`, etc.).

## Frontend (`frontend/`)

Pulled in from `/Users/wonder/mincom-appraisal/frontend` (the real monorepo,
found after this MAMP copy — see project memory) so frontend + backend live
in one place. Set up:

```bash
cd frontend
npm install   # first time only
```

**Dev server** (hot-reload on `:5173`, proxies `/api` to the MAMP-served
backend — note the `/MinCom-Appraisal` prefix, required by the Alias above):

```bash
VITE_API_TARGET=http://localhost:8888/MinCom-Appraisal npm run dev
```

Then open `http://localhost:5173`.

**Rebuilding the deployed bundle** (what `public/index.html` +
`public/assets/` actually serve — these are committed build *output*, not
source; `frontend/dist/` is gitignored):

```bash
cd frontend
npm run build              # writes frontend/dist/
cp -r dist/* ../public/    # overwrite the deployed bundle (no --delete: this only
                            # touches index.html + assets/, never index.php/.htaccess/etc.)
```

## First-time / after a fresh database

Migrations + an initial admin user:

```bash
php bin/console doctrine:migrations:migrate --env=dev --no-interaction
php bin/console app:bootstrap-admin --email=admin@mincom.local --password='Admin-Pass123!' --name='System Administrator' --env=dev
```

`app:bootstrap-admin` is idempotent — re-run it any time (e.g. with a new
`--password`) to reset that user's password rather than hunting for a reset
token. It's a minimal stand-in for Django's `bootstrap_admin`/
`bootstrap_superuser` management commands, which were never ported (see
project memory's gap list).

## Currently-loaded data

The dev database currently holds data imported from a seeded Django dev
instance via the data-migration tool (`app:migrate-from-django` — see
`src/Command/MigrateFromDjangoCommand.php`), plus whatever `bootstrap-admin`
runs have touched since. Known logins:

| Email | Password | Roles |
|---|---|---|
| `hr.admin@mincom.test` | `AdminPass-123!` | HR_ADMIN, SYSTEM_ADMIN |
| `john.employee@mincom.test` | `NewSecure-Pass123!` | EMPLOYEE |
| `jane.manager@mincom.test` | *(not yet reset — see below)* | MANAGER |

Migrated users (anyone with a `@mincom.test` email above) got their password
replaced with an unusable hash on import — there is no way to guess or bypass
this. To set a real password for one of them, either:

- Run `app:bootstrap-admin --email=<email> --password=<new> --env=dev` (works
  for any user, not just admins — the name says "admin" but the update path is
  generic), or
- Use the real reset-token flow: mint one via `PasswordResetTokenService` (no
  console command wraps this yet) and `POST /api/v1/auth/password/reset/confirm/`.

The first option is simpler for local dev; the second is what a real user
would experience in production (minus the email delivery, which isn't wired
up yet).

## Background jobs (Messenger + Scheduler)

Async bulk-import jobs and the daily overdue-appraisal-reminder job are
dispatched via Symfony Messenger. Locally (no docker-compose), run a
consumer in a separate terminal:

```bash
php bin/console messenger:consume async scheduler_main -vv
```

`scheduler_main` is Symfony Scheduler's replacement for Django's Celery
Beat — it fires `App\Message\SendOverdueRemindersMessage` on the cron
schedule in `src/Scheduler/MainSchedule.php` (daily 08:00, matching
Django's `CELERY_BEAT_SCHEDULE`). Without a consumer running, bulk
imports will sit queued and overdue reminders will never fire — the API
itself works fine either way.

## Email

`symfony/mailer` is installed with `MAILER_DSN=null://null` by default
(mail is silently discarded — safe for local dev with no SMTP server).
To actually see sent mail, point it at the bundled `mailpit` catcher
(`docker-compose.yml`) or set a real transport DSN. See `.env` for
details. The four wired call sites (password reset, admin-created-user
welcome, resend-invitation, bulk-import-created-user welcome) all send
through `App\Service\EmailService`.

## Rate limiting

`App\EventListener\RateLimitListener` mirrors Django's DRF throttle rates
(`config/packages/rate_limiter.yaml`): 20/min anonymous, 200/min
authenticated, 10/min for the 6 auth-sensitive endpoints (login, token
refresh, password change/reset, MFA verify-login), and 10/hour /
20/hour for the two bulk-import-user endpoints. Throttled requests get a
429 with a `Retry-After` header. Test env limits are set very high (not
disabled) so the test suite doesn't throttle itself.

## Docker

```bash
docker compose build          # builds the `dev` target (see docker-compose.yml)
docker compose up -d
```

`docker/php/Dockerfile` is multi-stage (`base` -> `dev` | `prod`), mirroring
`../backend/Dockerfile`'s structure. `docker-compose.yml` builds the `dev`
target; a real deployment would build `target: prod` instead (no dev
Composer deps, optimized autoloader, cache warmed at build time).
`entrypoint.sh` waits for Postgres, generates JWT keys if missing, runs
migrations, and optionally bootstraps the initial admin
(`BOOTSTRAP_ADMIN_EMAIL`/`BOOTSTRAP_ADMIN_PASSWORD` env vars) before
handing off to `php-fpm`. Verified end-to-end against a real Docker
daemon (colima): both build targets, all 6 services healthy, migrations
running correctly, and a real request round-tripping nginx -> PHP ->
Postgres.

## Admin panel

`/admin` is an EasyAdmin-based ops/support panel — the Symfony-side
equivalent of Django's `django-admin` registrations. It's on its own
firewall (`admin` in `security.yaml`): session-cookie login (email +
password, no MFA — matching Django admin's own separate auth), gated to
`ROLE_HR_ADMIN`/`ROLE_SYSTEM_ADMIN`, completely separate from the API's
JWT flow. Log in at `http://127.0.0.1:8890/admin/login` with the same
credentials as the API (e.g. `hr.admin@mincom.test`).

Covers all 7 django-admin-registered models: Employee, Department, User,
Role, Competency, BSC Perspective, Notification. Creation and deletion
are deliberately disabled everywhere in this first version — see each
`src/Controller/Admin/*CrudController.php`'s docblock for why (mostly:
these entities are created through existing validated flows — bulk
import, the admin-create-user API, `DepartmentService::getOrCreateByName()`
— that a generic CRUD form would otherwise have to unsafely
reimplement). What you *can* do: fix a stuck record — unlock a
brute-force-locked user, reassign an employee's department/manager,
toggle a competency's active/core flags, re-parent a department, assign
roles. `password` and `mfaSecret` are never shown or editable here at
all; use the existing reset-token flow for those.

### Bootstrap commands

Two separate ways in, mirroring Django's own separate `bootstrap_admin`/
`bootstrap_superuser` commands:

```bash
# Business-facing SYSTEM_ADMIN — full SPA + /admin access, has an
# Employee profile, shows up in the Users list and in reports.
php bin/console app:bootstrap-admin --email=admin@mincom.local --password='Admin-Pass123!' --name='System Administrator'

# Narrow, investigative-only /admin access — no Employee profile, no
# business role, invisible to reports, locked out of every
# business-RBAC-gated endpoint. For an ops/consultant who just needs to
# inspect or fix raw data, not act as HR. Re-running promotes an
# existing user without touching their password.
php bin/console app:bootstrap-superuser --email=superuser@mincom.local --password='Superuser-Pass123!'
```

Both are idempotent and both are wired into `entrypoint.sh` behind
`BOOTSTRAP_ADMIN_EMAIL`/`BOOTSTRAP_ADMIN_PASSWORD` and
`BOOTSTRAP_SUPERUSER_EMAIL`/`BOOTSTRAP_SUPERUSER_PASSWORD` respectively
— unset (the default), each step is skipped.

## PDF generation

`App\Service\PdfRenderer` uses dompdf (not WeasyPrint — see the class
docblock for the rationale). A visual diff against real Django/WeasyPrint
output (matching sample data rendered through both pipelines, converted
to PNG via `pdftoppm`, compared pixel-by-pixel) turned up two real
dompdf-specific bugs, both now fixed in `templates/pdf/base_pdf.html.twig`
and guarded by `tests/Unit/PdfTemplateRegressionTest.php` (neither is
caught by `PdfExportReportsTest`'s `%PDF`-header checks, since the PDF
still "generates successfully" — it just renders wrong):

1. A universal `* { margin/padding/box-sizing }` reset corrupts dompdf's
   `@page` margin box entirely once it matches `html`/`body` — confirmed
   down to two plain sibling `<div>`s losing their left/top page margin
   with no other styling involved. Fixed by scoping the reset to `body *`.
2. dompdf has no support for WeasyPrint's `@bottom-center`/`@bottom-right`
   CSS margin boxes (silently ignored, not an error), so the footer
   (page number, system name) never rendered at all. Replaced with
   dompdf's own `<script type="text/php">` + `Canvas::page_text()`
   mechanism — note that `page_text()` only does per-page substitution
   on the literal `"{PAGE_NUM}"`/`"{PAGE_COUNT}"` tokens, not
   PHP-interpolated `$PAGE_NUM`/`$PAGE_COUNT` (that bakes in whichever
   page the script tag itself rendered on, printing the same number on
   every page — an easy mistake, worth the regression test).

Font-size/line-spacing differences between dompdf and WeasyPrint's text
metrics remain (Symfony's version reliably fits the same content in 2
pages against Django's 3) — expected engine-level rendering variance,
not a bug to chase further.

## Error monitoring (Sentry)

Port of Django's Sentry setup (`config/settings/base.py`). `SENTRY_DSN`
is empty by default (`.env`) — both the bundle and the underlying PHP
SDK treat an empty DSN as "disabled, don't send anything," so dev/test
start clean with zero Sentry traffic, exactly like Django. Set a real
DSN to enable it, in any environment (no `when@prod` gating — matches
Django, where DSN presence alone controls whether `sentry_sdk.init()`
actually does anything).

No recipe exists for `sentry/sentry-symfony` (it ships under
`recipes-contrib`, which Flex doesn't auto-apply without explicit
allow-listing) — `config/bundles.php`'s entry and
`config/packages/sentry.yaml` were both added by hand.

Unhandled exceptions are captured automatically: the bundle's own
`kernel.exception` listener runs at priority 128, ahead of
`App\EventListener\ExceptionListener`'s priority 50, so it always sees
the exception regardless of that listener's `stopPropagation()` calls.
Three call sites *catch* their own exceptions to build a specific error
response, which means they never reach `kernel.exception` at all — so,
matching Django's own explicit `sentry_sdk.capture_exception()` calls
in the same three places, they capture manually:
`AppraisalPdfController`, `AuditCompliancePdfController` (both tag
`correlation_id`), and `SendOverdueRemindersMessageHandler` (bare
capture, matching Django exactly — its sibling task in Django adds
`appraisal_id`/`event_type` tags, but that task is the deferred
~20-template generic notification-email system, out of scope here).

`App\Service\SentryEventScrubber` (the `before_send` callback) ports
Django's `scrub_sensitive_data` PII scrubber — minus its Authorization-
header-stripping rule, which the Sentry PHP SDK already does by default
(`RequestIntegration::DEFAULT_SENSITIVE_HEADERS`), so reimplementing it
would be redundant.

Not ported: `profiles_sample_rate` (Django samples profiles via
sentry-sdk's built-in profiler, no extra dependency in Python; the PHP
SDK's profiling needs the `excimer` PECL extension, which isn't
installed — omitted rather than silently no-op).

## Audit trail request context

Every `AuditService::log()` entry's `metadata` is automatically seeded
with `correlation_id`/`request_path`/`request_method` from whatever
HTTP request is currently in flight (`App\Service\AuditRequestContext`,
backed by Symfony's `RequestStack`), before the caller's own
`$metadata` is layered on top — so a caller can still override any of
those three keys, but doesn't have to supply them just to get them
recorded. Outside a request (a console command, a Messenger worker)
this contributes nothing, same as Django's `audit_context` ContextVar
defaulting to `None` there.

This is a deliberate improvement over Django's actual behaviour, not
just a port: Django only populates these three keys for call sites
routed through `audit_log_action()`/`@audit_action` — bare
`AuditService.log()` calls (a substantial fraction of Django's real
call sites) get nothing unless the caller manually re-derives
`request.correlation_id` by hand, which about half of them don't.
Symfony has a single `AuditService::log()` entry point everywhere, so
wiring this in once there means every Symfony audit entry gets this
context with no per-call-site opt-in needed.

## Running tests

```bash
php -d memory_limit=512M bin/phpunit
```

Uses `mincom_appraisal_symfony_test`, wrapped per-test in a rolled-back
transaction (DAMADoctrineTestBundle) — the dev database above is untouched by
the test suite.
