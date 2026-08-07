/**
 * Tests for BSCPerspectiveSection — verifies loading, populated,
 * empty, error, null score, department filter, and hook param states.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BSCPerspectiveSection } from "../components/BSCPerspectiveSection";
import type { BSCPerspectiveReport } from "@/api/reports";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRetry = vi.fn();

const mockUseBSCPerspectives = vi.fn<
  (params: {
    cycleId?: string;
    departmentId?: string;
  }) => {
    data: BSCPerspectiveReport | null;
    isLoading: boolean;
    error: string | null;
    retry: () => void;
  }
>();

vi.mock("../hooks/useBSCPerspectives", () => ({
  useBSCPerspectives: (params: {
    cycleId?: string;
    departmentId?: string;
  }) => mockUseBSCPerspectives(params),
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
  overrides: Partial<BSCPerspectiveReport> = {},
): BSCPerspectiveReport {
  return {
    cycle_id: "cycle-2026",
    perspectives: [
      {
        perspective_id: "p1",
        perspective_name: "Financial",
        avg_weighted_score: 0.75,
        appraisal_count: 25,
      },
      {
        perspective_id: "p2",
        perspective_name: "Customer",
        avg_weighted_score: 0.82,
        appraisal_count: 25,
      },
      {
        perspective_id: "p3",
        perspective_name: "Internal Business Process",
        avg_weighted_score: 0.65,
        appraisal_count: 25,
      },
      {
        perspective_id: "p4",
        perspective_name: "Learning & Growth",
        avg_weighted_score: 0.91,
        appraisal_count: 25,
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

describe("BSCPerspectiveSection", () => {
  it("renders a loading skeleton when isLoading is true", () => {
    mockUseBSCPerspectives.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
      retry: mockRetry,
    });

    render(<BSCPerspectiveSection cycleId="cycle-2026" />);

    expect(
      screen.getByLabelText("Loading BSC perspective breakdown"),
    ).toBeInTheDocument();
  });

  it("renders all four perspective rows with correct names and formatted scores", () => {
    const report = makeReport();
    mockUseBSCPerspectives.mockReturnValue({
      data: report,
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<BSCPerspectiveSection cycleId="cycle-2026" />);

    // Perspective names
    expect(screen.getByText("Financial")).toBeInTheDocument();
    expect(screen.getByText("Customer")).toBeInTheDocument();
    expect(screen.getByText("Internal Business Process")).toBeInTheDocument();
    expect(screen.getByText("Learning & Growth")).toBeInTheDocument();

    // Formatted scores (2dp)
    expect(screen.getByText("0.75")).toBeInTheDocument();
    expect(screen.getByText("0.82")).toBeInTheDocument();
    expect(screen.getByText("0.65")).toBeInTheDocument();
    expect(screen.getByText("0.91")).toBeInTheDocument();

    // Appraisal counts
    expect(screen.getAllByText("25 appraisals")).toHaveLength(4);
  });

  it("renders avg_weighted_score=null as a dash, not 'null' or '0'", () => {
    const report = makeReport({
      perspectives: [
        {
          perspective_id: "p1",
          perspective_name: "Financial",
          avg_weighted_score: null,
          appraisal_count: 0,
        },
      ],
    });

    mockUseBSCPerspectives.mockReturnValue({
      data: report,
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<BSCPerspectiveSection cycleId="cycle-2026" />);

    // Should show em-dash
    expect(screen.getByText("\u2014")).toBeInTheDocument();

    // Should NOT show "null" or "0" or "0.00"
    expect(screen.queryByText("null")).not.toBeInTheDocument();
    expect(screen.queryByText("0.00")).not.toBeInTheDocument();
  });

  it("renders an empty-state message when perspectives is empty", () => {
    mockUseBSCPerspectives.mockReturnValue({
      data: makeReport({ perspectives: [] }),
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<BSCPerspectiveSection cycleId="cycle-2026" />);

    expect(
      screen.getByText("No finalised appraisals with KD data."),
    ).toBeInTheDocument();

    // No perspective rows rendered
    expect(
      screen.queryByLabelText("BSC perspectives"),
    ).not.toBeInTheDocument();
  });

  it("selecting a department from the filter calls useBSCPerspectives with the correct departmentId", async () => {
    const user = userEvent.setup();
    mockUseBSCPerspectives.mockReturnValue({
      data: makeReport(),
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<BSCPerspectiveSection cycleId="cycle-2026" />);

    const select = screen.getByTestId("bsc-department-filter");
    await user.selectOptions(select, "dept-1");

    expect(mockUseBSCPerspectives).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cycleId: "cycle-2026",
        departmentId: "dept-1",
      }),
    );
  });

  it("useBSCPerspectives is called with the correct params object", () => {
    mockUseBSCPerspectives.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
      retry: mockRetry,
    });

    render(<BSCPerspectiveSection cycleId="cycle-2026" />);

    expect(mockUseBSCPerspectives).toHaveBeenCalledWith({
      cycleId: "cycle-2026",
      departmentId: undefined,
    });
  });

  it("renders an error alert with retry button when error is non-null", () => {
    mockUseBSCPerspectives.mockReturnValue({
      data: null,
      isLoading: false,
      error: "Failed to load BSC perspective breakdown. Please try again.",
      retry: mockRetry,
    });

    render(<BSCPerspectiveSection cycleId="cycle-2026" />);

    expect(
      screen.getByText(
        "Failed to load BSC perspective breakdown. Please try again.",
      ),
    ).toBeInTheDocument();

    const retryButton = screen.getByRole("button", { name: "Retry" });
    expect(retryButton).toBeInTheDocument();
  });

  it("does not render when cycleId is undefined", () => {
    mockUseBSCPerspectives.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    const { container } = render(
      <BSCPerspectiveSection cycleId={undefined} />,
    );

    expect(
      screen.queryByLabelText("BSC perspective breakdown"),
    ).not.toBeInTheDocument();
    expect(container.innerHTML).toBe("");
  });

  it("clearing department filter re-fetches with undefined departmentId", async () => {
    const user = userEvent.setup();
    mockUseBSCPerspectives.mockReturnValue({
      data: makeReport(),
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<BSCPerspectiveSection cycleId="cycle-2026" />);

    const select = screen.getByTestId("bsc-department-filter");

    // Select a department
    await user.selectOptions(select, "dept-2");
    expect(mockUseBSCPerspectives).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cycleId: "cycle-2026",
        departmentId: "dept-2",
      }),
    );

    // Clear back to "All Departments"
    await user.selectOptions(select, "");
    expect(mockUseBSCPerspectives).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cycleId: "cycle-2026",
        departmentId: undefined,
      }),
    );
  });
});
