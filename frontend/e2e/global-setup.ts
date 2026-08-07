import { login, createCycle, activateCycle } from "./support/api";
import { ADMIN, E2E_CYCLE_NAME } from "./support/constants";

/**
 * Runs once before the whole suite. Creates a fresh, uniquely-named
 * cycle and activates it — activation is the only way to create
 * Appraisal rows (AppraisalInstanceBuilder bulk-creates one per active
 * non-executive employee), so this is real, business-rule-driven setup
 * rather than hand-inserted rows.
 *
 * A fresh cycle every run (not a find-or-reuse of a fixed name) is
 * deliberate: reusing one across runs would mean each spec's target
 * employee already has an appraisal left over in whatever status the
 * *previous* run advanced it to, breaking re-runnability. The cycle ID
 * is threaded to the spec files via process.env — Playwright's
 * documented pattern for globalSetup → test propagation (globalSetup
 * runs in the same process that then forks worker processes, so env
 * vars set here are inherited).
 */
export default async function globalSetup(): Promise<void> {
  const adminToken = await login(ADMIN.email, ADMIN.password);

  const today = new Date();
  const start = today.toISOString().slice(0, 10);
  const end = new Date(today.getFullYear(), today.getMonth() + 6, today.getDate()).toISOString().slice(0, 10);

  const cycle = await createCycle(adminToken, {
    period_name: `${E2E_CYCLE_NAME} (${today.toISOString()})`,
    start_date: start,
    end_date: end,
    self_rating_enabled: true,
  });

  await activateCycle(adminToken, cycle.id);

  process.env.E2E_CYCLE_ID = cycle.id;
}
