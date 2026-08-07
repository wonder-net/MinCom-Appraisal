/**
 * Unit tests for AppraisalImportResultsPage — verifies loading skeleton,
 * processing spinner, completed summary counts, failed file rows,
 * and polling lifecycle.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { AppraisalImportResult } from "@/api/appraisals";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetResults = vi.fn<(id: string) => Promise<AppraisalImportResult>>();

vi.mock("@/api/appraisals", () => ({
  getAppraisalImportResults: (...args: unknown[]) =>
    mockGetResults(args[0] as string),
}));

vi.mock("@/utils/extract-api-error", () => ({
  extractApiError: (err: unknown) =>
    (err as { message?: string })?.message ?? "Something went wrong",
}));

// Lazy-import after mocks
const { AppraisalImportResultsPage } = await import(
  "../components/AppraisalImportResultsPage"
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(
  overrides: Partial<AppraisalImportResult> = {},
): AppraisalImportResult {
  return {
    id: "job-001",
    status: "COMPLETED",
    target_status: "FINALISED",
    total_files: 4,
    imported_count: 3,
    failed_count: 1,
    failed_files: [{ filename: "bad.xls", error: "No employee match" }],
    created_at: "2026-04-10T10:00:00Z",
    completed_at: "2026-04-10T10:01:00Z",
    ...overrides,
  };
}

function renderPage(importId = "job-001") {
  return render(
    <MemoryRouter
      initialEntries={[`/admin/appraisals/import/${importId}/results`]}
    >
      <Routes>
        <Route
          path="/admin/appraisals/import/:importId/results"
          element={<AppraisalImportResultsPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AppraisalImportResultsPage", () => {
  beforeEach(() => {
    mockGetResults.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows loading skeleton while fetching initial data", () => {
    // Never resolves — keeps component in loading state
    mockGetResults.mockReturnValue(new Promise(() => {}));
    renderPage();

    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("shows spinner and progress message while PROCESSING", async () => {
    mockGetResults.mockResolvedValue(
      makeResult({
        status: "PROCESSING",
        imported_count: 0,
        failed_count: 0,
        failed_files: [],
      }),
    );
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/import in progress/i)).toBeInTheDocument();
    });

    // Summary cards should NOT be visible while processing
    expect(screen.queryByText("Total Files")).not.toBeInTheDocument();
    // Success/failure detail should NOT be visible
    expect(screen.queryByText(/imported successfully/i)).not.toBeInTheDocument();
  });

  it("shows correct summary counts when COMPLETED with failures", async () => {
    mockGetResults.mockResolvedValue(
      makeResult({
        status: "COMPLETED",
        total_files: 4,
        imported_count: 3,
        failed_count: 1,
        failed_files: [{ filename: "bad.xls", error: "No employee match" }],
      }),
    );
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Total Files")).toBeInTheDocument();
    });

    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("bad.xls")).toBeInTheDocument();
    expect(screen.getByText("No employee match")).toBeInTheDocument();
  });

  it("shows success message when all files imported", async () => {
    mockGetResults.mockResolvedValue(
      makeResult({
        status: "COMPLETED",
        total_files: 5,
        imported_count: 5,
        failed_count: 0,
        failed_files: [],
      }),
    );
    renderPage();

    await waitFor(() => {
      expect(
        screen.getByText(/all 5 appraisals imported successfully/i),
      ).toBeInTheDocument();
    });
  });

  it("shows error message on API failure", async () => {
    mockGetResults.mockRejectedValue(new Error("Network error"));
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  it("polls every 3 seconds and stops on COMPLETED", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    let callCount = 0;
    mockGetResults.mockImplementation(() => {
      callCount++;
      if (callCount <= 2) {
        return Promise.resolve(
          makeResult({ status: "PROCESSING", imported_count: 0, failed_count: 0, failed_files: [] }),
        );
      }
      return Promise.resolve(
        makeResult({ status: "COMPLETED", total_files: 3, imported_count: 3, failed_count: 0, failed_files: [] }),
      );
    });

    renderPage();

    // Wait for initial fetch
    await waitFor(() => {
      expect(callCount).toBe(1);
    });

    // Advance 3s to trigger first poll
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    await waitFor(() => {
      expect(callCount).toBe(2);
    });

    // Advance 3s — this call returns COMPLETED, should stop polling
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    await waitFor(() => {
      expect(callCount).toBe(3);
    });

    // Advance 9 more seconds — no further calls since polling stopped
    await act(async () => {
      vi.advanceTimersByTime(9000);
    });
    expect(callCount).toBe(3);

    vi.useRealTimers();
  });

  it("stops polling on error", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    mockGetResults.mockRejectedValue(new Error("Server error"));
    renderPage();

    await waitFor(() => {
      expect(mockGetResults).toHaveBeenCalledTimes(1);
    });

    // Advance time — should not poll again after error
    await act(async () => {
      vi.advanceTimersByTime(9000);
    });
    expect(mockGetResults).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
