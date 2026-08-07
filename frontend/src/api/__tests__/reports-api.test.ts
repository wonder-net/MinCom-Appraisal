/**
 * Unit tests for reports API functions — verifies URL construction
 * with and without cycle_id query parameter.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGet = vi.fn();

vi.mock("../client", () => ({
  apiClient: { get: (...args: unknown[]) => mockGet(...args) },
}));

const {
  getDashboardReport,
  getDepartmentReport,
  getTrainingNeeds,
  downloadAppraisalsCSV,
} = await import("../reports");

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: {} });
});

describe("getDashboardReport", () => {
  it("calls reports/dashboard/ without query string when cycleId is undefined", async () => {
    await getDashboardReport();
    expect(mockGet).toHaveBeenCalledWith("reports/dashboard/");
  });

  it("calls reports/dashboard/?cycle_id=<uuid> when cycleId is provided", async () => {
    await getDashboardReport("abc-123");
    expect(mockGet).toHaveBeenCalledWith(
      "reports/dashboard/?cycle_id=abc-123",
    );
  });
});

describe("getDepartmentReport", () => {
  it("calls reports/department/{id}/ without query string when cycleId is undefined", async () => {
    await getDepartmentReport("dept-1");
    expect(mockGet).toHaveBeenCalledWith("reports/department/dept-1/");
  });

  it("calls reports/department/{id}/?cycle_id=<uuid> when cycleId is provided", async () => {
    await getDepartmentReport("dept-1", "cycle-2");
    expect(mockGet).toHaveBeenCalledWith(
      "reports/department/dept-1/?cycle_id=cycle-2",
    );
  });
});

describe("getTrainingNeeds", () => {
  it("calls reports/training-needs/ without query string when cycleId is undefined", async () => {
    await getTrainingNeeds();
    expect(mockGet).toHaveBeenCalledWith("reports/training-needs/");
  });

  it("calls reports/training-needs/?cycle_id=<uuid> when cycleId is provided", async () => {
    await getTrainingNeeds("cycle-3");
    expect(mockGet).toHaveBeenCalledWith(
      "reports/training-needs/?cycle_id=cycle-3",
    );
  });
});

describe("downloadAppraisalsCSV", () => {
  let mockCreateObjectURL: ReturnType<typeof vi.fn>;
  let mockRevokeObjectURL: ReturnType<typeof vi.fn>;
  let clickedAnchor: HTMLAnchorElement | null;

  beforeEach(() => {
    clickedAnchor = null;
    mockCreateObjectURL = vi.fn().mockReturnValue("blob:http://localhost/fake-blob-url");
    mockRevokeObjectURL = vi.fn();
    globalThis.URL.createObjectURL = mockCreateObjectURL;
    globalThis.URL.revokeObjectURL = mockRevokeObjectURL;

    // Spy on anchor click to capture the programmatic download
    vi.spyOn(document.body, "appendChild").mockImplementation((node) => {
      clickedAnchor = node as HTMLAnchorElement;
      return node;
    });
    vi.spyOn(document.body, "removeChild").mockImplementation((node) => node);
  });

  it("creates an object URL from the blob and triggers a link click to download", async () => {
    const fakeBlob = new Blob(["csv,data"], { type: "text/csv" });
    mockGet.mockResolvedValueOnce({
      data: fakeBlob,
      headers: {
        "content-disposition": 'attachment; filename="appraisals_2026.csv"',
      },
    });

    await downloadAppraisalsCSV("cycle-1");

    // Verify correct URL and responseType
    expect(mockGet).toHaveBeenCalledWith(
      "reports/export/csv/?cycle_id=cycle-1",
      { responseType: "blob" },
    );

    // Verify object URL was created from the blob
    expect(mockCreateObjectURL).toHaveBeenCalledWith(fakeBlob);

    // Verify the anchor was configured with the correct download filename
    expect(clickedAnchor).not.toBeNull();
    expect(clickedAnchor!.href).toContain("blob:");
    expect(clickedAnchor!.download).toBe("appraisals_2026.csv");

    // Verify object URL was revoked to prevent memory leak
    expect(mockRevokeObjectURL).toHaveBeenCalledWith(
      "blob:http://localhost/fake-blob-url",
    );
  });

  it("falls back to default filename when Content-Disposition is absent", async () => {
    const fakeBlob = new Blob(["csv,data"], { type: "text/csv" });
    mockGet.mockResolvedValueOnce({
      data: fakeBlob,
      headers: {},
    });

    await downloadAppraisalsCSV();

    expect(mockGet).toHaveBeenCalledWith("reports/export/csv/", {
      responseType: "blob",
    });
    expect(clickedAnchor).not.toBeNull();
    expect(clickedAnchor!.download).toBe("appraisals_export.csv");
  });
});
