/**
 * Tests for AccountSettings page — verifies page rendering,
 * Change Password form validation and submission, and MFA section
 * status display and actions.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountSettings } from "../pages/AccountSettings";
import type { MfaStatusResponse, RegenerateRecoveryCodesResponse } from "@/api/auth-api";
import type { ApiResponse } from "@/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockChangePasswordApi = vi.fn<
  (old: string, newPwd: string, confirm: string, token: string) => Promise<void>
>();

const mockGetMfaStatus = vi.fn<() => Promise<MfaStatusResponse>>();

const mockDisableMfaApi = vi.fn<
  (password: string, token: string) => Promise<void>
>();

const mockRegenerateRecoveryCodesApi = vi.fn<
  (token: string) => Promise<ApiResponse<RegenerateRecoveryCodesResponse>>
>();

const mockMfaSetupApi = vi.fn();
const mockMfaSetupConfirmApi = vi.fn();

vi.mock("@/api", () => ({
  changePasswordApi: (...args: unknown[]) =>
    mockChangePasswordApi(
      args[0] as string,
      args[1] as string,
      args[2] as string,
      args[3] as string,
    ),
  getMfaStatus: () => mockGetMfaStatus(),
  disableMfaApi: (...args: unknown[]) =>
    mockDisableMfaApi(args[0] as string, args[1] as string),
  regenerateRecoveryCodesApi: (...args: unknown[]) =>
    mockRegenerateRecoveryCodesApi(args[0] as string),
  mfaSetupApi: (...args: unknown[]) => mockMfaSetupApi(args[0] as string),
  mfaSetupConfirmApi: (...args: unknown[]) =>
    mockMfaSetupConfirmApi(args[0] as string, args[1] as string),
}));

vi.mock("@/auth/useAuth", () => ({
  useAuth: () => ({
    user: {
      id: "u-001",
      email: "test@mincom.com",
      roles: ["EMPLOYEE"],
      is_mfa_enabled: false,
    },
    isAuthenticated: true,
    isLoading: false,
    accessToken: "test-access-token",
  }),
}));

vi.mock("@/auth/auth-utils", () => ({
  extractErrorMessage: (err: unknown) => {
    if (
      typeof err === "object" &&
      err !== null &&
      "message" in err
    ) {
      return (err as { message: string }).message;
    }
    return "An unexpected error occurred. Please try again.";
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockWriteText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetMfaStatus.mockResolvedValue({
    is_mfa_enabled: false,
    recovery_codes_remaining: 0,
  });
  mockWriteText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: mockWriteText },
    writable: true,
    configurable: true,
  });
});

// ---------------------------------------------------------------------------
// TASK-114: Page scaffold tests
// ---------------------------------------------------------------------------

describe("AccountSettings — page scaffold", () => {
  it("renders the page title 'Account Settings'", async () => {
    render(<AccountSettings />);
    expect(
      screen.getByRole("heading", { name: /Account Settings/i }),
    ).toBeInTheDocument();
  });

  it("renders a card with header 'Change Password'", async () => {
    render(<AccountSettings />);
    expect(
      screen.getByRole("heading", { name: /Change Password/i }),
    ).toBeInTheDocument();
  });

  it("renders a card with header 'Two-Factor Authentication (MFA)'", async () => {
    render(<AccountSettings />);
    expect(
      screen.getByRole("heading", {
        name: /Two-Factor Authentication \(MFA\)/i,
      }),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// TASK-115: Change Password form tests
// ---------------------------------------------------------------------------

describe("ChangePasswordForm — validation", () => {
  it("shows required errors when submitting empty fields", async () => {
    const user = userEvent.setup();
    render(<AccountSettings />);

    const submitBtn = screen.getByRole("button", { name: /Update Password/i });
    await user.click(submitBtn);

    expect(
      screen.getByText("Current password is required."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("New password is required."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Please confirm your new password."),
    ).toBeInTheDocument();
    expect(mockChangePasswordApi).not.toHaveBeenCalled();
  });

  it("shows min-length error for new password fewer than 8 chars", async () => {
    const user = userEvent.setup();
    render(<AccountSettings />);

    await user.type(screen.getByLabelText(/Current Password/), "oldpassword");
    await user.type(screen.getByLabelText(/^New Password/), "short");
    await user.type(screen.getByLabelText(/Confirm New Password/), "short");

    await user.click(
      screen.getByRole("button", { name: /Update Password/i }),
    );

    expect(
      screen.getByText("Password must be at least 8 characters."),
    ).toBeInTheDocument();
    expect(mockChangePasswordApi).not.toHaveBeenCalled();
  });

  it("shows mismatch error when passwords do not match", async () => {
    const user = userEvent.setup();
    render(<AccountSettings />);

    await user.type(screen.getByLabelText(/Current Password/), "oldpassword");
    await user.type(
      screen.getByLabelText(/^New Password/),
      "newpassword12345",
    );
    await user.type(
      screen.getByLabelText(/Confirm New Password/),
      "different12345xx",
    );

    await user.click(
      screen.getByRole("button", { name: /Update Password/i }),
    );

    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
    expect(mockChangePasswordApi).not.toHaveBeenCalled();
  });
});

describe("ChangePasswordForm — submission", () => {
  it("calls changePasswordApi on valid submit and shows success", async () => {
    mockChangePasswordApi.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<AccountSettings />);

    await user.type(screen.getByLabelText(/Current Password/), "oldpassword");
    await user.type(
      screen.getByLabelText(/^New Password/),
      "newpassword12345",
    );
    await user.type(
      screen.getByLabelText(/Confirm New Password/),
      "newpassword12345",
    );

    await user.click(
      screen.getByRole("button", { name: /Update Password/i }),
    );

    await waitFor(() => {
      expect(mockChangePasswordApi).toHaveBeenCalledWith(
        "oldpassword",
        "newpassword12345",
        "newpassword12345",
        "test-access-token",
      );
    });

    expect(
      screen.getByText("Password changed successfully."),
    ).toBeInTheDocument();

    // Form fields should be cleared
    const currentPwd = screen.getByLabelText(/Current Password/) as HTMLInputElement;
    expect(currentPwd.value).toBe("");
  });

  it("shows inline error when API returns an error", async () => {
    mockChangePasswordApi.mockRejectedValueOnce(
      new Error("Incorrect current password."),
    );
    const user = userEvent.setup();
    render(<AccountSettings />);

    await user.type(screen.getByLabelText(/Current Password/), "wrongpassword");
    await user.type(
      screen.getByLabelText(/^New Password/),
      "newpassword12345",
    );
    await user.type(
      screen.getByLabelText(/Confirm New Password/),
      "newpassword12345",
    );

    await user.click(
      screen.getByRole("button", { name: /Update Password/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("Incorrect current password."),
      ).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// TASK-241: Password strength indicator integration tests
// ---------------------------------------------------------------------------

describe("ChangePasswordForm — password strength indicator", () => {
  it("does not show the indicator before typing", () => {
    render(<AccountSettings />);

    expect(
      screen.queryByRole("list", { name: /password requirements/i }),
    ).not.toBeInTheDocument();
  });

  it("shows 'At least 8 characters' as unmet when typing a short password", async () => {
    const user = userEvent.setup();
    render(<AccountSettings />);

    await user.type(screen.getByLabelText(/^New Password/), "abc");

    expect(screen.getByText("At least 8 characters")).toBeInTheDocument();
    // The sr-only text should indicate not met
    const minLengthItem = screen.getByText("At least 8 characters").closest("li");
    expect(minLengthItem?.textContent).toContain("not met");
    expect(minLengthItem).toHaveClass("text-gray-500");
  });

  it("shows both requirements as met for a valid password", async () => {
    const user = userEvent.setup();
    render(<AccountSettings />);

    await user.type(screen.getByLabelText(/^New Password/), "ValidPass1234!");

    const minLengthItem = screen.getByText("At least 8 characters").closest("li");
    const notNumericItem = screen.getByText("Not entirely numeric").closest("li");
    const specialCharItem = screen.getByText("At least one special character (e.g., ! @ # $ %)").closest("li");

    expect(minLengthItem).toHaveClass("text-green-700");
    expect(notNumericItem).toHaveClass("text-green-700");
    expect(specialCharItem).toHaveClass("text-green-700");
  });
});

// ---------------------------------------------------------------------------
// TASK-116: MFA section tests
// ---------------------------------------------------------------------------

describe("MFASection — status display", () => {
  it("shows 'Set Up MFA' button when MFA is disabled", async () => {
    mockGetMfaStatus.mockResolvedValueOnce({
      is_mfa_enabled: false,
      recovery_codes_remaining: 0,
    });

    render(<AccountSettings />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Set Up MFA/i }),
      ).toBeInTheDocument();
    });

    expect(
      screen.queryByRole("button", { name: /Disable Two-Factor/i }),
    ).not.toBeInTheDocument();
  });

  it("shows 'Disable' and 'Regenerate' buttons when MFA is enabled", async () => {
    mockGetMfaStatus.mockResolvedValueOnce({
      is_mfa_enabled: true,
      recovery_codes_remaining: 5,
    });

    render(<AccountSettings />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: /Disable Two-Factor Authentication/i,
        }),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", { name: /Regenerate Backup Codes/i }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: /Set Up MFA/i }),
    ).not.toBeInTheDocument();
  });
});

describe("MFASection — setup flow", () => {
  it("opens setup dialog and shows QR code when 'Set Up MFA' is clicked", async () => {
    mockGetMfaStatus.mockResolvedValueOnce({
      is_mfa_enabled: false,
      recovery_codes_remaining: 0,
    });
    mockMfaSetupApi.mockResolvedValueOnce({
      data: {
        provisioning_uri: "https://example.com/qr.png",
        secret: "ABCDEFGHIJ",
      },
    });

    const user = userEvent.setup();
    render(<AccountSettings />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Set Up MFA/i }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Set Up MFA/i }));

    await waitFor(() => {
      expect(screen.getByLabelText("MFA QR code")).toBeInTheDocument();
    });
  });
});

describe("MFASection — disable flow", () => {
  it("opens disable dialog, submits password, and refetches status", async () => {
    mockGetMfaStatus
      .mockResolvedValueOnce({ is_mfa_enabled: true, recovery_codes_remaining: 5 })
      .mockResolvedValueOnce({ is_mfa_enabled: false, recovery_codes_remaining: 0 });
    mockDisableMfaApi.mockResolvedValueOnce(undefined);

    const user = userEvent.setup();
    render(<AccountSettings />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: /Disable Two-Factor Authentication/i,
        }),
      ).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", {
        name: /Disable Two-Factor Authentication/i,
      }),
    );

    // Dialog should appear
    await waitFor(() => {
      expect(
        screen.getByLabelText(/^Password/),
      ).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/^Password/), "mypassword");
    await user.click(screen.getByRole("button", { name: /Disable MFA/i }));

    await waitFor(() => {
      expect(mockDisableMfaApi).toHaveBeenCalledWith(
        "mypassword",
        "test-access-token",
      );
    });

    // Status should be refetched — now shows disabled state
    await waitFor(() => {
      expect(mockGetMfaStatus).toHaveBeenCalledTimes(2);
    });
  });
});

describe("MFASection — regenerate recovery codes", () => {
  it("regenerates codes and displays them with copy button", async () => {
    mockGetMfaStatus.mockResolvedValueOnce({
      is_mfa_enabled: true,
      recovery_codes_remaining: 5,
    });
    mockRegenerateRecoveryCodesApi.mockResolvedValueOnce({
      status: "success",
      data: {
        recovery_codes: ["code-1111", "code-2222", "code-3333", "code-4444"],
      },
    });

    const user = userEvent.setup();
    render(<AccountSettings />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Regenerate Backup Codes/i }),
      ).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", { name: /Regenerate Backup Codes/i }),
    );

    await waitFor(() => {
      expect(screen.getByText("code-1111")).toBeInTheDocument();
      expect(screen.getByText("code-2222")).toBeInTheDocument();
      expect(screen.getByText("code-3333")).toBeInTheDocument();
      expect(screen.getByText("code-4444")).toBeInTheDocument();
    });

    // Click "Copy all" — uses navigator.clipboard.writeText
    const copyBtn = screen.getByRole("button", { name: /Copy all/i });
    await user.click(copyBtn);

    // After successful copy, button text changes to "Copied"
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Codes copied/i }),
      ).toBeInTheDocument();
    });
  });
});
