/**
 * Regression tests for AppraisalListPage search and filter propagation.
 *
 * Uses API-level mocking with fake timers to verify that debounced search
 * terms and cycle filter selections reach the listAppraisals API call
 * (see UAT-005 / TASK-216).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { PaginatedResponse, Appraisal, AppraisalCycle } from "@/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/api/appraisals", () => ({
  listAppraisals: vi.fn(),
  bulkFinalise: vi.fn(),
  listCycles: vi.fn(),
  appraisalBulkImportValidate: vi.fn(),
  appraisalBulkImportConfirm: vi.fn(),
  getAppraisalImportResults: vi.fn(),
}));

vi.mock("@/auth/useAuth", () => ({
  useAuth: () => ({
    user: {
      id: "u-001",
      email: "test@mincom.com",
      roles: ["HR_ADMIN"],
      is_mfa_enabled: false,
    },
    isAuthenticated: true,
    isLoading: false,
    accessToken: "fake-token",
    login: vi.fn(),
    verifyMFA: vi.fn(),
    logout: vi.fn(),
  }),
}));

import { listAppraisals, listCycles } from "@/api/appraisals";
import { AppraisalListPage } from "../pages/AppraisalListPage";

const mockListAppraisals = vi.mocked(listAppraisals);
const mockListCycles = vi.mocked(listCycles);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage() {
  return render(
    <MemoryRouter>
      <AppraisalListPage />
    </MemoryRouter>,
  );
}

function emptyResponse(): PaginatedResponse<Appraisal[]> {
  return {
    data: [],
    meta: { pagination: { count: 0, next: null, previous: null } },
  };
}

function makeCycle(overrides: Partial<AppraisalCycle> = {}): AppraisalCycle {
  return {
    id: "c-001",
    period_name: "2026 Annual",
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    status: "ACTIVE",
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
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.clearAllMocks();
  mockListCycles.mockResolvedValue([makeCycle()]);
  mockListAppraisals.mockResolvedValue(emptyResponse());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AppraisalListPage — search and filter propagation", () => {
  it("typing 'alice' in the search input calls listAppraisals with { search: 'alice' } after debounce", async () => {
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime,
    });

    renderPage();

    // Flush the initial debounce so the first fetch fires
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // Wait for the initial fetch to resolve
    await waitFor(() => {
      expect(mockListAppraisals).toHaveBeenCalledTimes(1);
    });

    // Clear mock calls to isolate the search-triggered call
    mockListAppraisals.mockClear();

    // Type into the search input
    const searchInput = screen.getByRole("textbox", {
      name: /search appraisals/i,
    });
    await user.type(searchInput, "alice");

    // Advance past the 300ms debounce
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // listAppraisals should have been called with search param
    await waitFor(() => {
      expect(mockListAppraisals).toHaveBeenCalledWith(
        expect.objectContaining({ search: "alice" }),
      );
    });
  });

  it("selecting a cycle calls listAppraisals with { cycle_id: '<id>' }", async () => {
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime,
    });

    renderPage();

    // Flush the initial debounce so the first fetch fires
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // Wait for the initial fetch to resolve
    await waitFor(() => {
      expect(mockListAppraisals).toHaveBeenCalledTimes(1);
    });

    // Clear mock calls to isolate the cycle-triggered call
    mockListAppraisals.mockClear();

    // Select a cycle from the dropdown
    const cycleSelect = screen.getByRole("combobox", {
      name: /filter by cycle/i,
    });
    await user.selectOptions(cycleSelect, "c-001");

    // Advance past the debounce (cycle change resets page but debounce still applies)
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // listAppraisals should have been called with cycle_id param
    await waitFor(() => {
      expect(mockListAppraisals).toHaveBeenCalledWith(
        expect.objectContaining({ cycle_id: "c-001" }),
      );
    });
  });
});
