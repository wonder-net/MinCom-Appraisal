/**
 * Tests for AppraisalDetailPage — TASK-268 surfaces.
 *
 * Verifies:
 *  1. "Escalate to Executive" button visible only to HR_ADMIN when status is
 *     DISPUTED and escalated_executive is null.
 *  2. "Re-assign Executive" replaces the escalate button when
 *     escalated_executive is set and status is not SIGNED_OFF/FINALISED.
 *  3. Neither button renders when appraisal status is SIGNED_OFF (any role).
 *  4. EscalationBanner renders for the original manager when escalated_executive
 *     is set; does not render for HR_ADMIN or the escalated executive themselves.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { BreadcrumbProvider } from "@/context/BreadcrumbContext";
import { AppraisalDetailPage } from "../pages/AppraisalDetailPage";
import type { Appraisal, AdminUser, AppraisalStatus } from "@/types";
import type { User } from "@/auth/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetAppraisal = vi.fn();
const mockListDeliverables = vi.fn();
const mockListCompetencies = vi.fn();
const mockListExecutives = vi.fn();
let mockUser: User | null = null;

vi.mock("@/api/appraisals", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "@/api/appraisals",
  );
  return {
    ...actual,
    getAppraisal: (id: string) => mockGetAppraisal(id),
    listDeliverables: (id: string) => mockListDeliverables(id),
    listCompetencies: (id: string) => mockListCompetencies(id),
  };
});

vi.mock("@/api/admin-users", () => ({
  listExecutiveUsers: () => mockListExecutives(),
}));

vi.mock("@/auth/useAuth", () => ({
  useAuth: () => ({
    user: mockUser,
    isAuthenticated: mockUser !== null,
    isLoading: false,
    accessToken: "mock-token",
    login: vi.fn(),
    verifyMFA: vi.fn(),
    logout: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "u-hr",
    email: "hr@mincom.test",
    roles: ["HR_ADMIN"],
    is_mfa_enabled: false,
    employee_id: null,
    must_change_password: false,
    ...overrides,
  };
}

function makeExecutive(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: "u-exec",
    email: "exec@mincom.test",
    full_name: "Akua Boateng",
    roles: ["EXECUTIVE"],
    is_active: true,
    mfa_enabled: false,
    last_login: null,
    employee_id: null,
    employee_name: null,
    employee_number: null,
    job_title: null,
    job_family: null,
    department_id: null,
    department_name: null,
    location: null,
    classification: null,
    manager_id: null,
    manager_name: null,
    must_change_password: false,
    is_locked: false,
    ...overrides,
  };
}

function makeAppraisal(overrides: Partial<Appraisal> = {}): Appraisal {
  return {
    id: "a-001",
    cycle_id: "c-001",
    cycle_period_name: "2026 Annual",
    employee_id: "emp-1",
    employee_name: "Yaw Owusu",
    employee_job_title: "Engineer",
    department: "Engineering",
    form_type: "FORM_A",
    status: "DISPUTED" as AppraisalStatus,
    total_score: null,
    performance_descriptor: null,
    kd_average_score: null,
    kd_descriptor: null,
    bc_average_score: null,
    bc_descriptor: null,
    self_rating_enabled: true,
    status_changed_at: null,
    version: 1,
    updated_at: "2026-05-16T00:00:00Z",
    appraiser_id: "mgr-1",
    escalated_executive: null,
    escalation_reason: null,
    signing_round: 0,
    signatures: [],
    ...overrides,
  };
}

function renderPage() {
  return render(
    <BreadcrumbProvider>
      <MemoryRouter initialEntries={["/appraisals/a-001"]}>
        <Routes>
          <Route path="/appraisals/:id" element={<AppraisalDetailPage />} />
        </Routes>
      </MemoryRouter>
    </BreadcrumbProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListDeliverables.mockResolvedValue([]);
  mockListCompetencies.mockResolvedValue([]);
  mockListExecutives.mockResolvedValue([makeExecutive()]);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AppraisalDetailPage — escalation buttons", () => {
  it("shows 'Escalate to Executive' button only for HR_ADMIN on DISPUTED non-escalated appraisal", async () => {
    mockGetAppraisal.mockResolvedValue(
      makeAppraisal({ status: "DISPUTED", escalated_executive: null }),
    );

    // HR_ADMIN — sees the button
    mockUser = makeUser({ roles: ["HR_ADMIN"], employee_id: null });
    const { unmount } = renderPage();
    expect(
      await screen.findByRole("button", { name: /Escalate this appraisal/i }),
    ).toBeInTheDocument();
    unmount();

    // Manager — no button
    mockUser = makeUser({ roles: ["MANAGER"], employee_id: "mgr-1" });
    const r2 = renderPage();
    await waitFor(() => {
      expect(mockGetAppraisal).toHaveBeenCalled();
    });
    expect(
      screen.queryByRole("button", { name: /Escalate this appraisal/i }),
    ).not.toBeInTheDocument();
    r2.unmount();

    // Employee — no button
    mockUser = makeUser({ roles: ["EMPLOYEE"], employee_id: "emp-1" });
    const r3 = renderPage();
    await waitFor(() => {
      expect(mockGetAppraisal).toHaveBeenCalled();
    });
    expect(
      screen.queryByRole("button", { name: /Escalate this appraisal/i }),
    ).not.toBeInTheDocument();
    r3.unmount();

    // Executive without HR_ADMIN — no button
    mockUser = makeUser({ roles: ["EXECUTIVE"], employee_id: null });
    const r4 = renderPage();
    await waitFor(() => {
      expect(mockGetAppraisal).toHaveBeenCalled();
    });
    expect(
      screen.queryByRole("button", { name: /Escalate this appraisal/i }),
    ).not.toBeInTheDocument();
    r4.unmount();

    // HR_Officer — no button
    mockUser = makeUser({ roles: ["HR_OFFICER"], employee_id: null });
    const r5 = renderPage();
    await waitFor(() => {
      expect(mockGetAppraisal).toHaveBeenCalled();
    });
    expect(
      screen.queryByRole("button", { name: /Escalate this appraisal/i }),
    ).not.toBeInTheDocument();
    r5.unmount();
  });

  it("replaces escalate button with 'Re-assign Executive' when escalated_executive is set", async () => {
    mockGetAppraisal.mockResolvedValue(
      makeAppraisal({
        status: "DISCUSSION",
        escalated_executive: "u-exec",
      }),
    );
    mockUser = makeUser({ roles: ["HR_ADMIN"], employee_id: null });

    renderPage();
    expect(
      await screen.findByRole("button", { name: /Re-assign Executive/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Escalate this appraisal/i }),
    ).not.toBeInTheDocument();
  });

  it("renders neither button when appraisal is SIGNED_OFF regardless of role", async () => {
    mockGetAppraisal.mockResolvedValue(
      makeAppraisal({
        status: "SIGNED_OFF",
        escalated_executive: "u-exec",
      }),
    );
    mockUser = makeUser({ roles: ["HR_ADMIN"], employee_id: null });

    renderPage();
    await waitFor(() => {
      expect(mockGetAppraisal).toHaveBeenCalled();
    });
    expect(
      screen.queryByRole("button", { name: /Re-assign Executive/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Escalate this appraisal/i }),
    ).not.toBeInTheDocument();
  });
});

describe("AppraisalDetailPage — escalation banner", () => {
  it("renders banner for the original manager when escalated_executive is set", async () => {
    mockGetAppraisal.mockResolvedValue(
      makeAppraisal({
        status: "DISCUSSION",
        escalated_executive: "u-exec",
        appraiser_id: "mgr-1",
      }),
    );
    // Original manager: user.employee_id === appraisal.appraiser_id
    mockUser = makeUser({
      id: "u-mgr",
      roles: ["MANAGER"],
      employee_id: "mgr-1",
    });

    renderPage();
    expect(
      await screen.findByLabelText(/Read-only access notice/i),
    ).toBeInTheDocument();
  });

  it("does NOT render banner for HR_ADMIN or the escalated executive", async () => {
    mockGetAppraisal.mockResolvedValue(
      makeAppraisal({
        status: "DISCUSSION",
        escalated_executive: "u-exec",
        appraiser_id: "mgr-1",
      }),
    );

    // HR_ADMIN — no banner
    mockUser = makeUser({ roles: ["HR_ADMIN"], employee_id: null });
    const r1 = renderPage();
    await waitFor(() => {
      expect(mockGetAppraisal).toHaveBeenCalled();
    });
    expect(
      screen.queryByLabelText(/Read-only access notice/i),
    ).not.toBeInTheDocument();
    r1.unmount();

    // Escalated executive — no banner (they are the new appraisor)
    mockUser = makeUser({
      id: "u-exec",
      roles: ["EXECUTIVE"],
      employee_id: null,
    });
    const r2 = renderPage();
    await waitFor(() => {
      expect(mockGetAppraisal).toHaveBeenCalled();
    });
    expect(
      screen.queryByLabelText(/Read-only access notice/i),
    ).not.toBeInTheDocument();
    r2.unmount();
  });

  it("does NOT render banner for HR_OFFICER viewing an escalated appraisal", async () => {
    mockGetAppraisal.mockResolvedValue(
      makeAppraisal({
        status: "DISCUSSION",
        escalated_executive: "u-exec",
        appraiser_id: "mgr-1",
      }),
    );
    mockUser = makeUser({ roles: ["HR_OFFICER"], employee_id: null });
    renderPage();
    await waitFor(() => {
      expect(mockGetAppraisal).toHaveBeenCalled();
    });
    expect(
      screen.queryByLabelText(/Read-only access notice/i),
    ).not.toBeInTheDocument();
  });
});

describe("AppraisalDetailPage — listExecutiveUsers side-fetch gating", () => {
  it("does NOT call listExecutiveUsers for HR_OFFICER viewing an escalated appraisal", async () => {
    mockGetAppraisal.mockResolvedValue(
      makeAppraisal({
        status: "DISCUSSION",
        escalated_executive: "u-exec",
        appraiser_id: "mgr-1",
      }),
    );
    mockUser = makeUser({ roles: ["HR_OFFICER"], employee_id: null });
    renderPage();
    await waitFor(() => {
      expect(mockGetAppraisal).toHaveBeenCalled();
    });
    // Allow any pending microtasks to flush — the effect would have
    // fired by now if it were going to.
    await new Promise((r) => setTimeout(r, 0));
    expect(mockListExecutives).not.toHaveBeenCalled();
  });

  it("does NOT call listExecutiveUsers for EXECUTIVE viewing their own escalated appraisal", async () => {
    mockGetAppraisal.mockResolvedValue(
      makeAppraisal({
        status: "DISCUSSION",
        escalated_executive: "u-exec",
        appraiser_id: "mgr-1",
      }),
    );
    mockUser = makeUser({
      id: "u-exec",
      roles: ["EXECUTIVE"],
      employee_id: null,
    });
    renderPage();
    await waitFor(() => {
      expect(mockGetAppraisal).toHaveBeenCalled();
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(mockListExecutives).not.toHaveBeenCalled();
  });

  it("does NOT call listExecutiveUsers for the appraisee viewing an escalated appraisal", async () => {
    mockGetAppraisal.mockResolvedValue(
      makeAppraisal({
        status: "DISCUSSION",
        escalated_executive: "u-exec",
        appraiser_id: "mgr-1",
      }),
    );
    mockUser = makeUser({
      id: "u-employee",
      roles: ["EMPLOYEE"],
      employee_id: "emp-1",
    });
    renderPage();
    await waitFor(() => {
      expect(mockGetAppraisal).toHaveBeenCalled();
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(mockListExecutives).not.toHaveBeenCalled();
  });

  it("DOES call listExecutiveUsers for the original manager viewing an escalated appraisal", async () => {
    mockGetAppraisal.mockResolvedValue(
      makeAppraisal({
        status: "DISCUSSION",
        escalated_executive: "u-exec",
        appraiser_id: "mgr-1",
      }),
    );
    mockUser = makeUser({
      id: "u-mgr",
      roles: ["MANAGER"],
      employee_id: "mgr-1",
    });
    renderPage();
    await waitFor(() => {
      expect(mockListExecutives).toHaveBeenCalled();
    });
  });

  it("DOES call listExecutiveUsers for HR_ADMIN when reassign button is rendered", async () => {
    mockGetAppraisal.mockResolvedValue(
      makeAppraisal({
        status: "DISCUSSION",
        escalated_executive: "u-exec",
        appraiser_id: "mgr-1",
      }),
    );
    mockUser = makeUser({ roles: ["HR_ADMIN"], employee_id: null });
    renderPage();
    await waitFor(() => {
      expect(mockListExecutives).toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// TASK-276b: hasUserSigned scoped to current PENDING_SIGNOFF session via
// the deterministic `signing_round` counter.
// ---------------------------------------------------------------------------
//
// Reproduce: appraisee signs REJECT in round 1 -> DISPUTED -> HR returns to
// discussion -> growth plan resubmitted -> back to PENDING_SIGNOFF (round 2).
// The appraisee should see Accept/Reject buttons again, NOT the "You have
// signed" message. The fix scopes hasUserSigned to signatures whose
// `signing_round` matches the appraisal's current `signing_round`.

describe("AppraisalDetailPage — hasUserSigned scoped via signing_round", () => {
  function makeSignature(overrides: {
    signer_id: string;
    signing_round: number;
    action?: "ACCEPT" | "REJECT" | "COMMENTS_ATTACHED";
    id?: string;
    signed_at?: string;
  }) {
    return {
      id: overrides.id ?? `sig-${overrides.signer_id}-r${overrides.signing_round}`,
      signer_id: overrides.signer_id,
      signer_name: "Yaw Owusu",
      signer_role: "APPRAISEE",
      action: overrides.action ?? "ACCEPT",
      reason: null,
      signed_at: overrides.signed_at ?? "2025-01-15T11:30:00Z",
      signing_round: overrides.signing_round,
    };
  }

  it("does not count signatures from a prior round — buttons render", async () => {
    mockGetAppraisal.mockResolvedValue(
      makeAppraisal({
        status: "PENDING_SIGNOFF",
        appraiser_id: "mgr-1",
        signing_round: 2,
        signatures: [
          makeSignature({
            signer_id: "u-employee",
            signing_round: 1,
            action: "REJECT",
          }),
        ],
      }),
    );
    mockUser = makeUser({
      id: "u-employee",
      roles: ["EMPLOYEE"],
      employee_id: "emp-1",
    });

    renderPage();

    // Accept button must render — the round-1 REJECT signature must not
    // be counted because the appraisal is now in round 2.
    expect(
      await screen.findByRole("button", { name: /^Accept$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Reject$/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/You have signed\./i),
    ).not.toBeInTheDocument();
  });

  it("counts signatures from the current round — 'You have signed' renders", async () => {
    mockGetAppraisal.mockResolvedValue(
      makeAppraisal({
        status: "PENDING_SIGNOFF",
        appraiser_id: "mgr-1",
        signing_round: 2,
        signatures: [
          makeSignature({
            signer_id: "u-employee",
            signing_round: 2,
            action: "ACCEPT",
          }),
        ],
      }),
    );
    mockUser = makeUser({
      id: "u-employee",
      roles: ["EMPLOYEE"],
      employee_id: "emp-1",
    });

    renderPage();

    expect(
      await screen.findByText(
        /You have signed\. Waiting for the other party to sign off\./i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Accept$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Reject$/i }),
    ).not.toBeInTheDocument();
  });

  it("treats current-round signature as authoritative when both prior and current exist", async () => {
    mockGetAppraisal.mockResolvedValue(
      makeAppraisal({
        status: "PENDING_SIGNOFF",
        appraiser_id: "mgr-1",
        signing_round: 2,
        signatures: [
          makeSignature({
            id: "sig-prior",
            signer_id: "u-employee",
            signing_round: 1,
            action: "REJECT",
          }),
          makeSignature({
            id: "sig-current",
            signer_id: "u-employee",
            signing_round: 2,
            action: "ACCEPT",
          }),
        ],
      }),
    );
    mockUser = makeUser({
      id: "u-employee",
      roles: ["EMPLOYEE"],
      employee_id: "emp-1",
    });

    renderPage();

    expect(
      await screen.findByText(
        /You have signed\. Waiting for the other party to sign off\./i,
      ),
    ).toBeInTheDocument();
  });

  it("first-time PENDING_SIGNOFF (round 1, no signatures) renders Accept/Reject buttons", async () => {
    mockGetAppraisal.mockResolvedValue(
      makeAppraisal({
        status: "PENDING_SIGNOFF",
        appraiser_id: "mgr-1",
        signing_round: 1,
        signatures: [],
      }),
    );
    mockUser = makeUser({
      id: "u-employee",
      roles: ["EMPLOYEE"],
      employee_id: "emp-1",
    });

    renderPage();

    expect(
      await screen.findByRole("button", { name: /^Accept$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Reject$/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/You have signed\./i),
    ).not.toBeInTheDocument();
  });
});
