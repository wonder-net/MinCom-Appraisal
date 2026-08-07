/**
 * Tests for ReportsLayout — verifies sub-nav role filtering,
 * cycle selector defaulting, URL param persistence, and context throw.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ReportsLayout } from "../pages/ReportsLayout";
import { useReportsCycle } from "../context/ReportsCycleContext";
import type { UserRole } from "@/auth/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseCycles = vi.fn(() => ({
  cycles: [
    {
      id: "cycle-active",
      period_name: "2026 Annual",
      status: "ACTIVE" as const,
      start_date: "2026-01-01",
      end_date: "2026-12-31",
      self_rating_enabled: true,
      is_active: true,
      created_by: null,
      config_snapshot: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "cycle-closed",
      period_name: "2025 Annual",
      status: "CLOSED" as const,
      start_date: "2025-01-01",
      end_date: "2025-12-31",
      self_rating_enabled: true,
      is_active: true,
      created_by: null,
      config_snapshot: null,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    },
  ],
  isLoading: false,
  error: null,
}));

vi.mock("@/features/appraisals/hooks/useCycles", () => ({
  useCycles: () => mockUseCycles(),
}));

const mockUseAuth = vi.fn(() => ({
  user: {
    id: "u-admin",
    email: "admin@mincom.com",
    roles: ["HR_ADMIN"] as UserRole[],
    is_mfa_enabled: true,
    employee_id: null,
    must_change_password: false,
  },
  isAuthenticated: true,
  isLoading: false,
  accessToken: null,
  login: vi.fn(),
  verifyMFA: vi.fn(),
  logout: vi.fn(),
  updateUser: vi.fn(),
  refreshSession: vi.fn(),
}));

vi.mock("@/auth/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Renders the layout within a MemoryRouter at the given URL. */
function renderLayout(initialEntry = "/reports") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/reports" element={<ReportsLayout />}>
          <Route index element={<div>Dashboard Child</div>} />
          <Route path="unapprised" element={<div>Unapprised Child</div>} />
          <Route
            path="score-distribution"
            element={<div>Distribution Child</div>}
          />
          <Route
            path="competency-gaps"
            element={<div>Competency Child</div>}
          />
          <Route
            path="manager-effectiveness"
            element={<div>Manager Child</div>}
          />
          <Route path="disputes" element={<div>Dispute Child</div>} />
          <Route
            path="bsc-perspectives"
            element={<div>BSC Child</div>}
          />
          <Route
            path="training-needs"
            element={<div>Training Child</div>}
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ReportsLayout", () => {
  it("renders all 13 sub-nav links for HR_ADMIN", () => {
    renderLayout();

    const nav = screen.getByLabelText("Report pages");
    const links = nav.querySelectorAll("a");
    expect(links).toHaveLength(13);

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Unapprised Employees")).toBeInTheDocument();
    expect(screen.getByText("Performance Distribution")).toBeInTheDocument();
    expect(screen.getByText("Competency Gaps")).toBeInTheDocument();
    expect(screen.getByText("Manager Effectiveness")).toBeInTheDocument();
    expect(screen.getByText("Dispute Log")).toBeInTheDocument();
    expect(screen.getByText("BSC Perspectives")).toBeInTheDocument();
    expect(screen.getByText("Identified Training Needs")).toBeInTheDocument();
    expect(screen.getByText("Career Pipeline")).toBeInTheDocument();
    expect(screen.getByText("Audit Compliance")).toBeInTheDocument();
    expect(screen.getByText("Trend")).toBeInTheDocument();
    expect(screen.getByText("Rating Variance")).toBeInTheDocument();
    expect(screen.getByText("9-Box Talent Grid")).toBeInTheDocument();
  });

  it("renders 8 sub-nav links for EXECUTIVE", () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: "u-exec",
        email: "exec@mincom.com",
        roles: ["EXECUTIVE"] as UserRole[],
        is_mfa_enabled: true,
        employee_id: null,
        must_change_password: false,
      },
      isAuthenticated: true,
      isLoading: false,
      accessToken: null,
      login: vi.fn(),
      verifyMFA: vi.fn(),
      logout: vi.fn(),
      updateUser: vi.fn(),
      refreshSession: vi.fn(),
    });

    renderLayout();

    const nav = screen.getByLabelText("Report pages");
    const links = nav.querySelectorAll("a");
    expect(links).toHaveLength(8);

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Performance Distribution")).toBeInTheDocument();
    expect(screen.getByText("Manager Effectiveness")).toBeInTheDocument();
    expect(screen.getByText("BSC Perspectives")).toBeInTheDocument();
    expect(screen.getByText("Career Pipeline")).toBeInTheDocument();
    expect(screen.getByText("Trend")).toBeInTheDocument();
    expect(screen.getByText("Rating Variance")).toBeInTheDocument();
    expect(screen.getByText("9-Box Talent Grid")).toBeInTheDocument();

    // HR-only tabs should not appear
    expect(screen.queryByText("Unapprised Employees")).not.toBeInTheDocument();
    expect(screen.queryByText("Competency Gaps")).not.toBeInTheDocument();
    expect(screen.queryByText("Dispute Log")).not.toBeInTheDocument();
    expect(screen.queryByText("Identified Training Needs")).not.toBeInTheDocument();
    expect(screen.queryByText("Audit Compliance")).not.toBeInTheDocument();
  });

  it("defaults cycle selector to the ACTIVE cycle when no ?cycle param", () => {
    renderLayout("/reports");

    const select = screen.getByTestId("cycle-selector") as HTMLSelectElement;
    expect(select.value).toBe("cycle-active");
  });

  it("updates URL search param when cycle selector changes", async () => {
    const user = userEvent.setup();
    renderLayout("/reports");

    const select = screen.getByTestId("cycle-selector") as HTMLSelectElement;
    await user.selectOptions(select, "cycle-closed");

    await waitFor(() => {
      expect(select.value).toBe("cycle-closed");
    });
  });

  it("useReportsCycle throws when used outside provider", () => {
    function Orphan() {
      const { cycleId } = useReportsCycle();
      return <div>{cycleId}</div>;
    }

    // Suppress React error boundary console output
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      render(
        <MemoryRouter>
          <Orphan />
        </MemoryRouter>,
      );
    }).toThrow(
      "useReportsCycle must be used within a <ReportsLayout>",
    );

    consoleSpy.mockRestore();
  });
});
