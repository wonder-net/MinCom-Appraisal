# Local dev on MAMP PRO

This project runs locally under **MAMP PRO** (not free MAMP's Apache), using
a dedicated virtual host rather than the Apache `Alias`/symlink trick used
earlier. This doc captures the one-time GUI setup and why each step exists.

## 1. Virtual host

MAMP PRO → **Hosts** tab → add a host:

| Field | Value |
|---|---|
| Name / domain | `appraisal.local` |
| Document root | `/Applications/MAMP/htdocs/MinCom-Appraisal/public` |
| Port | 80 (or whatever MAMP PRO's Apache is bound to) |

MAMP PRO adds the domain to `/etc/hosts` automatically when you create the
host (look for an "Auto add to hosts" toggle if it doesn't resolve —
`dscacheutil -flushcache` if the browser still can't find it right after).

This replaces the old `~/Sites/localhost/MinCom-Appraisal` symlink +
`http://localhost:8888/MinCom-Appraisal/` URL. That symlink can stay in
place harmlessly, but the old URL no longer renders correctly — the
frontend build now emits root-relative asset paths (see §4), so it only
works when served from a document root that *is* `public/`, not aliased
under a subpath.

## 2. SSL

Same host, **SSL** tab → enable → MAMP PRO mints a self-signed cert for
`appraisal.local`. Gives you `https://appraisal.local`, matching
production's cookie/security-header behavior (secure flags, etc.) instead
of only ever testing that in prod. The browser will warn about the
self-signed cert once — that's expected, "proceed anyway"/trust it locally.

## 3. PHP version

Same host, **PHP** tab → pin PHP 8.3 explicitly to this host, rather than
relying on MAMP PRO's *global* active PHP version. This app requires PHP
>= 8.2 (native enums, attributes, `readonly` properties throughout) —
pinning per-host means switching the global version for some unrelated
project can never again silently break this one (this is exactly what
happened once already: MAMP's global PHP got switched to 7.4.33 and every
request failed with a Composer platform-requirement error).

## 4. Frontend base path

`frontend/vite.config.ts`'s `base` option defaults to `/` (root), matching
both this vhost and the real production nginx config
(`docker/nginx/default.prod.conf`'s `location /` block has no path
prefix). After any frontend change:

```bash
cd frontend && npm run build
rsync -a --delete dist/ ../public/ \
  --exclude uploads --exclude bundles \
  --exclude .htaccess --exclude index.php --exclude css/admin-theme.css
```

The extra excludes matter: `--delete` treats anything in `public/` that isn't
part of `dist/` as stale and removes it, and Symfony's own front controller
(`index.php`), the `.htaccess` routing rules, and the admin theme CSS all
live in `public/` without being part of the frontend build — omitting them
from the exclude list deletes the entire backend front controller silently
(this happened once already; recovered via `git show HEAD:<path>`).

Only pass `VITE_BASE_PATH=/some-prefix/` if you ever need an off-root
deployment (e.g. the old Apache `Alias` setup) — not needed for this vhost
or for production.

## 5. Database

`DATABASE_URL` in `.env.local` connects over the MySQL **Unix socket**
(`/Applications/MAMP/tmp/mysql/mysql.sock`), not TCP `host:port`. This is
deliberate: MAMP PRO's shared `my.cnf`
(`/Applications/MAMP/tmp/mysql/my.cnf`) sets `skip-networking`, which
disables TCP but never affects Unix sockets, and both MAMP and MAMP PRO's
native Start/Stop controls read that same shared file. Socket-based means
the app keeps working no matter which app (re)starts MySQL or regenerates
that config.

The actual data lives in **MAMP PRO's own** data directory
(`/Library/Application Support/appsolute/MAMP PRO/db/mysql80`) — it was
copied there from free MAMP's original datadir
(`/Applications/MAMP/db/mysql80`, left in place untouched as a fallback
copy) via `mysqldump`/import, once, and verified via matching row counts.
No script or manual step is needed after a restart; MAMP PRO's native
"Start Servers" is sufficient.

## 6. Live sharing (optional)

MAMP PRO's **Live** button (toolbar) publishes the vhost to a temporary
public tunnel URL for sharing with someone off your network. Don't leave
it running — it's your real local database exposed to the internet for as
long as it's on.
