/**
 * Integration test for AdminCompetencies — verifies the edit flow:
 * click Edit, change sort_order, save, refetch + success toast.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockListAdminCompetencies = vi.fn();
const mockPatchCompetency = vi.fn();
const mockCreateCompetency = vi.fn();

vi.mock("@/api/competencies", async () => {
  const actual =
    await vi.importActual<typeof import("@/api/competencies")>(
      "@/api/competencies",
    );
  return {
    ...actual,
    listAdminCompetencies: (...args: unknown[]) =>
      mockListAdminCompetencies(...args),
    patchCompetency: (...args: unknown[]) => mockPatchCompetency(...args),
    createCompetency: (...args: unknown[]) => mockCreateCompetency(...args),
  };
});

import { AdminCompetencies } from "../pages/AdminCompetencies";
import type { Competency } from "@/api/competencies";

function makeCompetency(overrides: Partial<Competency> = {}): Competency {
  return {
    id: "c-001",
    name: "Customer Focus",
    category: "ALL",
    applicable_to: "ALL",
    is_core: false,
    sort_order: 1,
    is_active: true,
    ...overrides,
  };
}

describe("AdminCompetencies — edit flow", () => {
  beforeEach(() => {
    mockListAdminCompetencies.mockReset();
    mockPatchCompetency.mockReset();
    mockCreateCompetency.mockReset();
  });

  // 15s timeout — this integration test exercises a full mount + dialog
  // open + interact + submit + refetch flow, which can exceed the default
  // 5s budget under parallel-suite contention (QA flagged this in TASK-266
  // round 2 review). The test runs at ~660ms in isolation; the bump
  // accommodates worst-case parallel scheduling.
  it("opens edit dialog, submits new sort_order, refetches, and shows success toast", { timeout: 15000 }, async () => {
    const user = userEvent.setup();
    const competency = makeCompetency();
    const updated = { ...competency, sort_order: 5 };

    mockListAdminCompetencies.mockResolvedValue([competency]);
    mockPatchCompetency.mockResolvedValue(updated);

    render(<AdminCompetencies />);

    // Initial load completes
    await waitFor(() => {
      expect(mockListAdminCompetencies).toHaveBeenCalledTimes(1);
    });
    await screen.findByText("Customer Focus");

    // Click Edit
    await user.click(
      screen.getByRole("button", { name: /edit customer focus/i }),
    );

    // Dialog opens
    expect(
      await screen.findByRole("dialog", { name: /edit competency/i }),
    ).toBeInTheDocument();

    // Change sort_order to 5
    const sortOrderInput = screen.getByLabelText(/sort order/i);
    await user.clear(sortOrderInput);
    await user.type(sortOrderInput, "5");

    // Submit
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    // Patch called with the new sort_order
    await waitFor(() => {
      expect(mockPatchCompetency).toHaveBeenCalledTimes(1);
    });
    expect(mockPatchCompetency).toHaveBeenCalledWith(
      competency.id,
      expect.objectContaining({ sort_order: 5 }),
    );

    // Refetch triggered after success
    await waitFor(() => {
      expect(mockListAdminCompetencies).toHaveBeenCalledTimes(2);
    });

    // Success toast appears
    await waitFor(() => {
      expect(screen.getByText(/competency updated/i)).toBeInTheDocument();
    });
  });
});
