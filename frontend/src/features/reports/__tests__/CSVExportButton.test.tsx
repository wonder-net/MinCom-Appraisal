/**
 * Unit tests for CSVExportButton — verifies role gating, loading state,
 * download triggering, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CSVExportButton } from "../components/CSVExportButton";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDownloadAppraisalsCSV = vi.fn<(cycleId?: string) => Promise<void>>();

vi.mock("@/api/reports", () => ({
  downloadAppraisalsCSV: (cycleId?: string) =>
    mockDownloadAppraisalsCSV(cycleId),
}));

const mockUseAuth = vi.fn(() => ({
  user: {
    id: "u-admin",
    email: "admin@mincom.com",
    roles: ["HR_ADMIN"] as string[],
    is_mfa_enabled: true,
    employee_id: "e-1",
  },
  isAuthenticated: true,
  isLoading: false,
  accessToken: "tok",
  login: vi.fn(),
  verifyMFA: vi.fn(),
  logout: vi.fn(),
  updateUser: vi.fn(),
  refreshSession: vi.fn(),
}));

vi.mock("@/auth/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function mockHRAdminAuth() {
  return {
    user: {
      id: "u-admin",
      email: "admin@mincom.com",
      roles: ["HR_ADMIN"] as string[],
      is_mfa_enabled: true,
      employee_id: "e-1",
    },
    isAuthenticated: true,
    isLoading: false,
    accessToken: "tok",
    login: vi.fn(),
    verifyMFA: vi.fn(),
    logout: vi.fn(),
    updateUser: vi.fn(),
    refreshSession: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDownloadAppraisalsCSV.mockResolvedValue(undefined);
  mockUseAuth.mockReturnValue(mockHRAdminAuth());
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CSVExportButton", () => {
  it("does not render when user role is not HR_ADMIN", () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: "u-mgr",
        email: "manager@mincom.com",
        roles: ["MANAGER"],
        is_mfa_enabled: false,
        employee_id: "e-2",
      },
      isAuthenticated: true,
      isLoading: false,
      accessToken: "tok",
      login: vi.fn(),
      verifyMFA: vi.fn(),
      logout: vi.fn(),
      updateUser: vi.fn(),
      refreshSession: vi.fn(),
    });

    const { container } = render(<CSVExportButton cycleId="cycle-1" />);
    expect(container.innerHTML).toBe("");
  });

  it("does not render when user is EMPLOYEE", () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: "u-emp",
        email: "employee@mincom.com",
        roles: ["EMPLOYEE"],
        is_mfa_enabled: false,
        employee_id: "e-3",
      },
      isAuthenticated: true,
      isLoading: false,
      accessToken: "tok",
      login: vi.fn(),
      verifyMFA: vi.fn(),
      logout: vi.fn(),
      updateUser: vi.fn(),
      refreshSession: vi.fn(),
    });

    const { container } = render(<CSVExportButton />);
    expect(container.innerHTML).toBe("");
  });

  it("renders correctly for HR_ADMIN user", () => {
    render(<CSVExportButton cycleId="cycle-1" />);

    const button = screen.getByRole("button", {
      name: "Export appraisals as CSV",
    });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
    expect(screen.getByText("Export CSV")).toBeInTheDocument();
  });

  it("button is disabled and shows spinner during export", async () => {
    const user = userEvent.setup();

    // Make download hang so we can observe intermediate state
    let resolveDownload: () => void = () => {};
    mockDownloadAppraisalsCSV.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveDownload = resolve;
      }),
    );

    render(<CSVExportButton cycleId="cycle-1" />);

    const button = screen.getByRole("button", {
      name: "Export appraisals as CSV",
    });
    await user.click(button);

    // Button should now be disabled with "Exporting..." text
    expect(button).toBeDisabled();
    expect(screen.getByText("Exporting...")).toBeInTheDocument();

    // Resolve the download
    resolveDownload();
    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });
    expect(screen.getByText("Export CSV")).toBeInTheDocument();
  });

  it("calls downloadAppraisalsCSV with the cycleId prop on click", async () => {
    const user = userEvent.setup();

    render(<CSVExportButton cycleId="cycle-abc" />);

    const button = screen.getByRole("button", {
      name: "Export appraisals as CSV",
    });
    await user.click(button);

    await waitFor(() => {
      expect(mockDownloadAppraisalsCSV).toHaveBeenCalledWith("cycle-abc");
    });
    expect(mockDownloadAppraisalsCSV).toHaveBeenCalledTimes(1);
  });

  it("calls downloadAppraisalsCSV with undefined when cycleId is not provided", async () => {
    const user = userEvent.setup();

    render(<CSVExportButton />);

    const button = screen.getByRole("button", {
      name: "Export appraisals as CSV",
    });
    await user.click(button);

    await waitFor(() => {
      expect(mockDownloadAppraisalsCSV).toHaveBeenCalledWith(undefined);
    });
  });

  it("shows error alert when downloadAppraisalsCSV rejects", async () => {
    const user = userEvent.setup();
    mockDownloadAppraisalsCSV.mockRejectedValueOnce(
      new Error("Network error"),
    );

    render(<CSVExportButton cycleId="cycle-1" />);

    const button = screen.getByRole("button", {
      name: "Export appraisals as CSV",
    });
    await user.click(button);

    await waitFor(() => {
      expect(
        screen.getByText(
          "Failed to export CSV. Please try again or contact support.",
        ),
      ).toBeInTheDocument();
    });

    // Button should be re-enabled after error
    expect(button).not.toBeDisabled();
  });

  it("clears previous error when retrying export", async () => {
    const user = userEvent.setup();
    mockDownloadAppraisalsCSV.mockRejectedValueOnce(
      new Error("Network error"),
    );

    render(<CSVExportButton cycleId="cycle-1" />);

    const button = screen.getByRole("button", {
      name: "Export appraisals as CSV",
    });

    // First click — triggers error
    await user.click(button);
    await waitFor(() => {
      expect(
        screen.getByText(
          "Failed to export CSV. Please try again or contact support.",
        ),
      ).toBeInTheDocument();
    });

    // Second click — should clear the error
    mockDownloadAppraisalsCSV.mockResolvedValueOnce(undefined);
    await user.click(button);
    await waitFor(() => {
      expect(
        screen.queryByText(
          "Failed to export CSV. Please try again or contact support.",
        ),
      ).not.toBeInTheDocument();
    });
  });
});
