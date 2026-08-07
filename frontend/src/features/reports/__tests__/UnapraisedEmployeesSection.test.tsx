/**
 * Tests for UnapraisedEmployeesSection — verifies loading, populated,
 * empty, error, department filter, and missing cycleId states.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UnapraisedEmployeesSection } from "../components/UnapraisedEmployeesSection";
import type { UnapraisedReport } from "@/api/reports";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRetry = vi.fn();

const mockUseUnapraisedReport = vi.fn<
  (cycleId?: string, departmentId?: string) => {
    data: UnapraisedReport | null;
    isLoading: boolean;
    error: string | null;
    retry: () => void;
  }
>();

vi.mock("../hooks/useUnapraisedReport", () => ({
  useUnapraisedReport: (cycleId?: string, departmentId?: string) =>
    mockUseUnapraisedReport(cycleId, departmentId),
}));

vi.mock("../hooks/useDepartments", () => ({
  useDepartments: () => ({
    departments: [
      { id: "dept-1", name: "IT" },
      { id: "dept-2", name: "Finance" },
    ],
    isLoading: false,
    error: null,
  }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeReport(
  overrides: Partial<UnapraisedReport> = {},
): UnapraisedReport {
  return {
    cycle_id: "cycle-2026",
    count: 3,
    employees: [
      {
        employee_id: "emp-1",
        employee_number: "EMP001",
        name: "John Doe",
        job_title: "Software Engineer",
        department_name: "IT",
        manager_name: "Jane Smith",
      },
      {
        employee_id: "emp-2",
        employee_number: "EMP002",
        name: "Alice Brown",
        job_title: "Analyst",
        department_name: "Finance",
        manager_name: "Bob Wilson",
      },
      {
        employee_id: "emp-3",
        employee_number: "EMP003",
        name: "Charlie Green",
        job_title: "Accountant",
        department_name: "Finance",
        manager_name: "Bob Wilson",
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

describe("UnapraisedEmployeesSection", () => {
  it("renders loading skeleton while isLoading is true", () => {
    mockUseUnapraisedReport.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
      retry: mockRetry,
    });

    render(<UnapraisedEmployeesSection cycleId="cycle-2026" />);

    expect(
      screen.getByLabelText("Loading unapprised employees"),
    ).toBeInTheDocument();
  });

  it("renders table rows with correct employee data when employees are non-empty", () => {
    const report = makeReport();
    mockUseUnapraisedReport.mockReturnValue({
      data: report,
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<UnapraisedEmployeesSection cycleId="cycle-2026" />);

    const table = screen.getByLabelText("Unapprised employees table");

    // Check header columns
    expect(within(table).getByText("Employee No.")).toBeInTheDocument();
    expect(within(table).getByText("Name")).toBeInTheDocument();
    expect(within(table).getByText("Department")).toBeInTheDocument();
    expect(within(table).getByText("Job Title")).toBeInTheDocument();
    expect(within(table).getByText("Manager")).toBeInTheDocument();

    // Check data rows
    expect(within(table).getByText("EMP001")).toBeInTheDocument();
    expect(within(table).getByText("John Doe")).toBeInTheDocument();
    expect(within(table).getByText("Software Engineer")).toBeInTheDocument();
    expect(within(table).getByText("Jane Smith")).toBeInTheDocument();

    expect(within(table).getByText("EMP002")).toBeInTheDocument();
    expect(within(table).getByText("Alice Brown")).toBeInTheDocument();

    // Count badge
    expect(screen.getByText("3")).toBeInTheDocument();

    // 1 header row + 3 data rows
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(4);
  });

  it("renders empty-state message when employees array is empty", () => {
    mockUseUnapraisedReport.mockReturnValue({
      data: makeReport({ count: 0, employees: [] }),
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<UnapraisedEmployeesSection cycleId="cycle-2026" />);

    expect(
      screen.getByText(
        "All active employees have an appraisal for this cycle.",
      ),
    ).toBeInTheDocument();

    // No table rendered
    expect(
      screen.queryByLabelText("Unapprised employees table"),
    ).not.toBeInTheDocument();
  });

  it("renders error alert with retry button; clicking retry calls retry()", async () => {
    const user = userEvent.setup();
    mockUseUnapraisedReport.mockReturnValue({
      data: null,
      isLoading: false,
      error: "Failed to load unapprised employees. Please try again.",
      retry: mockRetry,
    });

    render(<UnapraisedEmployeesSection cycleId="cycle-2026" />);

    expect(
      screen.getByText(
        "Failed to load unapprised employees. Please try again.",
      ),
    ).toBeInTheDocument();

    const retryButton = screen.getByRole("button", { name: "Retry" });
    expect(retryButton).toBeInTheDocument();

    await user.click(retryButton);
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  it("changing department filter calls hook with new departmentId", async () => {
    const user = userEvent.setup();
    mockUseUnapraisedReport.mockReturnValue({
      data: makeReport(),
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<UnapraisedEmployeesSection cycleId="cycle-2026" />);

    const select = screen.getByTestId("department-filter");
    await user.selectOptions(select, "dept-1");

    // Hook should have been last called with the department ID
    expect(mockUseUnapraisedReport).toHaveBeenLastCalledWith(
      "cycle-2026",
      "dept-1",
    );
  });

  it("renders nothing when cycleId is undefined", () => {
    mockUseUnapraisedReport.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    const { container } = render(
      <UnapraisedEmployeesSection cycleId={undefined} />,
    );

    // Section should not be rendered
    expect(
      screen.queryByLabelText("Unapprised employees"),
    ).not.toBeInTheDocument();
    expect(container.innerHTML).toBe("");
  });
});
