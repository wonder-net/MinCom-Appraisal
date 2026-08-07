/**
 * Tests for SignoffSection — verifies button visibility, signature table,
 * accept/reject flows, dialog validation, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignoffSection } from "../components/SignoffSection";
import type { Signature, SubmitSignatureResponse } from "@/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSubmitSignature = vi.fn<
  (
    appraisalId: string,
    action: "ACCEPT" | "REJECT",
    reason?: string,
  ) => Promise<SubmitSignatureResponse>
>();

vi.mock("@/api/signatures", () => ({
  submitSignature: (...args: unknown[]) =>
    mockSubmitSignature(
      args[0] as string,
      args[1] as "ACCEPT" | "REJECT",
      args[2] as string | undefined,
    ),
}));

const mockUser = { id: "u-100", email: "test@example.com", roles: ["EMPLOYEE" as const], is_mfa_enabled: false };

vi.mock("@/auth/useAuth", () => ({
  useAuth: () => ({
    user: mockUser,
    isAuthenticated: true,
    isLoading: false,
    accessToken: "mock-token",
    login: vi.fn(),
    verifyMFA: vi.fn(),
    logout: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSignature(overrides: Partial<Signature> = {}): Signature {
  return {
    id: "sig-001",
    signer_id: "u-200",
    signer_name: "Kwame Asante",
    signer_role: "APPRAISER",
    action: "ACCEPT",
    reason: null,
    signed_at: "15 Mar 2026, 09:14 AM",
    signing_round: 1,
    ...overrides,
  };
}

function makeSuccessResponse(
  action: "ACCEPT" | "REJECT",
  reason: string | null = null,
): SubmitSignatureResponse {
  return {
    appraisal_status: "SIGNED_OFF",
    signature: makeSignature({
      id: "sig-new",
      signer_id: "u-100",
      signer_name: "Test User",
      signer_role: "APPRAISEE",
      action,
      reason,
    }),
  };
}

const mockOnRefresh = vi.fn();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SignoffSection", () => {
  it("renders ACCEPT and REJECT buttons when status=PENDING_SIGNOFF and userRelation=APPRAISEE and user has not signed", () => {
    render(
      <SignoffSection
        appraisalId="a-001"
        status="PENDING_SIGNOFF"
        userRelation="APPRAISEE"
        signatures={[]}
        onRefresh={mockOnRefresh}
      />,
    );

    expect(
      screen.getByRole("button", { name: /accept appraisal sign-off/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /reject appraisal sign-off/i }),
    ).toBeInTheDocument();
  });

  it("renders ACCEPT and REJECT buttons when userRelation=APPRAISER", () => {
    render(
      <SignoffSection
        appraisalId="a-001"
        status="PENDING_SIGNOFF"
        userRelation="APPRAISER"
        signatures={[]}
        onRefresh={mockOnRefresh}
      />,
    );

    expect(
      screen.getByRole("button", { name: /accept appraisal sign-off/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /reject appraisal sign-off/i }),
    ).toBeInTheDocument();
  });

  it("does not render sign buttons when userRelation=NONE", () => {
    render(
      <SignoffSection
        appraisalId="a-001"
        status="PENDING_SIGNOFF"
        userRelation="NONE"
        signatures={[]}
        onRefresh={mockOnRefresh}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /accept appraisal sign-off/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /reject appraisal sign-off/i }),
    ).not.toBeInTheDocument();
  });

  it("does not render sign buttons when status=SIGNED_OFF", () => {
    const signatures = [
      makeSignature({ id: "sig-001", signer_id: "u-200" }),
      makeSignature({ id: "sig-002", signer_id: "u-100", signer_name: "Test User" }),
    ];

    render(
      <SignoffSection
        appraisalId="a-001"
        status="SIGNED_OFF"
        userRelation="APPRAISEE"
        signatures={signatures}
        onRefresh={mockOnRefresh}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /accept appraisal sign-off/i }),
    ).not.toBeInTheDocument();

    // "Signed Off" badge shown
    expect(screen.getByText("Signed Off")).toBeInTheDocument();
  });

  it("does not render sign buttons when user has already signed", () => {
    const signatures = [
      makeSignature({ id: "sig-001", signer_id: "u-100", signer_name: "Test User" }),
    ];

    render(
      <SignoffSection
        appraisalId="a-001"
        status="PENDING_SIGNOFF"
        userRelation="APPRAISEE"
        signatures={signatures}
        onRefresh={mockOnRefresh}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /accept appraisal sign-off/i }),
    ).not.toBeInTheDocument();
  });

  it("renders signature records in a table", () => {
    const signatures = [
      makeSignature({
        id: "sig-001",
        signer_name: "Kwame Asante",
        signer_role: "APPRAISER",
        action: "ACCEPT",
        signed_at: "15 Mar 2026, 09:14 AM",
      }),
      makeSignature({
        id: "sig-002",
        signer_name: "Adjoa Mensah",
        signer_role: "APPRAISEE",
        action: "REJECT",
        reason: "Scores are inaccurate",
        signed_at: "15 Mar 2026, 10:30 AM",
      }),
    ];

    render(
      <SignoffSection
        appraisalId="a-001"
        status="SIGNED_OFF"
        userRelation="APPRAISEE"
        signatures={signatures}
        onRefresh={mockOnRefresh}
      />,
    );

    const table = screen.getByRole("table", { name: "Signature records" });
    expect(within(table).getByText("Kwame Asante")).toBeInTheDocument();
    expect(within(table).getByText("Adjoa Mensah")).toBeInTheDocument();
    // Raw signer_role enum values are mapped to display labels per TASK-263.
    expect(within(table).getByText("Appraisor")).toBeInTheDocument();
    expect(within(table).getByText("Appraisee")).toBeInTheDocument();
    expect(within(table).queryByText("APPRAISER")).not.toBeInTheDocument();
    expect(within(table).queryByText("APPRAISEE")).not.toBeInTheDocument();
    expect(within(table).getByText("Accepted")).toBeInTheDocument();
    expect(within(table).getByText("Rejected")).toBeInTheDocument();
    expect(within(table).getByText(/Scores are inaccurate/)).toBeInTheDocument();
  });

  it("renders an unknown signer_role value verbatim via the ?? fallback", () => {
    const signatures = [
      makeSignature({
        id: "sig-unknown",
        signer_name: "Unknown Signer",
        // Cast through unknown to a future / unexpected enum value the
        // SIGNER_ROLE_LABELS map doesn't recognise — must render as-is.
        signer_role: "UNKNOWN_ROLE" as unknown as Signature["signer_role"],
      }),
    ];

    render(
      <SignoffSection
        appraisalId="a-001"
        status="SIGNED_OFF"
        userRelation="APPRAISEE"
        signatures={signatures}
        onRefresh={mockOnRefresh}
      />,
    );

    const table = screen.getByRole("table", { name: "Signature records" });
    expect(within(table).getByText("UNKNOWN_ROLE")).toBeInTheDocument();
  });

  it("shows empty state when no signatures exist", () => {
    render(
      <SignoffSection
        appraisalId="a-001"
        status="PENDING_SIGNOFF"
        userRelation="APPRAISEE"
        signatures={[]}
        onRefresh={mockOnRefresh}
      />,
    );

    expect(screen.getByText("No signatures recorded yet.")).toBeInTheDocument();
  });

  it("calls submitSignature with ACCEPT and then onRefresh on Accept click", async () => {
    const user = userEvent.setup();
    mockSubmitSignature.mockResolvedValueOnce(makeSuccessResponse("ACCEPT"));

    render(
      <SignoffSection
        appraisalId="a-001"
        status="PENDING_SIGNOFF"
        userRelation="APPRAISEE"
        signatures={[]}
        onRefresh={mockOnRefresh}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /accept appraisal sign-off/i }),
    );

    await waitFor(() => {
      expect(mockSubmitSignature).toHaveBeenCalledWith("a-001", "ACCEPT", undefined);
    });

    await waitFor(() => {
      expect(mockOnRefresh).toHaveBeenCalled();
    });
  });

  it("opens reject dialog on Reject click and blocks submit when reason is empty", async () => {
    const user = userEvent.setup();

    render(
      <SignoffSection
        appraisalId="a-001"
        status="PENDING_SIGNOFF"
        userRelation="APPRAISEE"
        signatures={[]}
        onRefresh={mockOnRefresh}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /reject appraisal sign-off/i }),
    );

    // Dialog appears
    expect(screen.getByText("Reject Appraisal")).toBeInTheDocument();

    // Confirm button is disabled when reason is empty
    const confirmBtn = screen.getByRole("button", { name: /confirm rejection/i });
    expect(confirmBtn).toBeDisabled();
  });

  it("submits reject with reason and calls onRefresh", async () => {
    const user = userEvent.setup();
    mockSubmitSignature.mockResolvedValueOnce(
      makeSuccessResponse("REJECT", "Scores are inaccurate"),
    );

    render(
      <SignoffSection
        appraisalId="a-001"
        status="PENDING_SIGNOFF"
        userRelation="APPRAISEE"
        signatures={[]}
        onRefresh={mockOnRefresh}
      />,
    );

    // Open reject dialog
    await user.click(
      screen.getByRole("button", { name: /reject appraisal sign-off/i }),
    );

    // Type reason
    const textarea = screen.getByLabelText(/rejection reason/i);
    await user.type(textarea, "Scores are inaccurate");

    // Confirm button is now enabled
    const confirmBtn = screen.getByRole("button", { name: /confirm rejection/i });
    expect(confirmBtn).toBeEnabled();

    await user.click(confirmBtn);

    await waitFor(() => {
      expect(mockSubmitSignature).toHaveBeenCalledWith(
        "a-001",
        "REJECT",
        "Scores are inaccurate",
      );
    });

    await waitFor(() => {
      expect(mockOnRefresh).toHaveBeenCalled();
    });
  });

  it("displays inline error on API failure for Accept", async () => {
    const user = userEvent.setup();
    const axiosError = {
      isAxiosError: true,
      response: {
        status: 403,
        data: { data: { message: "You are not authorised to sign this appraisal." } },
      },
    };
    mockSubmitSignature.mockRejectedValueOnce(axiosError);

    render(
      <SignoffSection
        appraisalId="a-001"
        status="PENDING_SIGNOFF"
        userRelation="APPRAISEE"
        signatures={[]}
        onRefresh={mockOnRefresh}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /accept appraisal sign-off/i }),
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    expect(
      screen.getByText("You are not authorised to sign this appraisal."),
    ).toBeInTheDocument();
    expect(mockOnRefresh).not.toHaveBeenCalled();
  });

  it("displays inline error in reject dialog on API failure", async () => {
    const user = userEvent.setup();
    const axiosError = {
      isAxiosError: true,
      response: {
        status: 400,
        data: { data: { message: "Appraisal is no longer in PENDING_SIGNOFF." } },
      },
    };
    mockSubmitSignature.mockRejectedValueOnce(axiosError);

    render(
      <SignoffSection
        appraisalId="a-001"
        status="PENDING_SIGNOFF"
        userRelation="APPRAISEE"
        signatures={[]}
        onRefresh={mockOnRefresh}
      />,
    );

    // Open reject dialog
    await user.click(
      screen.getByRole("button", { name: /reject appraisal sign-off/i }),
    );

    // Type reason and submit
    const textarea = screen.getByLabelText(/rejection reason/i);
    await user.type(textarea, "Not satisfied");
    await user.click(screen.getByRole("button", { name: /confirm rejection/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    expect(
      screen.getByText("Appraisal is no longer in PENDING_SIGNOFF."),
    ).toBeInTheDocument();
    expect(mockOnRefresh).not.toHaveBeenCalled();
  });

  it("does not render sign buttons for HR_ADMIN", () => {
    render(
      <SignoffSection
        appraisalId="a-001"
        status="PENDING_SIGNOFF"
        userRelation="HR_ADMIN"
        signatures={[]}
        onRefresh={mockOnRefresh}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /accept appraisal sign-off/i }),
    ).not.toBeInTheDocument();
  });

  it("shows Pending Signatures badge when status is PENDING_SIGNOFF", () => {
    render(
      <SignoffSection
        appraisalId="a-001"
        status="PENDING_SIGNOFF"
        userRelation="APPRAISEE"
        signatures={[]}
        onRefresh={mockOnRefresh}
      />,
    );

    expect(screen.getByText("Pending Signatures")).toBeInTheDocument();
    expect(screen.getByText(/Awaiting remaining signature/)).toBeInTheDocument();
  });
});
