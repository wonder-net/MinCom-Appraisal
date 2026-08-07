/**
 * Tests for useCompetencyGaps hook — verifies guard behaviour,
 * API call parameters, and re-fetch on formType changes.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useCompetencyGaps } from "../hooks/useCompetencyGaps";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetCompetencyGaps = vi.fn();

vi.mock("@/api/reports", () => ({
  getCompetencyGaps: (...args: unknown[]) => mockGetCompetencyGaps(...args),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useCompetencyGaps", () => {
  it("returns null data immediately when cycleId is undefined, without calling the API", async () => {
    const { result } = renderHook(() =>
      useCompetencyGaps({ cycleId: undefined }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(mockGetCompetencyGaps).not.toHaveBeenCalled();
  });

  it("calls getCompetencyGaps with cycleId and undefined formType when formType is not set", async () => {
    mockGetCompetencyGaps.mockResolvedValue({
      cycle_id: "cycle-1",
      form_type: null,
      gaps: [],
    });

    const { result } = renderHook(() =>
      useCompetencyGaps({ cycleId: "cycle-1" }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetCompetencyGaps).toHaveBeenCalledWith(
      "cycle-1",
      undefined,
    );
    expect(result.current.data).toEqual({
      cycle_id: "cycle-1",
      form_type: null,
      gaps: [],
    });
  });

  it("calls getCompetencyGaps with formType param when set and refetches when formType changes", async () => {
    mockGetCompetencyGaps.mockResolvedValue({
      cycle_id: "cycle-1",
      form_type: "FORM_A",
      gaps: [],
    });

    const { result, rerender } = renderHook<
      ReturnType<typeof useCompetencyGaps>,
      { cycleId?: string; formType?: "FORM_A" | "FORM_B" }
    >(
      (props) => useCompetencyGaps(props),
      { initialProps: { cycleId: "cycle-1", formType: "FORM_A" } },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetCompetencyGaps).toHaveBeenCalledWith(
      "cycle-1",
      "FORM_A",
    );

    mockGetCompetencyGaps.mockResolvedValue({
      cycle_id: "cycle-1",
      form_type: "FORM_B",
      gaps: [],
    });

    rerender({ cycleId: "cycle-1", formType: "FORM_B" });

    await waitFor(() => {
      expect(mockGetCompetencyGaps).toHaveBeenCalledWith(
        "cycle-1",
        "FORM_B",
      );
    });
  });

  it("sets error state when API call fails", async () => {
    mockGetCompetencyGaps.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() =>
      useCompetencyGaps({ cycleId: "cycle-1" }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe(
      "Failed to load competency gap report. Please try again.",
    );
    expect(result.current.data).toBeNull();
  });

  it("retry function re-fetches data", async () => {
    mockGetCompetencyGaps.mockRejectedValueOnce(new Error("fail"));

    const { result } = renderHook(() =>
      useCompetencyGaps({ cycleId: "cycle-1" }),
    );

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });

    mockGetCompetencyGaps.mockResolvedValue({
      cycle_id: "cycle-1",
      form_type: null,
      gaps: [],
    });

    result.current.retry();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).not.toBeNull();
      expect(result.current.error).toBeNull();
    });
  });
});
