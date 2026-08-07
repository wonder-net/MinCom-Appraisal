/**
 * Tests for DepartmentDrillDown — verifies null rendering, populated state,
 * loading state, error with retry, close button, and re-fetch on deptId change.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DepartmentDrillDown } from "../components/DepartmentDrillDown";
import type { DepartmentReport } from "@/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetDepartmentReport = vi.fn<
  (deptId: string) => Promise<DepartmentReport>
>();

vi.mock("@/api/reports", () => ({
  getDepartmentReport: (...args: unknown[]) =>
    mockGetDepartmentReport(args[0] as string),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDepartmentResponse(
  overrides: Partial<DepartmentReport> = {},
): DepartmentReport {
  return {
    department_id: "dept-1",
    department_name: "Retail Banking",
    employee_count: 48,
    appraisals_by_status: {
      SELF_ASSESSMENT: 15,
      MANAGER_REVIEW: 15,
      SIGNED_OFF: 12,
      FINALISED: 6,
    },
    avg_total_score: 3.85,
    completion_rate: 72.9,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DepartmentDrillDown", () => {
  it("renders null when deptId is null — no API call made", () => {
    const onClose = vi.fn();
    const { container } = render(
      <DepartmentDrillDown deptId={null} onClose={onClose} />,
    );

    expect(container.innerHTML).toBe("");
    expect(mockGetDepartmentReport).not.toHaveBeenCalled();
  });

  it("fetches and renders department stats when deptId is set", async () => {
    mockGetDepartmentReport.mockResolvedValueOnce(
      makeDepartmentResponse(),
    );
    const onClose = vi.fn();

    render(
      <DepartmentDrillDown deptId="dept-1" onClose={onClose} />,
    );

    // Wait for data to load
    await waitFor(() => {
      expect(
        screen.getByText("Retail Banking"),
      ).toBeInTheDocument();
    });

    // Verify API was called with correct ID
    expect(mockGetDepartmentReport).toHaveBeenCalledWith("dept-1");

    // Verify metrics
    expect(screen.getByText("48")).toBeInTheDocument();
    expect(screen.getByText("72.9%")).toBeInTheDocument();
    expect(screen.getByText("3.85")).toBeInTheDocument();

    // Verify status breakdown table is rendered
    expect(
      screen.getByLabelText("Department status breakdown"),
    ).toBeInTheDocument();
    expect(screen.getByText("Self Assessment")).toBeInTheDocument();
    expect(screen.getByText("Signed Off")).toBeInTheDocument();
  });

  it("displays avg_total_score as em-dash when backend returns null", async () => {
    mockGetDepartmentReport.mockResolvedValueOnce(
      makeDepartmentResponse({ avg_total_score: null }),
    );
    const onClose = vi.fn();

    render(
      <DepartmentDrillDown deptId="dept-1" onClose={onClose} />,
    );

    await waitFor(() => {
      expect(screen.getByText("\u2014")).toBeInTheDocument();
    });
  });

  it("shows loading skeleton while fetching department data", () => {
    // Never resolves — stays loading
    mockGetDepartmentReport.mockReturnValue(new Promise(() => {}));
    const onClose = vi.fn();

    render(
      <DepartmentDrillDown deptId="dept-1" onClose={onClose} />,
    );

    expect(
      screen.getByLabelText("Loading department data"),
    ).toBeInTheDocument();
  });

  it("shows error message with retry button when API call fails", async () => {
    mockGetDepartmentReport.mockRejectedValueOnce(
      new Error("Server error"),
    );
    const onClose = vi.fn();

    render(
      <DepartmentDrillDown deptId="dept-1" onClose={onClose} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });

    // Retry button is present
    const retryButton = screen.getByRole("button", { name: /retry/i });
    expect(retryButton).toBeInTheDocument();

    // Click retry and verify it re-fetches
    mockGetDepartmentReport.mockResolvedValueOnce(
      makeDepartmentResponse(),
    );
    const user = userEvent.setup();
    await user.click(retryButton);

    await waitFor(() => {
      expect(
        screen.getByText("Retail Banking"),
      ).toBeInTheDocument();
    });

    expect(mockGetDepartmentReport).toHaveBeenCalledTimes(2);
  });

  it("calls onClose when close button is clicked", async () => {
    mockGetDepartmentReport.mockResolvedValueOnce(
      makeDepartmentResponse(),
    );
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      <DepartmentDrillDown deptId="dept-1" onClose={onClose} />,
    );

    await waitFor(() => {
      expect(
        screen.getByText("Retail Banking"),
      ).toBeInTheDocument();
    });

    const closeButton = screen.getByRole("button", {
      name: "Close department panel",
    });
    await user.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("re-fetches when deptId changes to a different department", async () => {
    mockGetDepartmentReport.mockResolvedValueOnce(
      makeDepartmentResponse(),
    );
    const onClose = vi.fn();

    const { rerender } = render(
      <DepartmentDrillDown deptId="dept-1" onClose={onClose} />,
    );

    await waitFor(() => {
      expect(
        screen.getByText("Retail Banking"),
      ).toBeInTheDocument();
    });

    expect(mockGetDepartmentReport).toHaveBeenCalledWith("dept-1");

    // Change to a different department
    mockGetDepartmentReport.mockResolvedValueOnce(
      makeDepartmentResponse({
        department_id: "dept-2",
        department_name: "Corporate Banking",
        employee_count: 31,
        completion_rate: 61.3,
        avg_total_score: 3.42,
      }),
    );

    rerender(
      <DepartmentDrillDown deptId="dept-2" onClose={onClose} />,
    );

    await waitFor(() => {
      expect(
        screen.getByText("Corporate Banking"),
      ).toBeInTheDocument();
    });

    expect(mockGetDepartmentReport).toHaveBeenCalledWith("dept-2");
    expect(mockGetDepartmentReport).toHaveBeenCalledTimes(2);
  });
});
