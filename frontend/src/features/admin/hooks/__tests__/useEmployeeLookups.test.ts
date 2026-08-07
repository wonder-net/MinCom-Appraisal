/**
 * Unit tests for useEmployeeLookups hook.
 *
 * Verifies that isError is properly surfaced when any of the
 * lookup fetches fail, and false when all succeed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const mockListDepartments = vi.fn();
const mockListLocations = vi.fn();
const mockListJobFamilies = vi.fn();

vi.mock("@/api/employees", () => ({
  listDepartments: () => mockListDepartments(),
  listLocations: () => mockListLocations(),
  listJobFamilies: () => mockListJobFamilies(),
}));

import { useEmployeeLookups } from "../useEmployeeLookups";

describe("useEmployeeLookups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns isError=false and populated data when all fetches succeed", async () => {
    mockListDepartments.mockResolvedValue([
      { id: "dept-1", name: "Finance" },
    ]);
    mockListLocations.mockResolvedValue(["Head Office"]);
    mockListJobFamilies.mockResolvedValue(["Accounting"]);

    const { result } = renderHook(() => useEmployeeLookups());

    // Initially loading
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isError).toBe(false);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(false);
    expect(result.current.departments).toEqual([
      { id: "dept-1", name: "Finance" },
    ]);
    expect(result.current.locations).toEqual(["Head Office"]);
    expect(result.current.jobFamilies).toEqual(["Accounting"]);
  });

  it("returns isError=true and empty departments when listDepartments rejects", async () => {
    mockListDepartments.mockRejectedValue(new Error("Network error"));
    mockListLocations.mockResolvedValue(["Head Office"]);
    mockListJobFamilies.mockResolvedValue(["Accounting"]);

    const { result } = renderHook(() => useEmployeeLookups());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.departments).toEqual([]);
  });

  it("returns isError=true when listLocations rejects", async () => {
    mockListDepartments.mockResolvedValue([
      { id: "dept-1", name: "Finance" },
    ]);
    mockListLocations.mockRejectedValue(new Error("Network error"));
    mockListJobFamilies.mockResolvedValue(["Accounting"]);

    const { result } = renderHook(() => useEmployeeLookups());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
  });

  it("returns isError=true when listJobFamilies rejects", async () => {
    mockListDepartments.mockResolvedValue([
      { id: "dept-1", name: "Finance" },
    ]);
    mockListLocations.mockResolvedValue(["Head Office"]);
    mockListJobFamilies.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useEmployeeLookups());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
  });
});
