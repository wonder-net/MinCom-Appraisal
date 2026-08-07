/**
 * Tests for CompetencyGapSection — verifies loading, populated,
 * empty, error, form type filter, and lowest-rating highlight states.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CompetencyGapSection } from "../components/CompetencyGapSection";
import type { CompetencyGapReport } from "@/api/reports";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRetry = vi.fn();

const mockUseCompetencyGaps = vi.fn<
  (params: {
    cycleId?: string;
    formType?: "FORM_A" | "FORM_B";
  }) => {
    data: CompetencyGapReport | null;
    isLoading: boolean;
    error: string | null;
    retry: () => void;
  }
>();

vi.mock("../hooks/useCompetencyGaps", () => ({
  useCompetencyGaps: (params: {
    cycleId?: string;
    formType?: "FORM_A" | "FORM_B";
  }) => mockUseCompetencyGaps(params),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeReport(
  overrides: Partial<CompetencyGapReport> = {},
): CompetencyGapReport {
  return {
    cycle_id: "cycle-2026",
    form_type: null,
    gaps: [
      {
        competency_id: "c1",
        competency_name: "Communication",
        avg_manager_rating: 2.3,
        appraisal_count: 45,
      },
      {
        competency_id: "c2",
        competency_name: "Leadership",
        avg_manager_rating: 3.5,
        appraisal_count: 38,
      },
      {
        competency_id: "c3",
        competency_name: "Technical Skills",
        avg_manager_rating: 4.2,
        appraisal_count: 50,
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

describe("CompetencyGapSection", () => {
  it("renders a table row for each item in data.gaps", () => {
    const report = makeReport();
    mockUseCompetencyGaps.mockReturnValue({
      data: report,
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<CompetencyGapSection cycleId="cycle-2026" />);

    expect(screen.getByText("Communication")).toBeInTheDocument();
    expect(screen.getByText("Leadership")).toBeInTheDocument();
    expect(screen.getByText("Technical Skills")).toBeInTheDocument();

    // Verify rated counts
    expect(screen.getByText("45")).toBeInTheDocument();
    expect(screen.getByText("38")).toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument();

    // Verify formatted ratings (1dp)
    expect(screen.getByText("2.3")).toBeInTheDocument();
    expect(screen.getByText("3.5")).toBeInTheDocument();
    expect(screen.getByText("4.2")).toBeInTheDocument();
  });

  it("first row has the lowest rating and is visually distinguished with bg-red-50", () => {
    const report = makeReport();
    mockUseCompetencyGaps.mockReturnValue({
      data: report,
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<CompetencyGapSection cycleId="cycle-2026" />);

    const firstRow = screen.getByTestId("gap-row-c1");
    expect(firstRow).toHaveClass("bg-red-50");

    // Second row should NOT have bg-red-50
    const secondRow = screen.getByTestId("gap-row-c2");
    expect(secondRow).not.toHaveClass("bg-red-50");
  });

  it("toggling the form type filter updates the formType passed to the hook", async () => {
    const user = userEvent.setup();
    mockUseCompetencyGaps.mockReturnValue({
      data: makeReport(),
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<CompetencyGapSection cycleId="cycle-2026" />);

    // Initial call should have formType undefined (ALL selected)
    expect(mockUseCompetencyGaps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cycleId: "cycle-2026",
        formType: undefined,
      }),
    );

    // Click Form A
    const formAButton = screen.getByTestId("form-type-form_a");
    await user.click(formAButton);

    expect(mockUseCompetencyGaps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cycleId: "cycle-2026",
        formType: "FORM_A",
      }),
    );

    // Click Form B
    const formBButton = screen.getByTestId("form-type-form_b");
    await user.click(formBButton);

    expect(mockUseCompetencyGaps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cycleId: "cycle-2026",
        formType: "FORM_B",
      }),
    );

    // Click All to clear filter
    const allButton = screen.getByTestId("form-type-all");
    await user.click(allButton);

    expect(mockUseCompetencyGaps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cycleId: "cycle-2026",
        formType: undefined,
      }),
    );
  });

  it("shows loading skeleton when isLoading is true", () => {
    mockUseCompetencyGaps.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
      retry: mockRetry,
    });

    render(<CompetencyGapSection cycleId="cycle-2026" />);

    expect(
      screen.getByLabelText("Loading competency gap report"),
    ).toBeInTheDocument();
  });

  it("shows empty state when gaps is an empty array", () => {
    mockUseCompetencyGaps.mockReturnValue({
      data: makeReport({ gaps: [] }),
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<CompetencyGapSection cycleId="cycle-2026" />);

    expect(
      screen.getByText(
        "No competency gap data available for this cycle.",
      ),
    ).toBeInTheDocument();

    // Table should not be rendered
    expect(
      screen.queryByLabelText("Competency gap table"),
    ).not.toBeInTheDocument();
  });

  it("renders an error alert with retry button when error is non-null", () => {
    mockUseCompetencyGaps.mockReturnValue({
      data: null,
      isLoading: false,
      error: "Failed to load competency gap report. Please try again.",
      retry: mockRetry,
    });

    render(<CompetencyGapSection cycleId="cycle-2026" />);

    expect(
      screen.getByText(
        "Failed to load competency gap report. Please try again.",
      ),
    ).toBeInTheDocument();

    const retryButton = screen.getByRole("button", { name: "Retry" });
    expect(retryButton).toBeInTheDocument();
  });

  it("does not render when cycleId is undefined", () => {
    mockUseCompetencyGaps.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    const { container } = render(
      <CompetencyGapSection cycleId={undefined} />,
    );

    expect(
      screen.queryByLabelText("Competency gap report"),
    ).not.toBeInTheDocument();
    expect(container.innerHTML).toBe("");
  });

  it("applies colour-coded rating classes: red for <3, amber for 3-4, green for >4", () => {
    const report = makeReport();
    mockUseCompetencyGaps.mockReturnValue({
      data: report,
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<CompetencyGapSection cycleId="cycle-2026" />);

    // 2.3 -> red
    const ratingRed = screen.getByLabelText("Average rating: 2.3");
    expect(ratingRed).toHaveClass("text-red-700");

    // 3.5 -> amber
    const ratingAmber = screen.getByLabelText("Average rating: 3.5");
    expect(ratingAmber).toHaveClass("text-amber-700");

    // 4.2 -> green
    const ratingGreen = screen.getByLabelText("Average rating: 4.2");
    expect(ratingGreen).toHaveClass("text-green-700");
  });
});
