# Admin Panel (operator-only)

This document describes how to access and use Symfony's EasyAdmin-based
admin panel in the MINCOM Appraisal Platform. The admin is intended for
ops/debugging and investigation only — day-to-day HR and management
work happens in the React SPA.

## URL: `/admin`, fixed — not configurable

Unlike the old Django port, there is no `DJANGO_ADMIN_URL`-style
environment variable and no "obscured admin path" mechanism. EasyAdmin
is mounted at a fixed path, **`/admin`**, defined by the
`#[AdminDashboard(routePath: '/admin', routeName: 'admin')]` attribute
on `symfony-backend/src/Controller/Admin/DashboardController.php`.

- `/admin/users` — React SPA page (HR Admin user management)
- `/admin` — EasyAdmin dashboard index (redirects to the Employee list)
- `/admin/login` — EasyAdmin login form
- `/admin/logout` — EasyAdmin logout

The SPA and EasyAdmin do not actually collide: nginx matches `/admin`
and `/admin/login`/`/admin/logout` with **exact-match** `location =`
blocks (not a prefix match), so `/admin/users`, `/admin/cycles`, etc.
still fall through to the SPA's own client-side routing. This wiring
lives in `symfony-backend/config/packages/security.yaml` (the `admin`
firewall and its `access_control` rules) and in the nginx configs
(`symfony-backend/docker/nginx/default.dev.conf`,
`symfony-backend/docker/nginx/default.uat.conf`,
`symfony-backend/docker/nginx/default.prod.conf`)
under `location = /admin`, `location = /admin/login`, and
`location = /admin/logout`. Operator traffic to those three exact
paths is rate-limited via nginx's `login_zone` (10 requests/min in
prod/uat) rather than the general `api_zone` (100 requests/min) used
for everything else. Note this throttling is enforced entirely at the
nginx layer — the application-level `RateLimitListener`
(`symfony-backend/src/EventListener/RateLimitListener.php`) does not
special-case `/admin`; its `AUTH_SCOPE_ROUTES` list only covers API
auth routes (`auth_login`, `auth_token_refresh`, etc.), so requests
reaching PHP for `/admin` fall under the generic `user`/`anon`
limiters.

Access itself is gated by a dedicated, session-based `admin` firewall
(`form_login`, distinct from the stateless JWT `main` firewall the API
uses) with `access_control` rules:

```yaml
- { path: ^/admin/login, roles: PUBLIC_ACCESS }
- { path: ^/admin, roles: [ROLE_HR_ADMIN, ROLE_SYSTEM_ADMIN, ROLE_SUPERUSER] }
```

So three different kinds of user can reach `/admin`: an `HR_ADMIN`,
a `SYSTEM_ADMIN` (both regular SPA roles that also happen to unlock
EasyAdmin), and the narrow, investigative-only `ROLE_SUPERUSER`
described below.

## Two bootstrap commands, two different accounts

`entrypoint.sh` can run either or both of these automatically on
container start, gated on the corresponding env vars being non-empty:

- **`app:bootstrap-admin`** (`BOOTSTRAP_ADMIN_EMAIL` /
  `BOOTSTRAP_ADMIN_PASSWORD` / `BOOTSTRAP_ADMIN_NAME`) — creates or
  updates a full `SYSTEM_ADMIN` user with an `Employee` profile
  (department "Administration", classification `MANAGERIAL`). This
  account can log into **both** the SPA and `/admin` — it is a normal,
  fully-provisioned operator account, not investigative-only. See
  `symfony-backend/src/Command/BootstrapAdminCommand.php`.
- **`app:bootstrap-superuser`** (`BOOTSTRAP_SUPERUSER_EMAIL` /
  `BOOTSTRAP_SUPERUSER_PASSWORD`) — grants **`/admin`-only** access
  with no `Employee` record and no SPA role. This is the direct port
  of Django's `bootstrap_superuser` + `DJANGO_SUPERUSER_EMAIL`/
  `DJANGO_SUPERUSER_PASSWORD` (now `BOOTSTRAP_SUPERUSER_EMAIL`/
  `BOOTSTRAP_SUPERUSER_PASSWORD`), and is what the rest of this
  document focuses on. See
  `symfony-backend/src/Command/BootstrapSuperuserCommand.php`.

## Investigative-only by design

The user created or promoted by `app:bootstrap-superuser` is
intentionally a **naked superuser** (`isSuperuser() === true`,
`isStaff() === true`, `ROLE_SUPERUSER`) — it has no `Employee` record
and no SPA role. This is the correct design, unchanged from the Django
port:

- It exists solely to log into `/admin` for ops, debugging, and
  investigation.
- It **cannot use the SPA at all** — the SPA login flow requires a
  role to render any page. A user with no roles hits the role-guard
  and is locked out. This is deliberate; do not attempt to "fix" it
  by adding roles to this account.
- It does **not** appear in any employee report — every report is
  anchored to the `Employee` or `Appraisal` entity, never to `User`
  directly. A `User` without an `Employee` record is structurally
  invisible to all report views.
- It does **not** appear in the SPA's Admin Users list
  (`/api/v1/admin/users/`) — that endpoint filters to users with at
  least one SPA role, which excludes naked superusers.

If you need a regular user to also have admin access, promote their
existing account via `app:bootstrap-superuser` (it preserves the
password and only flips the `isSuperuser`/`isStaff` flags) — do
**not** create a parallel naked superuser for them.

## Granting access via `app:bootstrap-superuser`

```bash
docker compose exec php bin/console app:bootstrap-superuser \
  --email=ops.user@example.com --password='<strong-password>'
```

or, non-interactively via env vars mirroring Django's
`DJANGO_SUPERUSER_EMAIL`/`DJANGO_SUPERUSER_PASSWORD` convention:

```bash
BOOTSTRAP_SUPERUSER_EMAIL=ops.user@example.com
BOOTSTRAP_SUPERUSER_PASSWORD=<strong-password>
```

### Behaviour

| Pre-state | Result |
| --- | --- |
| Both vars unset | Skipped — `entrypoint.sh` only invokes the command when both are non-empty. |
| User does not exist | Create with `isSuperuser`/`isStaff` both `true`. `--password` required. Audit log: `action=user.granted_superuser`, `metadata.created=true`. |
| User exists, flags missing | Flip `isSuperuser`/`isStaff` to `true` (and `isActive` if it was `false`). **Password is not touched** — `--password` is ignored/unused for an existing user. Audit log: `metadata.created=false`. |
| User exists, flags already set | No-op — "Superuser already configured. Skipping." No DB write, no new audit log entry. |

The command is idempotent: running it N times when the user is
already fully configured produces zero additional writes.

The plaintext password is **never** printed to stdout or stderr.

### Wiring

`entrypoint.sh` runs `app:bootstrap-superuser` automatically on
container start, but only when both `BOOTSTRAP_SUPERUSER_EMAIL` and
`BOOTSTRAP_SUPERUSER_PASSWORD` are non-empty. Dev environments that do
not need superuser access can leave them blank.

To configure:

1. Edit `.env` (production: `symfony-backend/.env.prod.local`) and
   set the two `BOOTSTRAP_SUPERUSER_*` vars.
2. Restart the backend: `docker compose restart php`.
3. Verify nginx is routing the path:
   `curl -I http://localhost/admin/login` should return 200.
4. Visit `https://<host>/admin/login` and sign in.

To rotate the password, change it via a follow-up
`app:bootstrap-superuser` run is **not** the mechanism — that command
deliberately never touches an existing user's password. Rotate it
through the normal password-change flow for that account instead
(e.g. the SPA's password-reset flow, if the account also has SPA
access, or a direct `UserPasswordHasherInterface` update via a
one-off console command/DB update for a pure `/admin`-only account).

## Audit trail

Unlike Django, there is **no separate EasyAdmin action log**
equivalent to `django_admin_log`/`LogEntry` — Symfony's EasyAdmin
bundle does not maintain one, and none of the CRUD controllers under
`symfony-backend/src/Controller/Admin/` (`UserCrudController`,
`EmployeeCrudController`, `DepartmentCrudController`,
`RoleCrudController`, `CompetencyCrudController`,
`BscPerspectiveCrudController`, `NotificationCrudController`) override
`persistEntity`/`updateEntity`/`deleteEntity` to record one. Only two
purpose-built admin controllers explicitly call the shared audit
service: `AdminUnlockUserController` and `AdminMfaResetController`
(plus `app:bootstrap-superuser` itself, which logs
`user.granted_superuser`).

In practice there is one audit system, not two:

- **App-level `AuditLog`** (`App\Service\AuditService`) — populated by
  application code (controllers, services, console commands) for
  business events such as appraisal state transitions, user
  invitations, account unlocks/MFA resets performed from `/admin`, and
  `app:bootstrap-superuser` runs themselves. This is the source for
  compliance and SOC 2 / ISO 27001 evidence.
- Routine EasyAdmin CRUD edits (e.g. editing a Competency or
  Department directly through `/admin`'s generic list/edit screens)
  are **not** separately audited today — there is no Django-admin-log
  equivalent to fall back on for those. If an audit trail is required
  for a specific entity's admin-panel edits, that CRUD controller
  needs its own `persistEntity`/`updateEntity`/`deleteEntity` override
  calling `AuditService`, following the pattern in
  `AdminUnlockUserController`/`AdminMfaResetController`.

## Security notes

- Access is gated by the `admin` firewall's session-based
  `form_login` plus the `ROLE_HR_ADMIN`/`ROLE_SYSTEM_ADMIN`/
  `ROLE_SUPERUSER` `access_control` rule in
  `symfony-backend/config/packages/security.yaml` — there is no IP
  allowlist. Single-tenant HR-internal deployment makes this
  acceptable today; flag for review if an IP restriction is required
  in production.
- The `UserCrudController` (`symfony-backend/src/Controller/Admin/UserCrudController.php`)
  does not display PII in the list view (only fields such as `email`,
  `isActive`, `isStaff`, MFA-enabled status, `createdAt`). MFA secrets
  are not exposed through the CRUD screen.
- `BOOTSTRAP_SUPERUSER_EMAIL` and `BOOTSTRAP_SUPERUSER_PASSWORD` (like
  `BOOTSTRAP_ADMIN_PASSWORD`) must **never** be committed. `.gitignore`
  covers `.env.*.local`; verify before any deployment.
