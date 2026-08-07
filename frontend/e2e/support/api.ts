/**
 * Thin typed wrapper around the real JSON API, used ONLY for fixture
 * setup (arranging an appraisal into the right starting status before a
 * test's actual browser interaction begins) — never as a substitute for
 * the UI actions the tests themselves exercise. Driving setup through
 * the real API (rather than raw SQL/Doctrine) means every fixture is
 * guaranteed to satisfy the same business rules
 * (TransitionValidator/WorkflowGuardService) real usage would, so a
 * fixture can never accidentally model a state the app itself couldn't
 * produce.
 */

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:8888/MinCom-Appraisal/";
const API_URL = `${BASE_URL}api/v1/`;

interface Envelope<T> {
  status: "success" | "error";
  data: T;
  meta?: unknown;
}

async function request<T>(
  path: string,
  options: { method?: string; token?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<T> {
  const url = new URL(path.replace(/^\//, ""), API_URL);
  if (options.query) {
    for (const [k, v] of Object.entries(options.query)) url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let json: Envelope<T>;
  try {
    json = text ? JSON.parse(text) : ({} as Envelope<T>);
  } catch {
    throw new Error(`Non-JSON response from ${url}: HTTP ${res.status} — ${text.slice(0, 300)}`);
  }

  if (!res.ok || json.status === "error") {
    throw new Error(
      `API ${options.method ?? "GET"} ${path} failed: HTTP ${res.status} — ${JSON.stringify(json.data ?? json)}`,
    );
  }

  return json.data;
}

export async function login(identifier: string, password: string): Promise<string> {
  const data = await request<{ access: string }>("auth/login/", {
    method: "POST",
    body: { identifier, password },
  });
  return data.access;
}

export interface Cycle {
  id: string;
  period_name: string;
  status: string;
}

export async function listCycles(token: string): Promise<Cycle[]> {
  return request<Cycle[]>("appraisals/cycles/", { token });
}

export async function createCycle(
  token: string,
  payload: { period_name: string; start_date: string; end_date: string; self_rating_enabled?: boolean },
): Promise<Cycle> {
  return request<Cycle>("appraisals/cycles/", { method: "POST", token, body: payload });
}

export async function activateCycle(token: string, cycleId: string): Promise<Cycle> {
  return request<Cycle>(`appraisals/cycles/${cycleId}/activate/`, { method: "POST", token });
}

export interface AppraisalSummary {
  id: string;
  employee_id: string;
  status: string;
  version: number;
}

export async function findAppraisalForEmployeeNumber(
  token: string,
  cycleId: string,
  employeeNumber: string,
): Promise<AppraisalSummary> {
  const results = await request<AppraisalSummary[]>("appraisals/", {
    token,
    query: { cycle_id: cycleId, search: employeeNumber, page_size: "5" },
  });
  const [first] = results;
  if (!first) throw new Error(`No appraisal found for employee ${employeeNumber} in cycle ${cycleId}`);
  return first;
}

export async function getAppraisal(token: string, appraisalId: string): Promise<AppraisalSummary> {
  return request<AppraisalSummary>(`appraisals/${appraisalId}/`, { token });
}

export interface Deliverable {
  id: string;
}

export async function createDeliverable(
  token: string,
  appraisalId: string,
  payload: { description: string; weight: number; perspective: string },
): Promise<Deliverable> {
  return request<Deliverable>(`appraisals/${appraisalId}/deliverables/`, {
    method: "POST",
    token,
    body: payload,
  });
}

export async function rateDeliverable(
  token: string,
  appraisalId: string,
  kdId: string,
  rating: { self_rating?: number } | { manager_rating?: number },
): Promise<void> {
  await request(`appraisals/${appraisalId}/deliverables/${kdId}/`, {
    method: "PATCH",
    token,
    body: rating,
  });
}

export interface CompetencyRatingRow {
  id: string;
}

export async function listCompetencyRatings(token: string, appraisalId: string): Promise<CompetencyRatingRow[]> {
  return request<CompetencyRatingRow[]>(`appraisals/${appraisalId}/competencies/`, { token });
}

export async function rateCompetency(
  token: string,
  appraisalId: string,
  ratingId: string,
  rating: { self_rating?: string } | { manager_rating?: string },
): Promise<void> {
  await request(`appraisals/${appraisalId}/competencies/${ratingId}/`, {
    method: "PATCH",
    token,
    body: rating,
  });
}

export async function createComment(token: string, appraisalId: string, content: string): Promise<void> {
  await request(`appraisals/${appraisalId}/comments/`, { method: "POST", token, body: { content } });
}

export async function upsertGrowthPlan(
  token: string,
  appraisalId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await request(`appraisals/${appraisalId}/growth-plan/`, { method: "POST", token, body: payload });
}

export async function transition(
  token: string,
  appraisalId: string,
  toStatus: string,
  version: number,
): Promise<void> {
  await request(`appraisals/${appraisalId}/transition/`, {
    method: "POST",
    token,
    body: { to_status: toStatus, version },
  });
}

export async function sign(
  token: string,
  appraisalId: string,
  action: "ACCEPT" | "REJECT" | "COMMENTS_ATTACHED",
  discussed = true,
): Promise<void> {
  await request(`appraisals/${appraisalId}/sign/`, { method: "POST", token, body: { action, discussed } });
}

export async function createUser(
  token: string,
  payload: Record<string, unknown>,
): Promise<{ id: string; email: string }> {
  return request<{ id: string; email: string }>("admin/users/", { method: "POST", token, body: payload });
}
