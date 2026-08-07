/**
 * Tests for AdminCycles page — verifies cycle listing, create dialog,
 * edit dialog, activate/close confirmations, and status-based action buttons.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AdminCycles } from "../pages/AdminCycles";
import type { AppraisalCycle } from "@/types";

/** Wrap render with MemoryRouter — the cycle dialogs embed react-router Links. */
const renderPage = () =>
  render(
    <MemoryRouter>
      <AdminCycles />
    </MemoryRouter>,
  );

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockListCycles = vi.fn<() => Promise<AppraisalCycle[]>>();
const mockCreateCycle = vi.fn<
  (data: Record<string, unknown>) => Promise<AppraisalCycle>
>();
const mockUpdateCycle = vi.fn<
  (id: string, data: Record<string, unknown>) => Promise<AppraisalCycle>
>();
const mockActivateCycle = vi.fn<(id: string) => Promise<AppraisalCycle>>();
const mockCloseCycle = vi.fn<(id: string) => Promise<AppraisalCycle>>();

vi.mock("@/api/appraisals", () => ({
  listCycles: () => mockListCycles(),
  createCycle: (...args: unknown[]) =>
    mockCreateCycle(args[0] as Record<string, unknown>),
  updateCycle: (...args: unknown[]) =>
    mockUpdateCycle(args[0] as string, args[1] as Record<string, unknown>),
  activateCycle: (...args: unknown[]) =>
    mockActivateCycle(args[0] as string),
  closeCycle: (...args: unknown[]) =>
    mockCloseCycle(args[0] as string),
}));

vi.mock("@/auth/useAuth", () => ({
  useAuth: () => ({
    user: {
      id: "u-admin",
      email: "admin@mincom.com",
      roles: ["HR_ADMIN"],
      is_mfa_enabled: true,
    },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCycle(overrides: Partial<AppraisalCycle> = {}): AppraisalCycle {
  return {
    id: "cyc-001",
    period_name: "2026 Annual",
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    status: "DRAFT",
    self_rating_enabled: true,
    is_active: true,
    created_by: null,
    config_snapshot: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AdminCycles", () => {
  it("renders the page heading", async () => {
    mockListCycles.mockResolvedValueOnce([]);
    renderPage();

    expect(
      screen.getByRole("heading", { name: "Cycle Management" }),
    ).toBeInTheDocument();
  });

  it("calls listCycles on mount and renders cycle rows", async () => {
    const cycles = [
      makeCycle({ id: "cyc-001", period_name: "2026 Annual", status: "ACTIVE" }),
      makeCycle({ id: "cyc-002", period_name: "2025 Annual", status: "CLOSED" }),
    ];
    mockListCycles.mockResolvedValueOnce(cycles);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("2026 Annual")).toBeInTheDocument();
    });

    expect(screen.getByText("2025 Annual")).toBeInTheDocument();
    expect(mockListCycles).toHaveBeenCalledTimes(1);
  });

  it("shows empty state when no cycles exist", async () => {
    mockListCycles.mockResolvedValueOnce([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("No cycles found")).toBeInTheDocument();
    });

    expect(
      screen.getByText("Create the first appraisal cycle to get started."),
    ).toBeInTheDocument();
  });

  it("shows error state with retry button when listCycles fails", async () => {
    const user = userEvent.setup();
    mockListCycles.mockRejectedValueOnce(new Error("Network error"));

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByText("Failed to load cycles. Please try again."),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", { name: "Retry" }),
    ).toBeInTheDocument();

    // Retry should call listCycles again
    mockListCycles.mockResolvedValueOnce([]);
    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(mockListCycles).toHaveBeenCalledTimes(2);
    });
  });

  it("opens New Cycle dialog when button is clicked", async () => {
    const user = userEvent.setup();
    mockListCycles.mockResolvedValueOnce([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("No cycles found")).toBeInTheDocument();
    });

    // Click the header "New Cycle" button
    const newButtons = screen.getAllByText("+ New Cycle");
    await user.click(newButtons[0]);

    await waitFor(() => {
      expect(
        screen.getByText("New Appraisal Cycle"),
      ).toBeInTheDocument();
    });
  });

  it("validates required fields in create dialog before submission", async () => {
    const user = userEvent.setup();
    mockListCycles.mockResolvedValueOnce([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("No cycles found")).toBeInTheDocument();
    });

    const newButtons = screen.getAllByText("+ New Cycle");
    await user.click(newButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("New Appraisal Cycle")).toBeInTheDocument();
    });

    // Submit with empty fields
    await user.click(screen.getByRole("button", { name: "Create Cycle" }));

    await waitFor(() => {
      expect(screen.getByText("Period name is required")).toBeInTheDocument();
    });

    expect(screen.getByText("Start date is required")).toBeInTheDocument();
    expect(screen.getByText("End date is required")).toBeInTheDocument();
    expect(mockCreateCycle).not.toHaveBeenCalled();
  });

  it("submits create form with valid data and calls createCycle", async () => {
    const user = userEvent.setup();
    mockListCycles.mockResolvedValueOnce([]);

    const newCycle = makeCycle({ id: "cyc-new", period_name: "2026 Mid-Year" });
    mockCreateCycle.mockResolvedValueOnce(newCycle);
    mockListCycles.mockResolvedValueOnce([newCycle]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("No cycles found")).toBeInTheDocument();
    });

    const newButtons = screen.getAllByText("+ New Cycle");
    await user.click(newButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("New Appraisal Cycle")).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/period name/i), "2026 Mid-Year");

    // Fill dates
    await user.type(screen.getByLabelText(/start date/i), "2026-06-01");
    await user.type(screen.getByLabelText(/end date/i), "2026-08-31");

    await user.click(screen.getByRole("button", { name: "Create Cycle" }));

    await waitFor(() => {
      expect(mockCreateCycle).toHaveBeenCalledWith({
        period_name: "2026 Mid-Year",
        start_date: "2026-06-01",
        end_date: "2026-08-31",
        self_rating_enabled: true,
      });
    });
  });

  it("shows DRAFT rows with Activate button and ACTIVE rows with Close button", async () => {
    const cycles = [
      makeCycle({ id: "cyc-draft", period_name: "Draft Cycle", status: "DRAFT" }),
      makeCycle({ id: "cyc-active", period_name: "Active Cycle", status: "ACTIVE" }),
      makeCycle({ id: "cyc-closed", period_name: "Closed Cycle", status: "CLOSED" }),
    ];
    mockListCycles.mockResolvedValueOnce(cycles);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Draft Cycle")).toBeInTheDocument();
    });

    // DRAFT row has Activate button
    expect(
      screen.getByRole("button", { name: "Activate Draft Cycle" }),
    ).toBeInTheDocument();

    // ACTIVE row has Close button
    expect(
      screen.getByRole("button", { name: "Close Active Cycle" }),
    ).toBeInTheDocument();

    // CLOSED row has neither Activate nor Close
    expect(
      screen.queryByRole("button", { name: "Activate Closed Cycle" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Close Closed Cycle" }),
    ).not.toBeInTheDocument();

    // DRAFT has Edit, ACTIVE and CLOSED have View
    expect(
      screen.getByRole("button", { name: "Edit Draft Cycle" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "View Active Cycle" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "View Closed Cycle" }),
    ).toBeInTheDocument();
  });

  it("opens Activate confirmation dialog and calls activateCycle on confirm", async () => {
    const user = userEvent.setup();
    const draftCycle = makeCycle({
      id: "cyc-draft",
      period_name: "Draft Cycle",
      status: "DRAFT",
    });
    mockListCycles.mockResolvedValueOnce([draftCycle]);

    const activatedCycle = { ...draftCycle, status: "ACTIVE" as const };
    mockActivateCycle.mockResolvedValueOnce(activatedCycle);
    mockListCycles.mockResolvedValueOnce([activatedCycle]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Draft Cycle")).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", { name: "Activate Draft Cycle" }),
    );

    await waitFor(() => {
      expect(screen.getByText("Activate Cycle")).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        /Activating this cycle will create appraisals for all active employees/,
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Activate" }));

    await waitFor(() => {
      expect(mockActivateCycle).toHaveBeenCalledWith("cyc-draft");
    });

    await waitFor(() => {
      expect(mockListCycles).toHaveBeenCalledTimes(2);
    });
  });

  it("opens Close confirmation dialog and cancels without calling closeCycle", async () => {
    const user = userEvent.setup();
    const activeCycle = makeCycle({
      id: "cyc-active",
      period_name: "Active Cycle",
      status: "ACTIVE",
    });
    mockListCycles.mockResolvedValueOnce([activeCycle]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Active Cycle")).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", { name: "Close Active Cycle" }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Close Cycle" }),
      ).toBeInTheDocument();
    });

    // Cancel
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "Close Cycle" }),
      ).not.toBeInTheDocument();
    });

    expect(mockCloseCycle).not.toHaveBeenCalled();
  });

  it("opens edit dialog with pre-filled values for a DRAFT cycle", async () => {
    const user = userEvent.setup();
    const cycle = makeCycle({
      id: "cyc-001",
      period_name: "2026 Annual",
      start_date: "2026-01-01",
      end_date: "2026-12-31",
      status: "DRAFT",
    });
    mockListCycles.mockResolvedValueOnce([cycle]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("2026 Annual")).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", { name: "Edit 2026 Annual" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("Edit Appraisal Cycle"),
      ).toBeInTheDocument();
    });

    const nameInput = screen.getByLabelText(/period name/i);
    expect(nameInput).toHaveValue("2026 Annual");
  });

  it("shows info banner and hides submit for CLOSED cycles in view dialog", async () => {
    const user = userEvent.setup();
    const closedCycle = makeCycle({
      id: "cyc-closed",
      period_name: "2025 Annual",
      status: "CLOSED",
    });
    mockListCycles.mockResolvedValueOnce([closedCycle]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("2025 Annual")).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", { name: "View 2025 Annual" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("View Appraisal Cycle"),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByText(/only draft cycles can be edited/i),
    ).toBeInTheDocument();

    // Submit button should not be present
    expect(
      screen.queryByRole("button", { name: "Save Changes" }),
    ).not.toBeInTheDocument();

    // Inputs should be disabled
    const nameInput = screen.getByLabelText(/period name/i);
    expect(nameInput).toBeDisabled();
  });
});
