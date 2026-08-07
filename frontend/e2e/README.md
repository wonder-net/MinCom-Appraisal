# E2E tests (Playwright)

Five specs covering the critical paths most likely to break silently —
chosen because every one of them maps to a real bug this session found
(and fixed) that no unit or API test caught: `/portal/login` and
`/admin`'s post-login screens both served the wrong content because of
Apache routing gaps, and employee photo URLs 404'd under the app's
off-root Alias mount. Those bugs only reproduce against a real browser
hitting the real deployed app — which is exactly what these tests do.

| Spec | Critical path |
|---|---|
| `login.spec.ts` | Login page renders; valid/invalid credential round-trip |
| `self-assessment.spec.ts` | Employee rates KPIs + Mincom Core Values, submits self-assessment |
| `manager-review.spec.ts` | Manager rates KPIs + Mincom Core Values, completes review |
| `sign-off.spec.ts` | Appraisee + manager both accept sign-off |
| `admin-user-creation.spec.ts` | HR admin creates a new user account |

## Running

```bash
npm run test:e2e          # headless, against http://localhost:8888/MinCom-Appraisal/
npm run test:e2e:ui       # Playwright's interactive UI mode
E2E_BASE_URL=https://staging.example.com/ npm run test:e2e   # against another deploy
```

Requires the target app to actually be running (MAMP's Apache + MySQL,
in the default case) — these are **not** run against Vite's dev server;
see `playwright.config.ts`'s docblock for why that's deliberate.

## Fixture strategy

`global-setup.ts` creates a **fresh, uniquely-named appraisal cycle**
and activates it once per run (via the real `POST
/cycles/`+`/activate/` API — activation is the only way `Appraisal`
rows get created at all, so this exercises real business logic rather
than hand-inserting rows). A fresh cycle every run — not a
find-or-reuse of a fixed name — is deliberate: reusing one across runs
would mean each spec's target employee already has an appraisal left
over in whatever status the *previous* run advanced it to, breaking
re-runnability against a persistent database (not just a disposable CI
one).

Each of the three appraisal-flow specs (self-assessment/manager-review/
sign-off) owns a **different seeded employee** (see
`support/constants.ts`), all reporting to the same manager, so they
never touch the same appraisal — safe under Playwright's default full
parallelism, no cross-file execution-order dependency.

`support/api.ts` is a thin wrapper around the real JSON API, used only
for **fixture setup** (fast-forwarding an appraisal to the status a
given spec actually wants to test) — the interaction actually being
tested is always driven through the real UI. Because setup goes
through the real API, a fixture can never model a state the app itself
couldn't produce (`TransitionValidator`/`WorkflowGuardService` enforce
the same rules either way).

**Leftover fixture cycles**: since each run creates a new cycle, a
persistent dev database accumulates one "E2E Playwright Fixtures — do
not use for real appraisals (...)" cycle (+ its appraisals/KDs/
comments/etc.) per run. Clean up periodically:

```sql
-- see the DELETE sequence used during this suite's own development,
-- respecting FK order: growth_plan_* child tables, growth_plan,
-- appraisal_comment, appraisal_signature, competency_rating,
-- key_deliverable, notification, appraisal, appraisal_cycle —
-- all scoped to `WHERE period_name LIKE 'E2E Playwright%'`.
```

## Known quirks (not bugs in the suite — real app behavior worth knowing)

- **Login is rate-limited** (`auth` scope, 10/min, `config/packages/rate_limiter.yaml`)
  — a real production control, not something to weaken for tests. The
  specs already reuse tokens across setup/verification wherever the
  same user needs to authenticate twice in one spec; running the whole
  suite back-to-back multiple times within the same minute will 429.
  Space runs out, or accept the (correct) throttling.
- **Rating several KDs/competencies right before a workflow transition
  can 409** ("this appraisal was updated by another user") —
  `ScoreEngine::computeScores()` recomputes and re-saves the *parent*
  Appraisal row (bumping its optimistic-lock version) on every single
  rating change, but each rating PATCH's response only returns the
  child row, so the page's in-memory version silently falls behind. A
  real manager rating several items in quick succession before
  clicking "Complete Manager Review" can hit this too — reloading
  before the transition (what `manager-review.spec.ts` does) is the
  reliable fix, same as manually refreshing would be for a real user.
  Worth a real frontend fix (invalidate the parent appraisal query on
  any child-rating mutation) if this becomes a recurring UX complaint.
- **`SignoffSection`'s Accept button has no confirmation dialog**,
  unlike every other workflow-transition button (`TransitionActions`'
  `ConfirmDialog`) — submits immediately on click. Inconsistent, not
  wrong, just don't assume the same dialog pattern applies there.

## Not yet wired into CI

`.github/workflows/ci.yml` runs the frontend unit/vitest suite and the
backend PHPUnit suite on every push, but not this Playwright suite —
replicating the actual Apache `.htaccess`/off-root-Alias serving setup
(the specific thing these tests exist to exercise) inside a GitHub
Actions runner is a bigger, separate piece of work than running against
`php -S`/Vite's dev server would be, and doing that without the ability
to iteratively validate against a real CI run risked shipping a
misleading "green" pipeline that doesn't actually catch the routing
bug class it's meant to. Flagged as a deliberate follow-up, not an
oversight.
