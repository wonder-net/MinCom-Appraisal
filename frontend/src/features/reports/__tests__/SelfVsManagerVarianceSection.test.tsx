/**
 * Tests for SelfVsManagerVarianceSection — verifies loading, populated,
 * empty, error, self-rating-disabled banner, and no-cycleId states.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SelfVsManagerVarianceSection } from "../components/SelfVsManagerVarianceSection";
import type { SelfVsManagerVarianceReport } from "@/api/reports";

// Mocks

const mockRetry = vi.fn();
type HookParams = { cycleId?: string; departmentId?: string };
type HookResult = { data: SelfVsManagerVarianceReport | null; isLoading: boolean; error: string | null; retry: () => void };
const mockUseSelfVsManagerVariance = vi.fn<(p: HookParams) => HookResult>();

vi.mock("../hooks/useSelfVsManagerVariance", () => ({
  useSelfVsManagerVariance: (p: HookParams) => mockUseSelfVsManagerVariance(p),
}));
vi.mock("../hooks/useDepartments", () => ({
  useDepartments: () => ({
    departments: [{ id: "dept-1", name: "IT" }, { id: "dept-2", name: "Finance" }],
    isLoading: false, error: null,
  }),
}));
vi.mock("../components/KDVarianceTable", () => ({
  KDVarianceTable: () => <div data-testid="kd-variance-table" />,
}));
vi.mock("../components/CompetencyVarianceTable", () => ({
  CompetencyVarianceTable: () => <div data-testid="competency-variance-table" />,
}));

// Fixtures

function makeReport(
  overrides: Partial<SelfVsManagerVarianceReport> = {},
): SelfVsManagerVarianceReport {
  return {
    cycle_id: "cycle-2026",
    self_rating_enabled: true,
    kd_variances: [
      {
        kd_title: "Revenue Target",
        avg_self_rating: 4.0,
        avg_manager_rating: 3.5,
        variance: 0.5,
        count: 30,
      },
    ],
    competency_variances: [
      {
        competency_name: "Communication",
        is_core: true,
        avg_self_rating: 3.8,
        avg_manager_rating: 3.2,
        variance: 0.6,
        count: 30,
      },
    ],
    ...overrides,
  };
}

// Tests

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SelfVsManagerVarianceSection", () => {
  it("renders loading skeleton while isLoading is true", () => {
    mockUseSelfVsManagerVariance.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
      retry: mockRetry,
    });

    render(<SelfVsManagerVarianceSection cycleId="cycle-2026" />);

    expect(
      screen.getByLabelText("Loading rating variance data"),
    ).toBeInTheDocument();
  });

  it("renders both variance tables when data has KD and competency rows", () => {
    mockUseSelfVsManagerVariance.mockReturnValue({
      data: makeReport(),
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<SelfVsManagerVarianceSection cycleId="cycle-2026" />);

    expect(screen.getByTestId("kd-variance-table")).toBeInTheDocument();
    expect(
      screen.getByTestId("competency-variance-table"),
    ).toBeInTheDocument();
  });

  it("renders self-rating-disabled banner and hides tables when self_rating_enabled is false", () => {
    mockUseSelfVsManagerVariance.mockReturnValue({
      data: makeReport({ self_rating_enabled: false }),
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<SelfVsManagerVarianceSection cycleId="cycle-2026" />);

    expect(
      screen.getByTestId("self-rating-disabled-banner"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Self-ratings are not enabled for this cycle."),
    ).toBeInTheDocument();

    // Tables should not be rendered
    expect(
      screen.queryByTestId("kd-variance-table"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("competency-variance-table"),
    ).not.toBeInTheDocument();
  });

  it("renders empty state when self_rating_enabled but no variance data", () => {
    mockUseSelfVsManagerVariance.mockReturnValue({
      data: makeReport({
        self_rating_enabled: true,
        kd_variances: [],
        competency_variances: [],
      }),
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<SelfVsManagerVarianceSection cycleId="cycle-2026" />);

    expect(
      screen.getByText("No rating variance data for this cycle."),
    ).toBeInTheDocument();
  });

  it("renders error alert with retry button; clicking retry calls retry()", async () => {
    const user = userEvent.setup();
    mockUseSelfVsManagerVariance.mockReturnValue({
      data: null,
      isLoading: false,
      error: "Failed to load rating variance data. Please try again.",
      retry: mockRetry,
    });

    render(<SelfVsManagerVarianceSection cycleId="cycle-2026" />);

    expect(
      screen.getByText(
        "Failed to load rating variance data. Please try again.",
      ),
    ).toBeInTheDocument();

    const retryButton = screen.getByRole("button", { name: "Retry" });
    await user.click(retryButton);
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when cycleId is undefined", () => {
    mockUseSelfVsManagerVariance.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    const { container } = render(
      <SelfVsManagerVarianceSection cycleId={undefined} />,
    );

    expect(container.innerHTML).toBe("");
  });
});
