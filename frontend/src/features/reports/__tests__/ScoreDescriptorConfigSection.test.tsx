/**
 * Tests for ScoreDescriptorConfigSection — verifies loading, populated
 * with matching/differing bands, empty snapshot, error, and no-cycleId states.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScoreDescriptorConfigSection } from "../components/ScoreDescriptorConfigSection";
import type { ScoreDescriptorConfigReport, DescriptorBand } from "@/api/reports";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRetry = vi.fn();

const mockUseScoreDescriptorConfig = vi.fn<
  (cycleId?: string) => {
    data: ScoreDescriptorConfigReport | null;
    isLoading: boolean;
    error: string | null;
    retry: () => void;
  }
>();

vi.mock("../hooks/useScoreDescriptorConfig", () => ({
  useScoreDescriptorConfig: (cycleId?: string) =>
    mockUseScoreDescriptorConfig(cycleId),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BAND_A: DescriptorBand = {
  sort_order: 1,
  min_score: "1.00",
  max_score: "2.00",
  kd_label: "Below Standard",
  competency_label: "Developing",
};

const BAND_B: DescriptorBand = {
  sort_order: 2,
  min_score: "2.01",
  max_score: "3.00",
  kd_label: "Meets Expectations",
  competency_label: "Competent",
};

const BAND_B_MODIFIED: DescriptorBand = {
  sort_order: 2,
  min_score: "2.01",
  max_score: "3.50",
  kd_label: "Meets Expectations",
  competency_label: "Competent",
};

function makeReport(
  overrides: Partial<ScoreDescriptorConfigReport> = {},
): ScoreDescriptorConfigReport {
  return {
    cycle_id: "cycle-2026",
    cycle_name: "FY 2026",
    cycle_status: "ACTIVE",
    config_snapshot_bands: [BAND_A, BAND_B],
    live_bands: [BAND_A, BAND_B],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ScoreDescriptorConfigSection", () => {
  it("renders loading skeleton while isLoading is true", () => {
    mockUseScoreDescriptorConfig.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
      retry: mockRetry,
    });

    render(<ScoreDescriptorConfigSection cycleId="cycle-2026" />);

    expect(
      screen.getByLabelText("Loading descriptor configuration"),
    ).toBeInTheDocument();
  });

  it("renders both snapshot and live tables when bands match", () => {
    mockUseScoreDescriptorConfig.mockReturnValue({
      data: makeReport(),
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<ScoreDescriptorConfigSection cycleId="cycle-2026" />);

    expect(
      screen.getByLabelText("Snapshot descriptor bands table"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Live descriptor bands table"),
    ).toBeInTheDocument();

    // No warning banner when bands match
    expect(
      screen.queryByText("Live bands have been modified since cycle activation."),
    ).not.toBeInTheDocument();
  });

  it("shows warning banner when snapshot and live bands differ", () => {
    mockUseScoreDescriptorConfig.mockReturnValue({
      data: makeReport({
        live_bands: [BAND_A, BAND_B_MODIFIED],
      }),
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<ScoreDescriptorConfigSection cycleId="cycle-2026" />);

    expect(
      screen.getByText(
        "Live bands have been modified since cycle activation.",
      ),
    ).toBeInTheDocument();
  });

  it("shows empty snapshot message when config_snapshot_bands is empty", () => {
    mockUseScoreDescriptorConfig.mockReturnValue({
      data: makeReport({ config_snapshot_bands: [] }),
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<ScoreDescriptorConfigSection cycleId="cycle-2026" />);

    expect(
      screen.getByText("No snapshot recorded for this cycle."),
    ).toBeInTheDocument();

    // Snapshot table should not be rendered
    expect(
      screen.queryByLabelText("Snapshot descriptor bands table"),
    ).not.toBeInTheDocument();

    // Live table should still render
    expect(
      screen.getByLabelText("Live descriptor bands table"),
    ).toBeInTheDocument();
  });

  it("renders error alert with retry button; clicking retry calls retry()", async () => {
    const user = userEvent.setup();
    mockUseScoreDescriptorConfig.mockReturnValue({
      data: null,
      isLoading: false,
      error: "Failed to load descriptor configuration. Please try again.",
      retry: mockRetry,
    });

    render(<ScoreDescriptorConfigSection cycleId="cycle-2026" />);

    expect(
      screen.getByText(
        "Failed to load descriptor configuration. Please try again.",
      ),
    ).toBeInTheDocument();

    const retryButton = screen.getByRole("button", { name: "Retry" });
    await user.click(retryButton);
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  it("renders placeholder when cycleId is undefined", () => {
    mockUseScoreDescriptorConfig.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<ScoreDescriptorConfigSection cycleId={undefined} />);

    expect(
      screen.getByText("Select a cycle to view descriptor configuration."),
    ).toBeInTheDocument();
  });
});
