/**
 * Shared fixture data — real seeded accounts on this deployment. The
 * employee/manager passwords were set once for E2E use (see the CI
 * workflow / local setup notes in e2e/README.md); admin's matches the
 * account app:bootstrap-admin creates.
 *
 * Three DIFFERENT employees (all reporting to the same manager) are
 * used across the appraisal-flow specs specifically so each spec file
 * owns an appraisal nobody else touches — no shared mutable fixture,
 * no cross-file execution-order dependency, safe under Playwright's
 * default full parallelism.
 */
export const ADMIN = { email: "admin@mincom.local", password: "Admin-Pass123!" };
export const MANAGER = { email: "manager@mincom.test", password: "E2ETest-Pass123!", employeeNumber: "EMP102" };

export const EMPLOYEE_SELF_ASSESSMENT = { email: "employee1@mincom.test", password: "E2ETest-Pass123!", employeeNumber: "EMP103" };
export const EMPLOYEE_MANAGER_REVIEW = { email: "employee2@mincom.test", password: "E2ETest-Pass123!", employeeNumber: "EMP104" };
export const EMPLOYEE_SIGN_OFF = { email: "employee4@mincom.test", password: "E2ETest-Pass123!", employeeNumber: "EMP107" };

/** The 4 BSC perspective keys PerspectiveKeyResolver accepts, with weight caps summing to 1.0. */
export const PERSPECTIVES = [
  { key: "FINANCIAL", weight: 0.3 },
  { key: "CUSTOMER", weight: 0.3 },
  { key: "INTERNAL_BUSINESS_PROCESSES", weight: 0.2 },
  { key: "LEARNING_AND_GROWTH", weight: 0.2 },
] as const;

/** Dedicated cycle these specs seed into — never the org's real cycle. */
export const E2E_CYCLE_NAME = "E2E Playwright Fixtures — do not use for real appraisals";
