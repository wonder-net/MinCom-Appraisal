/**
 * Unit tests for AppraisalListPage — verifies loading state shows
 * skeleton rows, and populated state shows employee names in table rows.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Appraisal, PaginationMeta, AppraisalCycle } from "@/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

interface UseAppraisalsResult {
  data: Appraisal[];
  isLoading: boolean;
  error: string | null;
  pagination: PaginationMeta;
  refetch: () => void;
}

interface UseCyclesResult {
  cycles: AppraisalCycle[];
  isLoading: boolean;
  error: string | null;
}

const mockUseAppraisals = vi.fn<() => UseAppraisalsResult>();
const mockUseCycles = vi.fn<() => UseCyclesResult>();

vi.mock("../hooks/useAppraisals", () => ({
  useAppraisals: () => mockUseAppraisals(),
}));

vi.mock("../hooks/useCycles", () => ({
  useCycles: () => mockUseCycles(),
}));

vi.mock("@/auth/useAuth", () => ({
  useAuth: () => ({
    user: { id: "u-001", email: "test@mincom.com", roles: ["EMPLOYEE"], is_mfa_enabled: false },
    isAuthenticated: true,
    isLoading: false,
    accessToken: "fake-token",
    login: vi.fn(),
    verifyMFA: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock("@/hooks/useDebounce", () => ({
  useDebounce: <T,>(value: T) => value,
}));

// Lazy-import after mocks
const { AppraisalListPage } = await import("../pages/AppraisalListPage");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage() {
  return render(
    <MemoryRouter>
      <AppraisalListPage />
    </MemoryRouter>,
  );
}

function makeAppraisal(overrides: Partial<Appraisal> = {}): Appraisal {
  return {
    id: "a-001",
    cycle_id: "c-001",
    cycle_period_name: "2026 Annual",
    employee_id: "e-001",
    employee_name: "Jane Doe",
    employee_job_title: "Software Engineer",
    department: "Engineering",
    form_type: "FORM_A",
    status: "SELF_ASSESSMENT",
    total_score: null,
    performance_descriptor: null,
    kd_average_score: null,
    kd_descriptor: null,
    bc_average_score: null,
    bc_descriptor: null,
    self_rating_enabled: true,
    status_changed_at: null,
    version: 1,
    updated_at: "2026-03-10T10:00:00Z",
    appraiser_id: "m-001",
    escalated_executive: null,
    escalation_reason: null,
    signing_round: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockUseAppraisals.mockReset();
  mockUseCycles.mockReset();
  mockUseCycles.mockReturnValue({
    cycles: [],
    isLoading: false,
    error: null,
  });
});

describe("AppraisalListPage", () => {
  it("renders skeleton rows during loading state", () => {
    mockUseAppraisals.mockReturnValue({
      data: [],
      isLoading: true,
      error: null,
      pagination: { count: 0, next: null, previous: null },
      refetch: vi.fn(),
    });

    renderPage();

    // The table should indicate busy state
    const table = screen.getByRole("table", { name: /appraisals list/i });
    expect(table).toHaveAttribute("aria-busy", "true");

    // Skeleton rows should be rendered (hidden from a11y)
    const skeletonRows = table.querySelectorAll("tbody tr[aria-hidden='true']");
    expect(skeletonRows.length).toBe(5);
  });

  it("renders table rows with employee names when data is loaded", async () => {
    const appraisals = [
      makeAppraisal({ id: "a-001", employee_name: "Jane Doe" }),
      makeAppraisal({ id: "a-002", employee_name: "John Smith", status: "SELF_ASSESSMENT" }),
      makeAppraisal({ id: "a-003", employee_name: "Alice Kamau", status: "MANAGER_REVIEW" }),
    ];

    mockUseAppraisals.mockReturnValue({
      data: appraisals,
      isLoading: false,
      error: null,
      pagination: { count: 3, next: null, previous: null },
      refetch: vi.fn(),
    });

    renderPage();

    await waitFor(() => {
      // Names appear in both desktop table and mobile card list
      expect(screen.getAllByText("Jane Doe").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("John Smith").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Alice Kamau").length).toBeGreaterThanOrEqual(1);
    });

    // Verify each has "View" buttons with proper aria-label (desktop + mobile)
    expect(
      screen.getAllByRole("button", { name: /view appraisal for jane doe/i }).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByRole("button", { name: /view appraisal for john smith/i }).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("shows empty state when no data and no filters", () => {
    mockUseAppraisals.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      pagination: { count: 0, next: null, previous: null },
      refetch: vi.fn(),
    });

    renderPage();

    // Desktop table and mobile card list both render empty state
    expect(screen.getAllByText("No appraisals found").length).toBeGreaterThanOrEqual(1);
  });
});
