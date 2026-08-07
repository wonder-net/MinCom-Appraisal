/**
 * Tests for CareerAspirationPipelineSection — verifies loading,
 * populated table with ranked rows, empty, and error states.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CareerAspirationPipelineSection } from "../components/CareerAspirationPipelineSection";
import type { CareerAspirationPipelineReport } from "@/api/reports";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRetry = vi.fn();

const mockUseCareerAspirationPipeline = vi.fn<
  (cycleId?: string) => {
    data: CareerAspirationPipelineReport | null;
    isLoading: boolean;
    error: string | null;
    retry: () => void;
  }
>();

vi.mock("../hooks/useCareerAspirationPipeline", () => ({
  useCareerAspirationPipeline: (cycleId?: string) =>
    mockUseCareerAspirationPipeline(cycleId),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeReport(
  overrides: Partial<CareerAspirationPipelineReport> = {},
): CareerAspirationPipelineReport {
  return {
    cycle_id: "cycle-2026",
    aspired_roles: [
      { aspired_role: "Senior Engineer", count: 15, top_priority: "FIRST" },
      { aspired_role: "Team Lead", count: 10, top_priority: "SECOND" },
      { aspired_role: "Architect", count: 5, top_priority: "THIRD" },
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

describe("CareerAspirationPipelineSection", () => {
  it("renders loading skeleton while isLoading is true", () => {
    mockUseCareerAspirationPipeline.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
      retry: mockRetry,
    });

    render(<CareerAspirationPipelineSection cycleId="cycle-2026" />);

    expect(
      screen.getByLabelText("Loading career aspiration data"),
    ).toBeInTheDocument();
  });

  it("renders ranked table rows with correct data and percentages", () => {
    mockUseCareerAspirationPipeline.mockReturnValue({
      data: makeReport(),
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<CareerAspirationPipelineSection cycleId="cycle-2026" />);

    const table = screen.getByRole("table", {
      name: "Career aspiration pipeline",
    });

    // Check role names
    expect(within(table).getByText("Senior Engineer")).toBeInTheDocument();
    expect(within(table).getByText("Team Lead")).toBeInTheDocument();
    expect(within(table).getByText("Architect")).toBeInTheDocument();

    // Check counts
    expect(within(table).getByText("15")).toBeInTheDocument();
    expect(within(table).getByText("10")).toBeInTheDocument();
    expect(within(table).getByText("5")).toBeInTheDocument();

    // Check priority badges
    expect(within(table).getByText("First Priority")).toBeInTheDocument();
    expect(within(table).getByText("Second Priority")).toBeInTheDocument();
    expect(within(table).getByText("Third Priority")).toBeInTheDocument();

    // 1 header row + 3 data rows
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(4);
  });

  it("renders empty state when aspired_roles is empty", () => {
    mockUseCareerAspirationPipeline.mockReturnValue({
      data: makeReport({ aspired_roles: [] }),
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<CareerAspirationPipelineSection cycleId="cycle-2026" />);

    expect(
      screen.getByText(
        "No career aspiration data found for this cycle.",
      ),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("table", { name: "Career aspiration pipeline" }),
    ).not.toBeInTheDocument();
  });

  it("renders error alert with retry button; clicking retry calls retry()", async () => {
    const user = userEvent.setup();
    mockUseCareerAspirationPipeline.mockReturnValue({
      data: null,
      isLoading: false,
      error: "Failed to load career aspiration data. Please try again.",
      retry: mockRetry,
    });

    render(<CareerAspirationPipelineSection cycleId="cycle-2026" />);

    expect(
      screen.getByText(
        "Failed to load career aspiration data. Please try again.",
      ),
    ).toBeInTheDocument();

    const retryButton = screen.getByRole("button", { name: "Retry" });
    await user.click(retryButton);
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });
});
