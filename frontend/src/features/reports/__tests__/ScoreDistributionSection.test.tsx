/**
 * Tests for ScoreDistributionSection — verifies loading, populated,
 * empty, error, department filter, form type filter, clear filters,
 * and role-gated visibility states.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScoreDistributionSection } from "../components/ScoreDistributionSection";
import type { ScoreDistributionReport } from "@/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRetry = vi.fn();

const mockUseScoreDistribution = vi.fn<
  (params: {
    cycleId?: string;
    departmentId?: string;
    formType?: "FORM_A" | "FORM_B" | "";
    jobFamily?: string;
  }) => {
    data: ScoreDistributionReport | null;
    isLoading: boolean;
    error: string | null;
    retry: () => void;
  }
>();

vi.mock("../hooks/useScoreDistribution", () => ({
  useScoreDistribution: (params: {
    cycleId?: string;
    departmentId?: string;
    formType?: "FORM_A" | "FORM_B" | "";
    jobFamily?: string;
  }) => mockUseScoreDistribution(params),
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
  overrides: Partial<ScoreDistributionReport> = {},
): ScoreDistributionReport {
  return {
    cycle_id: "cycle-2026",
    total: 100,
    bands: [
      { label: "Below Standard", sort_order: 1, count: 5, percentage: 5.0 },
      {
        label: "Generally Performing",
        sort_order: 2,
        count: 30,
        percentage: 30.0,
      },
      { label: "Fully Competent", sort_order: 3, count: 40, percentage: 40.0 },
      {
        label: "Exceeds Expectations",
        sort_order: 4,
        count: 20,
        percentage: 20.0,
      },
      { label: "Outstanding", sort_order: 5, count: 5, percentage: 5.0 },
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

describe("ScoreDistributionSection", () => {
  it("renders a loading skeleton when isLoading is true", () => {
    mockUseScoreDistribution.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
      retry: mockRetry,
    });

    render(<ScoreDistributionSection cycleId="cycle-2026" />);

    expect(
      screen.getByLabelText("Loading score distribution"),
    ).toBeInTheDocument();
  });

  it("renders a band row for each entry in data.bands with correct label, count, and percentage text", () => {
    const report = makeReport();
    mockUseScoreDistribution.mockReturnValue({
      data: report,
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<ScoreDistributionSection cycleId="cycle-2026" />);

    // Check that all band labels are present
    expect(screen.getByText("Below Standard")).toBeInTheDocument();
    expect(screen.getByText("Generally Performing")).toBeInTheDocument();
    expect(screen.getByText("Fully Competent")).toBeInTheDocument();
    expect(screen.getByText("Exceeds Expectations")).toBeInTheDocument();
    expect(screen.getByText("Outstanding")).toBeInTheDocument();

    // Check counts
    expect(screen.getByText("40")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();

    // Check percentages
    expect(screen.getByText("40.0%")).toBeInTheDocument();
    expect(screen.getByText("30.0%")).toBeInTheDocument();
    expect(screen.getByText("20.0%")).toBeInTheDocument();
    // 5.0% appears twice (Below Standard and Outstanding)
    expect(screen.getAllByText("5.0%")).toHaveLength(2);

    // Check total badge
    expect(
      screen.getByLabelText("100 total appraisals"),
    ).toBeInTheDocument();
  });

  it("renders a 'No data' empty state when data.total is 0", () => {
    mockUseScoreDistribution.mockReturnValue({
      data: makeReport({ total: 0, bands: [] }),
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<ScoreDistributionSection cycleId="cycle-2026" />);

    expect(
      screen.getByText("No finalised appraisals in this cycle."),
    ).toBeInTheDocument();

    // No band bars rendered
    expect(
      screen.queryByLabelText("Score distribution bands"),
    ).not.toBeInTheDocument();
  });

  it("renders an error alert when error is non-null", () => {
    mockUseScoreDistribution.mockReturnValue({
      data: null,
      isLoading: false,
      error: "Failed to load score distribution. Please try again.",
      retry: mockRetry,
    });

    render(<ScoreDistributionSection cycleId="cycle-2026" />);

    expect(
      screen.getByText(
        "Failed to load score distribution. Please try again.",
      ),
    ).toBeInTheDocument();

    const retryButton = screen.getByRole("button", { name: "Retry" });
    expect(retryButton).toBeInTheDocument();
  });

  it("department filter dropdown change triggers a new API call with the correct department_id param", async () => {
    const user = userEvent.setup();
    mockUseScoreDistribution.mockReturnValue({
      data: makeReport(),
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<ScoreDistributionSection cycleId="cycle-2026" />);

    const select = screen.getByTestId("dist-department-filter");
    await user.selectOptions(select, "dept-1");

    // Hook should have been last called with the department ID
    expect(mockUseScoreDistribution).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cycleId: "cycle-2026",
        departmentId: "dept-1",
      }),
    );
  });

  it("form type selector change triggers a new API call with form_type=FORM_A or form_type=FORM_B", async () => {
    const user = userEvent.setup();
    mockUseScoreDistribution.mockReturnValue({
      data: makeReport(),
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<ScoreDistributionSection cycleId="cycle-2026" />);

    const select = screen.getByTestId("dist-form-type-filter");
    await user.selectOptions(select, "FORM_A");

    expect(mockUseScoreDistribution).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cycleId: "cycle-2026",
        formType: "FORM_A",
      }),
    );

    // Now select FORM_B
    await user.selectOptions(select, "FORM_B");

    expect(mockUseScoreDistribution).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cycleId: "cycle-2026",
        formType: "FORM_B",
      }),
    );
  });

  it("clearing all filters triggers an API call with no filter params", async () => {
    const user = userEvent.setup();
    mockUseScoreDistribution.mockReturnValue({
      data: makeReport(),
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<ScoreDistributionSection cycleId="cycle-2026" />);

    // Set filters first
    const deptSelect = screen.getByTestId("dist-department-filter");
    await user.selectOptions(deptSelect, "dept-1");

    const formSelect = screen.getByTestId("dist-form-type-filter");
    await user.selectOptions(formSelect, "FORM_A");

    // Clear filters
    await user.selectOptions(deptSelect, "");
    await user.selectOptions(formSelect, "");

    expect(mockUseScoreDistribution).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cycleId: "cycle-2026",
        departmentId: undefined,
        formType: "",
        jobFamily: undefined,
      }),
    );
  });

  it("component does not render at all when cycleId is undefined", () => {
    mockUseScoreDistribution.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    const { container } = render(
      <ScoreDistributionSection cycleId={undefined} />,
    );

    expect(
      screen.queryByLabelText("Performance distribution"),
    ).not.toBeInTheDocument();
    expect(container.innerHTML).toBe("");
  });
});
