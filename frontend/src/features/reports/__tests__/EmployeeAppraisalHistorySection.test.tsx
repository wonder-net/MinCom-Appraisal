/**
 * Tests for EmployeeAppraisalHistorySection — verifies loading,
 * populated, empty, error, and 403 permission-denied states.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { EmployeeAppraisalHistorySection } from "../components/EmployeeAppraisalHistorySection";
import type { EmployeeAppraisalHistory } from "@/api/reports";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRetry = vi.fn();

const mockUseEmployeeAppraisalHistory = vi.fn<
  (employeeId: string) => {
    data: EmployeeAppraisalHistory | null;
    isLoading: boolean;
    error: string | null;
    isForbidden: boolean;
    retry: () => void;
  }
>();

vi.mock("../hooks/useEmployeeAppraisalHistory", () => ({
  useEmployeeAppraisalHistory: (employeeId: string) =>
    mockUseEmployeeAppraisalHistory(employeeId),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeHistory(
  overrides: Partial<EmployeeAppraisalHistory> = {},
): EmployeeAppraisalHistory {
  return {
    employee_id: "emp-1",
    employee_name: "Jane Smith",
    history: [
      {
        cycle_id: "cycle-2025",
        cycle_name: "2025 Annual Review",
        cycle_year: 2025,
        cycle_status: "CLOSED",
        total_score: 4.25,
        kd_average_score: 4.5,
        bc_average_score: 3.8,
        performance_descriptor: "Exceeds Expectations",
        kd_descriptor: "Exceeds Expectations",
        bc_descriptor: "Fully Competent",
        appraisal_status: "FINALISED",
        appraisal_id: "appr-1",
      },
      {
        cycle_id: "cycle-2024",
        cycle_name: "2024 Annual Review",
        cycle_year: 2024,
        cycle_status: "CLOSED",
        total_score: 3.1,
        kd_average_score: 3.2,
        bc_average_score: 2.9,
        performance_descriptor: "Fully Competent",
        kd_descriptor: "Fully Competent",
        bc_descriptor: "Generally Performing",
        appraisal_status: "SIGNED_OFF",
        appraisal_id: "appr-2",
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EmployeeAppraisalHistorySection", () => {
  it("renders loading skeleton while isLoading is true", () => {
    mockUseEmployeeAppraisalHistory.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
      isForbidden: false,
      retry: mockRetry,
    });

    renderWithRouter(
      <EmployeeAppraisalHistorySection employeeId="emp-1" />,
    );

    expect(
      screen.getByLabelText("Loading appraisal history"),
    ).toBeInTheDocument();
  });

  it("renders history rows when data is returned (test_renders_history_rows)", () => {
    const history = makeHistory();
    mockUseEmployeeAppraisalHistory.mockReturnValue({
      data: history,
      isLoading: false,
      error: null,
      isForbidden: false,
      retry: mockRetry,
    });

    renderWithRouter(
      <EmployeeAppraisalHistorySection employeeId="emp-1" />,
    );

    const table = screen.getByLabelText(
      "Employee appraisal history table",
    );

    // Check header columns
    expect(within(table).getByText("Cycle Name")).toBeInTheDocument();
    expect(within(table).getByText("Year")).toBeInTheDocument();
    expect(within(table).getByText("KPI Score")).toBeInTheDocument();
    expect(within(table).getByText("BC Score")).toBeInTheDocument();
    expect(within(table).getByText("Total Score")).toBeInTheDocument();
    expect(
      within(table).getByText("Performance Descriptor"),
    ).toBeInTheDocument();
    expect(within(table).getByText("Status")).toBeInTheDocument();

    // Check data rows — both history entries appear
    expect(
      within(table).getByText("2025 Annual Review"),
    ).toBeInTheDocument();
    expect(
      within(table).getByText("2024 Annual Review"),
    ).toBeInTheDocument();

    // 1 header row + 2 data rows
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3);
  });

  it("shows empty state when history array is empty (test_empty_state_when_no_history)", () => {
    mockUseEmployeeAppraisalHistory.mockReturnValue({
      data: makeHistory({ history: [] }),
      isLoading: false,
      error: null,
      isForbidden: false,
      retry: mockRetry,
    });

    renderWithRouter(
      <EmployeeAppraisalHistorySection employeeId="emp-1" />,
    );

    expect(
      screen.getByText("No appraisal history found."),
    ).toBeInTheDocument();

    // No table rendered
    expect(
      screen.queryByLabelText("Employee appraisal history table"),
    ).not.toBeInTheDocument();
  });

  it("shows inline permission error on 403 (test_403_shows_permission_error)", () => {
    mockUseEmployeeAppraisalHistory.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      isForbidden: true,
      retry: mockRetry,
    });

    renderWithRouter(
      <EmployeeAppraisalHistorySection employeeId="emp-1" />,
    );

    expect(
      screen.getByText(
        "You do not have permission to view this history.",
      ),
    ).toBeInTheDocument();

    // No table rendered
    expect(
      screen.queryByLabelText("Employee appraisal history table"),
    ).not.toBeInTheDocument();

    // No redirect — component is still in the DOM
    expect(
      screen.getByLabelText("Appraisal history"),
    ).toBeInTheDocument();
  });

  it("each row contains a link to /appraisals/{appraisal_id} (test_link_to_appraisal_detail)", () => {
    const history = makeHistory();
    mockUseEmployeeAppraisalHistory.mockReturnValue({
      data: history,
      isLoading: false,
      error: null,
      isForbidden: false,
      retry: mockRetry,
    });

    renderWithRouter(
      <EmployeeAppraisalHistorySection employeeId="emp-1" />,
    );

    const link1 = screen.getByRole("link", { name: "2025 Annual Review" });
    expect(link1).toHaveAttribute("href", "/appraisals/appr-1");

    const link2 = screen.getByRole("link", { name: "2024 Annual Review" });
    expect(link2).toHaveAttribute("href", "/appraisals/appr-2");
  });

  it("renders error alert with retry button; clicking retry calls retry()", async () => {
    const user = userEvent.setup();
    mockUseEmployeeAppraisalHistory.mockReturnValue({
      data: null,
      isLoading: false,
      error: "Failed to load appraisal history. Please try again.",
      isForbidden: false,
      retry: mockRetry,
    });

    renderWithRouter(
      <EmployeeAppraisalHistorySection employeeId="emp-1" />,
    );

    expect(
      screen.getByText(
        "Failed to load appraisal history. Please try again.",
      ),
    ).toBeInTheDocument();

    const retryButton = screen.getByRole("button", { name: "Retry" });
    expect(retryButton).toBeInTheDocument();

    await user.click(retryButton);
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  it("calls useEmployeeAppraisalHistory with the correct employeeId", () => {
    mockUseEmployeeAppraisalHistory.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
      isForbidden: false,
      retry: mockRetry,
    });

    renderWithRouter(
      <EmployeeAppraisalHistorySection employeeId="specific-emp-id" />,
    );

    expect(mockUseEmployeeAppraisalHistory).toHaveBeenCalledWith(
      "specific-emp-id",
    );
  });

  it("displays formatted scores with correct styling", () => {
    const history = makeHistory();
    mockUseEmployeeAppraisalHistory.mockReturnValue({
      data: history,
      isLoading: false,
      error: null,
      isForbidden: false,
      retry: mockRetry,
    });

    renderWithRouter(
      <EmployeeAppraisalHistorySection employeeId="emp-1" />,
    );

    // Total score 4.25 should be formatted as "4.25"
    expect(screen.getByText("4.25")).toBeInTheDocument();
    // Total score 3.10 should be formatted as "3.10"
    expect(screen.getByText("3.10")).toBeInTheDocument();
  });

  it("handles null total_score with em-dash", () => {
    const history = makeHistory({
      history: [
        {
          cycle_id: "cycle-draft",
          cycle_name: "2026 Draft",
          cycle_year: 2026,
          cycle_status: "ACTIVE",
          total_score: null,
          kd_average_score: null,
          bc_average_score: null,
          performance_descriptor: null,
          kd_descriptor: null,
          bc_descriptor: null,
          appraisal_status: "SELF_ASSESSMENT",
          appraisal_id: "appr-self-assess",
        },
      ],
    });

    mockUseEmployeeAppraisalHistory.mockReturnValue({
      data: history,
      isLoading: false,
      error: null,
      isForbidden: false,
      retry: mockRetry,
    });

    renderWithRouter(
      <EmployeeAppraisalHistorySection employeeId="emp-1" />,
    );

    const table = screen.getByLabelText(
      "Employee appraisal history table",
    );
    const rows = within(table).getAllByRole("row");
    const cells = within(rows[1]).getAllByRole("cell");

    // KPI Score (index 2), BC Score (index 3), Total Score (index 4)
    // should show em-dash for null
    expect(cells[2].textContent).toBe("\u2014");
    expect(cells[3].textContent).toBe("\u2014");
    expect(cells[4].textContent).toBe("\u2014");
  });
});
