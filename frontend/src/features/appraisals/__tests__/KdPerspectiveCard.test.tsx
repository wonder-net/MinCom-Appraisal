/**
 * Unit tests for KdPerspectiveCard — verifies zebra striping,
 * rounded-r-lg + overflow-hidden on outer wrapper, and no
 * rounded-full on form badges.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KdPerspectiveCard } from "../components/KdPerspectiveCard";
import type { KeyDeliverable } from "@/types";

function makeKd(overrides: Partial<KeyDeliverable> = {}): KeyDeliverable {
  return {
    id: "kd-001",
    appraisal: "a-001",
    perspective: "FINANCIAL",
    perspective_name: "Financial",
    perspective_weight_cap: "0.3000",
    perspective_max_kd_count: 4,
    description: "Increase revenue by 10%",
    weight: 0.3,
    self_rating: null,
    manager_rating: null,
    weighted_score: null,
    sort_order: 1,
    created_at: "2026-03-14T10:00:00Z",
    updated_at: "2026-03-14T10:00:00Z",
    ...overrides,
  };
}

const noop = vi.fn();

describe("KdPerspectiveCard", () => {
  it("applies zebra striping: alternating bg-white and bg-gray-50 rows", () => {
    const deliverables = [
      makeKd({ id: "kd-1", description: "First KD" }),
      makeKd({ id: "kd-2", description: "Second KD" }),
      makeKd({ id: "kd-3", description: "Third KD" }),
    ];

    render(
      <KdPerspectiveCard
        perspective="FINANCIAL"
        deliverables={deliverables}
        selfRatingEnabled={false}
        canEditKd={false}
        canMgrRate={false}
        onUpdateKd={noop}
        weightCap={0.3}
        maxKdCount={4}
        onDeleteKd={noop}
        onAddKd={noop}
      />,
    );

    const firstRow = screen.getByText("First KD").closest("tr")!;
    const secondRow = screen.getByText("Second KD").closest("tr")!;
    const thirdRow = screen.getByText("Third KD").closest("tr")!;

    expect(firstRow).toHaveClass("bg-white");
    expect(secondRow).toHaveClass("bg-gray-50");
    expect(thirdRow).toHaveClass("bg-white");
  });

  it("has rounded-r-lg and overflow-hidden on the outer wrapper", () => {
    const deliverables = [makeKd()];

    const { container } = render(
      <KdPerspectiveCard
        perspective="FINANCIAL"
        deliverables={deliverables}
        selfRatingEnabled={false}
        canEditKd={false}
        canMgrRate={false}
        onUpdateKd={noop}
        weightCap={0.3}
        maxKdCount={4}
        onDeleteKd={noop}
        onAddKd={noop}
      />,
    );

    const outerWrapper = container.firstElementChild!;
    expect(outerWrapper).toHaveClass("rounded-r-lg");
    expect(outerWrapper).toHaveClass("overflow-hidden");
  });

  it("does not use rounded-full on the card wrapper or form badges", () => {
    const deliverables = [makeKd()];

    const { container } = render(
      <KdPerspectiveCard
        perspective="FINANCIAL"
        deliverables={deliverables}
        selfRatingEnabled={false}
        canEditKd={false}
        canMgrRate={false}
        onUpdateKd={noop}
        weightCap={0.3}
        maxKdCount={4}
        onDeleteKd={noop}
        onAddKd={noop}
      />,
    );

    const outerWrapper = container.firstElementChild!;
    expect(outerWrapper).not.toHaveClass("rounded-full");

    // No element in the entire card should have rounded-full
    const roundedFullElements = container.querySelectorAll(
      '[class*="rounded-full"]',
    );
    expect(roundedFullElements.length).toBe(0);
  });

  it("renders font-semibold on all th elements", () => {
    const deliverables = [makeKd()];

    const { container } = render(
      <KdPerspectiveCard
        perspective="FINANCIAL"
        deliverables={deliverables}
        selfRatingEnabled={false}
        canEditKd={false}
        canMgrRate={false}
        onUpdateKd={noop}
        weightCap={0.3}
        maxKdCount={4}
        onDeleteKd={noop}
        onAddKd={noop}
      />,
    );

    const thElements = container.querySelectorAll("th");
    expect(thElements.length).toBeGreaterThan(0);

    thElements.forEach((th) => {
      expect(th).toHaveClass("font-semibold");
    });
  });

  describe("weight-cap enforcement", () => {
    const threeKds = [
      makeKd({ id: "kd-1", description: "KD A", weight: 0.10, sort_order: 1 }),
      makeKd({ id: "kd-2", description: "KD B", weight: 0.10, sort_order: 2 }),
      makeKd({ id: "kd-3", description: "KD C", weight: 0.05, sort_order: 3 }),
    ];

    it("happy path: accepts weight within remaining cap and calls onAddKd", async () => {
      const user = userEvent.setup();
      const onAddKd = vi.fn();

      render(
        <KdPerspectiveCard
          perspective="FINANCIAL"
          deliverables={threeKds}
          selfRatingEnabled={false}
          canEditKd={true}
          canMgrRate={false}
          weightCap={0.3}
          maxKdCount={10}
          onUpdateKd={noop}
          onDeleteKd={noop}
          onAddKd={onAddKd}
        />,
      );

      // Open the add form
      await user.click(screen.getByText("+ Add key performance indicator"));

      // Fill in description
      const descInput = screen.getByLabelText("New key performance indicator description");
      await user.type(descInput, "New KD");

      // Fill in weight = 5 (remaining cap is exactly 5%)
      const weightInput = screen.getByLabelText("New key performance indicator weight (%)");
      await user.type(weightInput, "5");

      // Save
      await user.click(screen.getByLabelText("Save new key performance indicator"));

      expect(onAddKd).toHaveBeenCalledTimes(1);
      expect(onAddKd).toHaveBeenCalledWith("FINANCIAL", "New KD", 0.05, undefined, undefined);
    });

    it("enforcement: rejects weight exceeding remaining cap via onChange guard", async () => {
      const user = userEvent.setup();
      const onAddKd = vi.fn();

      render(
        <KdPerspectiveCard
          perspective="FINANCIAL"
          deliverables={threeKds}
          selfRatingEnabled={false}
          canEditKd={true}
          canMgrRate={false}
          weightCap={0.3}
          maxKdCount={10}
          onUpdateKd={noop}
          onDeleteKd={noop}
          onAddKd={onAddKd}
        />,
      );

      // Open the add form
      await user.click(screen.getByText("+ Add key performance indicator"));

      const descInput = screen.getByLabelText("New key performance indicator description");
      await user.type(descInput, "Over-weight KD");

      // Try to type 6 — onChange guard rejects because 6 > 5 (remaining cap)
      const weightInput = screen.getByLabelText("New key performance indicator weight (%)");
      await user.type(weightInput, "6");

      // The input should remain empty because "6" was rejected by onChange
      expect(weightInput).toHaveValue(null);

      // Save button should be disabled (no weight entered), but even if clicked:
      await user.click(screen.getByLabelText("Save new key performance indicator"));

      expect(onAddKd).not.toHaveBeenCalled();
    });

    it("cap-reached state: hides Add button and shows cap-reached message", () => {
      const onAddKd = vi.fn();
      const capFilledKd = [
        makeKd({ id: "kd-full", description: "Full weight KD", weight: 0.30 }),
      ];

      render(
        <KdPerspectiveCard
          perspective="FINANCIAL"
          deliverables={capFilledKd}
          selfRatingEnabled={false}
          canEditKd={true}
          canMgrRate={false}
          weightCap={0.3}
          maxKdCount={10}
          onUpdateKd={noop}
          onDeleteKd={noop}
          onAddKd={onAddKd}
        />,
      );

      // "Add key performance indicator" button should NOT be present
      expect(screen.queryByText("+ Add key performance indicator")).not.toBeInTheDocument();

      // The weight-cap-reached message should be displayed
      expect(
        screen.getByText("Weight cap (30%) reached for this perspective."),
      ).toBeInTheDocument();
    });
  });
});
