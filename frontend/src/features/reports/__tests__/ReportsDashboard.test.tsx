/**
 * Tests for ReportsDashboard page — verifies loading state, populated
 * state, empty cycle state, error state with retry, and status table rows.
 *
 * Post TASK-186: cycle selector has moved to ReportsLayout. Dashboard
 * reads cycleId via useReportsCycle() context. Section components
 * (TrainingNeeds, ScoreDistribution, etc.) are no longer rendered here.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReportsDashboard } from "../pages/ReportsDashboard";
import type { DashboardReport } from "@/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetDashboardReport = vi.fn<
  (cycleId?: string) => Promise<DashboardReport>
>();

vi.mock("@/api/reports", () => ({
  getDashboardReport: (cycleId?: string) => mockGetDashboardReport(cycleId),
}));

vi.mock("../context/ReportsCycleContext", () => ({
  useReportsCycle: () => ({ cycleId: "cycle-active" }),
}));

const mockUseAuth = vi.fn(() => ({
  user: {
    id: "u-admin",
    email: "admin@mincom.com",
    roles: ["HR_ADMIN"],
    is_mfa_enabled: true,
  },
  isAuthenticated: true,
  isLoading: false,
}));

vi.mock("@/auth/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDashboardResponse(
  overrides: Partial<DashboardReport> = {},
): DashboardReport {
  return {
    cycle_id: "cycle-2026",
    cycle_name: "2026 Annual Appraisal Cycle",
    total_employees: 142,
    completion_rate: 67.6,
    overdue_count: 11,
    appraisals_by_status: {
      SELF_ASSESSMENT: 30,
      MANAGER_REVIEW: 35,
      SIGNED_OFF: 27,
      FINALISED: 11,
    },
    departments: [
      {
        department_id: "dept-1",
        department_name: "Retail Banking",
        employee_count: 48,
        completion_rate: 72.9,
      },
      {
        department_id: "dept-2",
        department_name: "Corporate Banking",
        employee_count: 31,
        completion_rate: 61.3,
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ReportsDashboard", () => {
  it("shows skeleton loading state while data is being fetched", () => {
    // Never resolves — stays loading
    mockGetDashboardReport.mockReturnValue(new Promise(() => {}));

    render(<ReportsDashboard />);

    expect(
      screen.getByLabelText("Loading dashboard data"),
    ).toBeInTheDocument();
  });

  it("renders populated dashboard with stat cards, status table, and department table", async () => {
    mockGetDashboardReport.mockResolvedValueOnce(makeDashboardResponse());

    render(<ReportsDashboard />);

    // Wait for loading to finish
    await waitFor(() => {
      expect(
        screen.queryByLabelText("Loading dashboard data"),
      ).not.toBeInTheDocument();
    });

    // Page title and cycle name
    expect(screen.getByText("Reports Dashboard")).toBeInTheDocument();
    expect(
      screen.getByText("2026 Annual Appraisal Cycle"),
    ).toBeInTheDocument();

    // Stat cards — scoped to the summary statistics section
    const summarySection = screen.getByLabelText("Summary statistics");
    expect(
      within(summarySection).getByText("Total Employees"),
    ).toBeInTheDocument();
    expect(within(summarySection).getByText("142")).toBeInTheDocument();
    expect(
      within(summarySection).getByText("Completion Rate"),
    ).toBeInTheDocument();
    expect(
      within(summarySection).getByText("67.6%"),
    ).toBeInTheDocument();
    expect(
      within(summarySection).getByText("Overdue"),
    ).toBeInTheDocument();
    expect(within(summarySection).getByText("11")).toBeInTheDocument();

    // Status breakdown table — check that rows are rendered
    const statusTable = screen.getByLabelText("Status breakdown table");
    expect(
      within(statusTable).getByText("Self Assessment"),
    ).toBeInTheDocument();
    expect(
      within(statusTable).getByText("Manager Review"),
    ).toBeInTheDocument();
    expect(
      within(statusTable).getByText("Signed Off"),
    ).toBeInTheDocument();

    // Verify percentage calculation: SELF_ASSESSMENT = 30 / 103 * 100 = 29.1%
    expect(within(statusTable).getByText("29.1%")).toBeInTheDocument();

    // Department table
    const deptTable = screen.getByLabelText(
      "Department breakdown table",
    );
    expect(
      within(deptTable).getByText("Retail Banking"),
    ).toBeInTheDocument();
    expect(
      within(deptTable).getByText("Corporate Banking"),
    ).toBeInTheDocument();
    expect(within(deptTable).getByText("72.9%")).toBeInTheDocument();
    expect(within(deptTable).getByText("61.3%")).toBeInTheDocument();
  });

  it("shows NoCycleBanner when cycle_id is null", async () => {
    mockGetDashboardReport.mockResolvedValueOnce(
      makeDashboardResponse({
        cycle_id: null,
        cycle_name: null,
        total_employees: 0,
        completion_rate: 0,
        overdue_count: 0,
        appraisals_by_status: {},
        departments: [],
      }),
    );

    render(<ReportsDashboard />);

    await waitFor(() => {
      expect(
        screen.queryByLabelText("Loading dashboard data"),
      ).not.toBeInTheDocument();
    });

    expect(screen.getByText("No active cycle")).toBeInTheDocument();
    expect(
      screen.getByText(/No active appraisal cycle/),
    ).toBeInTheDocument();

    // Status breakdown shows empty message
    expect(
      screen.getByText("No appraisal data for the current cycle."),
    ).toBeInTheDocument();

    // Department table shows empty message
    expect(
      screen.getByText("No department data available."),
    ).toBeInTheDocument();
  });

  it("shows error state with retry button; clicking retry re-fetches", async () => {
    const user = userEvent.setup();
    mockGetDashboardReport.mockRejectedValueOnce(
      new Error("Network error"),
    );

    render(<ReportsDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });

    const retryButton = screen.getByRole("button", { name: "Retry" });
    expect(retryButton).toBeInTheDocument();

    // Retry with successful response
    mockGetDashboardReport.mockResolvedValueOnce(makeDashboardResponse());
    await user.click(retryButton);

    await waitFor(() => {
      expect(screen.getByText("142")).toBeInTheDocument();
    });

    expect(mockGetDashboardReport).toHaveBeenCalledTimes(2);
  });

  it("renders status breakdown table rows for each status in appraisals_by_status", async () => {
    const customStatuses = {
      SELF_ASSESSMENT: 5,
      DISCUSSION: 10,
      FINALISED: 20,
    };

    mockGetDashboardReport.mockResolvedValueOnce(
      makeDashboardResponse({ appraisals_by_status: customStatuses }),
    );

    render(<ReportsDashboard />);

    await waitFor(() => {
      expect(
        screen.queryByLabelText("Loading dashboard data"),
      ).not.toBeInTheDocument();
    });

    const statusTable = screen.getByLabelText("Status breakdown table");
    const rows = within(statusTable).getAllByRole("row");

    // Header row + 3 data rows = 4
    expect(rows).toHaveLength(4);

    // Check each status is present
    expect(within(statusTable).getByText("Self Assessment")).toBeInTheDocument();
    expect(
      within(statusTable).getByText("Discussion"),
    ).toBeInTheDocument();
    expect(
      within(statusTable).getByText("Finalised"),
    ).toBeInTheDocument();

    // Verify percentages: SELF_ASSESSMENT = 5/35 = 14.3%, DISCUSSION = 10/35 = 28.6%, FINALISED = 20/35 = 57.1%
    expect(within(statusTable).getByText("14.3%")).toBeInTheDocument();
    expect(within(statusTable).getByText("28.6%")).toBeInTheDocument();
    expect(within(statusTable).getByText("57.1%")).toBeInTheDocument();
  });

  it("handles empty appraisals_by_status without crashing", async () => {
    mockGetDashboardReport.mockResolvedValueOnce(
      makeDashboardResponse({
        appraisals_by_status: {},
      }),
    );

    render(<ReportsDashboard />);

    await waitFor(() => {
      expect(
        screen.queryByLabelText("Loading dashboard data"),
      ).not.toBeInTheDocument();
    });

    expect(
      screen.getByText("No appraisal data for the current cycle."),
    ).toBeInTheDocument();
  });

  it("does not render section components that have been extracted to separate pages", async () => {
    mockGetDashboardReport.mockResolvedValueOnce(makeDashboardResponse());

    render(<ReportsDashboard />);

    await waitFor(() => {
      expect(
        screen.queryByLabelText("Loading dashboard data"),
      ).not.toBeInTheDocument();
    });

    // None of the extracted sections should appear
    expect(screen.queryByLabelText("Training needs")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Unapprised employees")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Performance distribution")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Dispute log")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("BSC perspective breakdown")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Competency gaps")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Manager effectiveness")).not.toBeInTheDocument();
  });

  it("does not render a cycle selector (now owned by ReportsLayout)", async () => {
    mockGetDashboardReport.mockResolvedValueOnce(makeDashboardResponse());

    render(<ReportsDashboard />);

    await waitFor(() => {
      expect(
        screen.queryByLabelText("Loading dashboard data"),
      ).not.toBeInTheDocument();
    });

    expect(screen.queryByTestId("cycle-selector")).not.toBeInTheDocument();
  });
});
