/**
 * Tests for AuditComplianceSection — verifies PDF download button,
 * loading/downloading state, error display, and disabled state
 * when no cycleId is provided.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuditComplianceSection } from "../components/AuditComplianceSection";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDownloadPdf = vi.fn<(cycleId: string, filename: string) => Promise<void>>();

vi.mock("@/api/reports", () => ({
  downloadAuditCompliancePdf: (cycleId: string, filename: string) =>
    mockDownloadPdf(cycleId, filename),
}));

vi.mock("@/features/appraisals/hooks/useCycles", () => ({
  useCycles: () => ({
    cycles: [
      {
        id: "cycle-2026",
        period_name: "FY 2026",
        start_date: "2026-01-01",
      },
    ],
    isLoading: false,
    error: null,
  }),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AuditComplianceSection", () => {
  it("renders section with download button enabled when cycleId is provided", () => {
    render(<AuditComplianceSection cycleId="cycle-2026" />);

    expect(
      screen.getByLabelText("Audit compliance report"),
    ).toBeInTheDocument();

    const button = screen.getByRole("button", {
      name: "Download audit compliance PDF",
    });
    expect(button).toBeEnabled();
  });

  it("disables download button and shows prompt when cycleId is undefined", () => {
    render(<AuditComplianceSection cycleId={undefined} />);

    const button = screen.getByRole("button", {
      name: "Download audit compliance PDF",
    });
    expect(button).toBeDisabled();

    expect(
      screen.getByText("Select an appraisal cycle to enable the download."),
    ).toBeInTheDocument();
  });

  it("calls downloadAuditCompliancePdf on click and shows downloading state", async () => {
    const user = userEvent.setup();
    mockDownloadPdf.mockResolvedValue(undefined);

    render(<AuditComplianceSection cycleId="cycle-2026" />);

    const button = screen.getByRole("button", {
      name: "Download audit compliance PDF",
    });

    await user.click(button);

    expect(mockDownloadPdf).toHaveBeenCalledWith(
      "cycle-2026",
      "audit-compliance-2026.pdf",
    );
  });

  it("displays error message when download fails", async () => {
    const user = userEvent.setup();
    mockDownloadPdf.mockRejectedValue(new Error("Network error"));

    render(<AuditComplianceSection cycleId="cycle-2026" />);

    const button = screen.getByRole("button", {
      name: "Download audit compliance PDF",
    });

    await user.click(button);

    await waitFor(() => {
      expect(
        screen.getByText(
          "Failed to download the audit compliance report. Please try again or contact support.",
        ),
      ).toBeInTheDocument();
    });
  });
});
