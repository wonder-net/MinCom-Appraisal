/**
 * Tests for DisputeLogSection — verifies loading, populated,
 * empty, error, null-action, null-signed_at, and missing cycleId states.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DisputeLogSection } from "../components/DisputeLogSection";
import type { DisputeLogReport } from "@/api/reports";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRetry = vi.fn();

const mockUseDisputeLog = vi.fn<
  (cycleId?: string) => {
    data: DisputeLogReport | null;
    isLoading: boolean;
    error: string | null;
    retry: () => void;
  }
>();

vi.mock("../hooks/useDisputeLog", () => ({
  useDisputeLog: (cycleId?: string) => mockUseDisputeLog(cycleId),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeReport(
  overrides: Partial<DisputeLogReport> = {},
): DisputeLogReport {
  return {
    cycle_id: "cycle-2026",
    count: 3,
    disputes: [
      {
        appraisal_id: "appr-1",
        employee_name: "John Doe",
        department_name: "IT",
        cycle_name: "2026 Annual",
        signed_at: "2026-04-01T10:00:00Z",
        signature_action: "REJECT",
        rejection_reason: "Scores are inaccurate",
        signer_role: "APPRAISEE",
        resolution_status: "DISCUSSION",
      },
      {
        appraisal_id: "appr-2",
        employee_name: "Alice Brown",
        department_name: "Finance",
        cycle_name: "2026 Annual",
        signed_at: "2026-04-02T14:30:00Z",
        signature_action: "COMMENTS_ATTACHED",
        rejection_reason: "Missing deliverables",
        signer_role: "APPRAISER",
        resolution_status: "DISPUTED",
      },
      {
        appraisal_id: "appr-3",
        employee_name: "Charlie Green",
        department_name: "HR",
        cycle_name: "2026 Annual",
        signed_at: null,
        signature_action: null,
        rejection_reason: null,
        signer_role: null,
        resolution_status: "FINALISED",
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

describe("DisputeLogSection", () => {
  it("renders loading skeleton while isLoading is true", () => {
    mockUseDisputeLog.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
      retry: mockRetry,
    });

    render(<DisputeLogSection cycleId="cycle-2026" />);

    expect(
      screen.getByLabelText("Loading dispute log"),
    ).toBeInTheDocument();
  });

  it("renders all table rows from mock DisputeLogReport with count=3", () => {
    const report = makeReport();
    mockUseDisputeLog.mockReturnValue({
      data: report,
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<DisputeLogSection cycleId="cycle-2026" />);

    const table = screen.getByLabelText(
      "Dispute and rejection log table",
    );

    // Check header columns
    expect(within(table).getByText("Employee")).toBeInTheDocument();
    expect(within(table).getByText("Department")).toBeInTheDocument();
    expect(within(table).getByText("Cycle")).toBeInTheDocument();
    expect(within(table).getByText("Signed At")).toBeInTheDocument();
    expect(within(table).getByText("Action")).toBeInTheDocument();
    expect(within(table).getByText("Reason")).toBeInTheDocument();
    expect(within(table).getByText("Role")).toBeInTheDocument();
    expect(
      within(table).getByText("Resolution Status"),
    ).toBeInTheDocument();

    // Check data rows
    expect(within(table).getByText("John Doe")).toBeInTheDocument();
    expect(within(table).getByText("Alice Brown")).toBeInTheDocument();
    expect(within(table).getByText("Charlie Green")).toBeInTheDocument();

    // Role column renders formatRole() output: "APPRAISER" -> "Appraisor",
    // "APPRAISEE" -> "Appraisee"
    expect(within(table).getByText("Appraisor")).toBeInTheDocument();
    expect(within(table).getByText("Appraisee")).toBeInTheDocument();

    // Count badge
    expect(screen.getByText("3")).toBeInTheDocument();

    // 1 header row + 3 data rows
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(4);
  });

  it("renders empty-state message when disputes array is empty", () => {
    mockUseDisputeLog.mockReturnValue({
      data: makeReport({ count: 0, disputes: [] }),
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<DisputeLogSection cycleId="cycle-2026" />);

    expect(
      screen.getByText(
        "No disputes or rejections recorded for this cycle.",
      ),
    ).toBeInTheDocument();

    // No table rendered
    expect(
      screen.queryByLabelText("Dispute and rejection log table"),
    ).not.toBeInTheDocument();
  });

  it("renders error alert with retry button; clicking retry calls retry()", async () => {
    const user = userEvent.setup();
    mockUseDisputeLog.mockReturnValue({
      data: null,
      isLoading: false,
      error: "Failed to load dispute log. Please try again.",
      retry: mockRetry,
    });

    render(<DisputeLogSection cycleId="cycle-2026" />);

    expect(
      screen.getByText(
        "Failed to load dispute log. Please try again.",
      ),
    ).toBeInTheDocument();

    const retryButton = screen.getByRole("button", { name: "Retry" });
    expect(retryButton).toBeInTheDocument();

    await user.click(retryButton);
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when cycleId is undefined", () => {
    mockUseDisputeLog.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    const { container } = render(
      <DisputeLogSection cycleId={undefined} />,
    );

    expect(
      screen.queryByLabelText("Dispute and rejection log"),
    ).not.toBeInTheDocument();
    expect(container.innerHTML).toBe("");
  });

  it("displays dash when signed_at is null", () => {
    const report = makeReport({
      count: 1,
      disputes: [
        {
          appraisal_id: "appr-null-date",
          employee_name: "Null Date Employee",
          department_name: "IT",
          cycle_name: "2026 Annual",
          signed_at: null,
          signature_action: "REJECT",
          rejection_reason: "Some reason",
          signer_role: "APPRAISEE",
          resolution_status: "DISCUSSION",
        },
      ],
    });
    mockUseDisputeLog.mockReturnValue({
      data: report,
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<DisputeLogSection cycleId="cycle-2026" />);

    const table = screen.getByLabelText(
      "Dispute and rejection log table",
    );
    const rows = within(table).getAllByRole("row");
    // Row 1 is the data row (index 0 is header)
    const cells = within(rows[1]).getAllByRole("cell");
    // Signed At is the 4th column (index 3)
    expect(cells[3].textContent).toBe("\u2014");
  });

  it("displays 'Disputed (no signature)' when signature_action is null", () => {
    const report = makeReport({
      count: 1,
      disputes: [
        {
          appraisal_id: "appr-null-action",
          employee_name: "Null Action Employee",
          department_name: "IT",
          cycle_name: "2026 Annual",
          signed_at: "2026-04-01T10:00:00Z",
          signature_action: null,
          rejection_reason: "Some reason",
          signer_role: null,
          resolution_status: "DISPUTED",
        },
      ],
    });
    mockUseDisputeLog.mockReturnValue({
      data: report,
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<DisputeLogSection cycleId="cycle-2026" />);

    expect(
      screen.getByText("Disputed (no signature)"),
    ).toBeInTheDocument();
  });

  it("displays dash when rejection_reason is null", () => {
    const report = makeReport({
      count: 1,
      disputes: [
        {
          appraisal_id: "appr-null-reason",
          employee_name: "Null Reason Employee",
          department_name: "IT",
          cycle_name: "2026 Annual",
          signed_at: "2026-04-01T10:00:00Z",
          signature_action: "REJECT",
          rejection_reason: null,
          signer_role: "APPRAISEE",
          resolution_status: "DISCUSSION",
        },
      ],
    });
    mockUseDisputeLog.mockReturnValue({
      data: report,
      isLoading: false,
      error: null,
      retry: mockRetry,
    });

    render(<DisputeLogSection cycleId="cycle-2026" />);

    const table = screen.getByLabelText(
      "Dispute and rejection log table",
    );
    const rows = within(table).getAllByRole("row");
    const cells = within(rows[1]).getAllByRole("cell");
    // Reason is the 6th column (index 5)
    expect(cells[5].textContent).toBe("\u2014");
  });

  it("calls useDisputeLog with the correct cycleId argument", () => {
    mockUseDisputeLog.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
      retry: mockRetry,
    });

    render(<DisputeLogSection cycleId="specific-cycle-id" />);

    expect(mockUseDisputeLog).toHaveBeenCalledWith("specific-cycle-id");
  });
});
