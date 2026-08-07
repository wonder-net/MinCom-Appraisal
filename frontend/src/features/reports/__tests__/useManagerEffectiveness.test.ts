/**
 * Tests for useManagerEffectiveness hook — verifies guard behaviour
 * when cycleId is undefined, and correct API invocation when defined.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useManagerEffectiveness } from "../hooks/useManagerEffectiveness";
import type { ManagerEffectivenessReport } from "@/api/reports";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetManagerEffectiveness = vi.fn<
  (cycleId?: string, departmentId?: string) => Promise<ManagerEffectivenessReport>
>();

vi.mock("@/api/reports", () => ({
  getManagerEffectiveness: (cycleId?: string, departmentId?: string) =>
    mockGetManagerEffectiveness(cycleId, departmentId),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeReport(): ManagerEffectivenessReport {
  return {
    cycle_id: "cycle-2026",
    department_id: null,
    managers: [
      {
        manager_id: "mgr-1",
        manager_name: "Jane Smith",
        team_size: 8,
        completion_rate: 87.5,
        avg_team_score: 3.45,
        dispute_count: 1,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useManagerEffectiveness", () => {
  it("returns null data immediately when cycleId is undefined, without calling the API", async () => {
    const { result } = renderHook(() =>
      useManagerEffectiveness({ cycleId: undefined }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(mockGetManagerEffectiveness).not.toHaveBeenCalled();
  });

  it("calls getManagerEffectiveness with correct params when cycleId is defined and sets data on success", async () => {
    const report = makeReport();
    mockGetManagerEffectiveness.mockResolvedValue(report);

    const { result } = renderHook(() =>
      useManagerEffectiveness({
        cycleId: "cycle-2026",
        departmentId: "dept-1",
      }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetManagerEffectiveness).toHaveBeenCalledWith(
      "cycle-2026",
      "dept-1",
    );
    expect(result.current.data).toEqual(report);
    expect(result.current.error).toBeNull();
  });

  it("sets error message when API call fails", async () => {
    mockGetManagerEffectiveness.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() =>
      useManagerEffectiveness({ cycleId: "cycle-2026" }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe(
      "Failed to load manager effectiveness data. Please try again.",
    );
  });
});
