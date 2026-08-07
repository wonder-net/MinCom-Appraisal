/**
 * Tests for ManagerEffectivenessSection — verifies loading, populated,
 * empty, error, department filter, null score, and missing cycleId states.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ManagerEffectivenessSection } from "../components/ManagerEffectivenessSection";
import type { ManagerEffectivenessReport } from "@/api/reports";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRetry = vi.fn();

const mockUseManagerEffectiveness = vi.fn<
  (params: {
    cycleId?: string;
    departmentId?: string;
  }) => {
    data: ManagerEffectivenessReport | null;
    isLoading: boolean;
    error: string | null;
    retry: () => void;
  }
>();

vi.mock("../hooks/useManagerEffectiveness", () => ({
  useManagerEffectiveness: (params: {
    cycleId?: string;
    departmentId?: string;
  }) => mockUseManagerEffectiveness(params),
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
  overrides: Partial<ManagerEffectivenessReport> = {},
): ManagerEffectivenessReport {
  return {
    cycle_id: "cycle-2026",
    department_id: null,
    managers: [
      {
        manager_id: "mgr-1",
        manager_name: "Jane Smith",
        team_size: 8,
        completion_rate: 87.5,
        avg_team_score: 3.45,
        dispute_count: 1,
      },
      {
        manager_id: "mgr-2",
        manager_name: "Bob Wilson",
        team_size: 5,
        completion_rate: 40.0,
        avg_team_score: 2.8,
        dispute_count: 0,
      },
      {
        manager_id: "mgr-3",
        manager_name: "Alice Brown",
        team_size: 12,
        completion_rate: 66.7,
        avg_team_score: null,
        dispute_count: 2,
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

describe("ManagerEffectivenessSection", () => {
  it("renders a table row for each manager in data.managers", () => {
    const report = makeReport();
    mockUseManagerEffectiveness.mockReturnValue({
      data: report,
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<ManagerEffectivenessSection cycleId="cycle-2026" />);

    const table = screen.getByLabelText("Manager effectiveness table");

    // Check header columns
    expect(within(table).getByText("Manager")).toBeInTheDocument();
    expect(within(table).getByText("Team Size")).toBeInTheDocument();
    expect(within(table).getByText("Completion Rate")).toBeInTheDocument();
    expect(within(table).getByText("Avg Team Score")).toBeInTheDocument();
    expect(within(table).getByText("Disputes")).toBeInTheDocument();

    // Check data rows
    expect(within(table).getByText("Jane Smith")).toBeInTheDocument();
    expect(within(table).getByText("Bob Wilson")).toBeInTheDocument();
    expect(within(table).getByText("Alice Brown")).toBeInTheDocument();

    // 1 header row + 3 data rows
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(4);
  });

  it("shows loading skeleton when isLoading is true", () => {
    mockUseManagerEffectiveness.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
      retry: mockRetry,
    });

    render(<ManagerEffectivenessSection cycleId="cycle-2026" />);

    expect(
      screen.getByLabelText("Loading manager effectiveness data"),
    ).toBeInTheDocument();
  });

  it("shows error message and retry button when error is non-null", async () => {
    const user = userEvent.setup();
    mockUseManagerEffectiveness.mockReturnValue({
      data: null,
      isLoading: false,
      error: "Failed to load manager effectiveness data. Please try again.",
      retry: mockRetry,
    });

    render(<ManagerEffectivenessSection cycleId="cycle-2026" />);

    expect(
      screen.getByText(
        "Failed to load manager effectiveness data. Please try again.",
      ),
    ).toBeInTheDocument();

    const retryButton = screen.getByRole("button", { name: "Retry" });
    expect(retryButton).toBeInTheDocument();

    await user.click(retryButton);
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  it("shows empty state message when managers array is empty", () => {
    mockUseManagerEffectiveness.mockReturnValue({
      data: makeReport({ managers: [] }),
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<ManagerEffectivenessSection cycleId="cycle-2026" />);

    expect(
      screen.getByText("No manager effectiveness data for this cycle."),
    ).toBeInTheDocument();

    // No table rendered
    expect(
      screen.queryByLabelText("Manager effectiveness table"),
    ).not.toBeInTheDocument();
  });

  it("displays completion_rate as a percentage to one decimal place", () => {
    mockUseManagerEffectiveness.mockReturnValue({
      data: makeReport(),
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<ManagerEffectivenessSection cycleId="cycle-2026" />);

    expect(screen.getByText("87.5%")).toBeInTheDocument();
    expect(screen.getByText("40.0%")).toBeInTheDocument();
    expect(screen.getByText("66.7%")).toBeInTheDocument();
  });

  it("displays avg_team_score as em dash when null", () => {
    mockUseManagerEffectiveness.mockReturnValue({
      data: makeReport(),
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<ManagerEffectivenessSection cycleId="cycle-2026" />);

    // Alice Brown has null avg_team_score
    expect(screen.getByText("\u2014")).toBeInTheDocument();

    // Should NOT show "null"
    expect(screen.queryByText("null")).not.toBeInTheDocument();
  });

  it("renders nothing when cycleId is undefined", () => {
    mockUseManagerEffectiveness.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    const { container } = render(
      <ManagerEffectivenessSection cycleId={undefined} />,
    );

    expect(
      screen.queryByLabelText("Manager effectiveness"),
    ).not.toBeInTheDocument();
    expect(container.innerHTML).toBe("");
  });

  it("selecting a department filter calls useManagerEffectiveness with the correct departmentId", async () => {
    const user = userEvent.setup();
    mockUseManagerEffectiveness.mockReturnValue({
      data: makeReport(),
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<ManagerEffectivenessSection cycleId="cycle-2026" />);

    const select = screen.getByTestId("mgr-department-filter");
    await user.selectOptions(select, "dept-1");

    expect(mockUseManagerEffectiveness).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cycleId: "cycle-2026",
        departmentId: "dept-1",
      }),
    );
  });

  it("clearing department filter re-fetches with undefined departmentId", async () => {
    const user = userEvent.setup();
    mockUseManagerEffectiveness.mockReturnValue({
      data: makeReport(),
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<ManagerEffectivenessSection cycleId="cycle-2026" />);

    const select = screen.getByTestId("mgr-department-filter");

    // Select a department
    await user.selectOptions(select, "dept-2");
    expect(mockUseManagerEffectiveness).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cycleId: "cycle-2026",
        departmentId: "dept-2",
      }),
    );

    // Clear back to "All Departments"
    await user.selectOptions(select, "");
    expect(mockUseManagerEffectiveness).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cycleId: "cycle-2026",
        departmentId: undefined,
      }),
    );
  });

  it("displays the count badge with the number of managers", () => {
    mockUseManagerEffectiveness.mockReturnValue({
      data: makeReport(),
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<ManagerEffectivenessSection cycleId="cycle-2026" />);

    expect(screen.getByLabelText("3 managers")).toBeInTheDocument();
  });
});
