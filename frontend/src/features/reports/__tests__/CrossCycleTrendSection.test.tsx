/**
 * Tests for CrossCycleTrendSection — verifies loading, populated,
 * empty, error, and department filter states.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CrossCycleTrendSection } from "../components/CrossCycleTrendSection";
import type { CrossCycleTrendReport } from "@/api/reports";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRetry = vi.fn();

const mockUseCrossCycleTrend = vi.fn<
  (departmentId?: string) => {
    data: CrossCycleTrendReport | null;
    isLoading: boolean;
    error: string | null;
    retry: () => void;
  }
>();

vi.mock("../hooks/useCrossCycleTrend", () => ({
  useCrossCycleTrend: (departmentId?: string) =>
    mockUseCrossCycleTrend(departmentId),
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

vi.mock("../components/TrendLineChart", () => ({
  TrendLineChart: ({ dataPoints }: { dataPoints: unknown[] }) => (
    <div data-testid="trend-line-chart">{dataPoints.length} points</div>
  ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeReport(
  overrides: Partial<CrossCycleTrendReport> = {},
): CrossCycleTrendReport {
  return {
    department_id: null,
    data_points: [
      {
        cycle_id: "c1",
        cycle_name: "FY2024",
        cycle_year: 2024,
        avg_total_score: 3.8,
        appraisal_count: 100,
      },
      {
        cycle_id: "c2",
        cycle_name: "FY2025",
        cycle_year: 2025,
        avg_total_score: 4.1,
        appraisal_count: 110,
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

describe("CrossCycleTrendSection", () => {
  it("renders loading skeleton while isLoading is true", () => {
    mockUseCrossCycleTrend.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
      retry: mockRetry,
    });

    render(<CrossCycleTrendSection />);

    expect(
      screen.getByLabelText("Loading cross-cycle trend data"),
    ).toBeInTheDocument();
  });

  it("renders chart when data has data_points", () => {
    mockUseCrossCycleTrend.mockReturnValue({
      data: makeReport(),
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<CrossCycleTrendSection />);

    expect(screen.getByTestId("trend-line-chart")).toBeInTheDocument();
    expect(screen.getByText("2 points")).toBeInTheDocument();
  });

  it("renders empty state when data_points is empty", () => {
    mockUseCrossCycleTrend.mockReturnValue({
      data: makeReport({ data_points: [] }),
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<CrossCycleTrendSection />);

    expect(
      screen.getByText("No closed cycles found."),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("trend-line-chart"),
    ).not.toBeInTheDocument();
  });

  it("renders error alert with retry button; clicking retry calls retry()", async () => {
    const user = userEvent.setup();
    mockUseCrossCycleTrend.mockReturnValue({
      data: null,
      isLoading: false,
      error: "Failed to load cross-cycle trend data. Please try again.",
      retry: mockRetry,
    });

    render(<CrossCycleTrendSection />);

    expect(
      screen.getByText(
        "Failed to load cross-cycle trend data. Please try again.",
      ),
    ).toBeInTheDocument();

    const retryButton = screen.getByRole("button", { name: "Retry" });
    await user.click(retryButton);
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  it("changing department filter calls hook with new departmentId", async () => {
    const user = userEvent.setup();
    mockUseCrossCycleTrend.mockReturnValue({
      data: makeReport(),
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<CrossCycleTrendSection />);

    const select = screen.getByTestId("trend-department-filter");
    await user.selectOptions(select, "dept-1");

    expect(mockUseCrossCycleTrend).toHaveBeenLastCalledWith("dept-1");
  });
});
