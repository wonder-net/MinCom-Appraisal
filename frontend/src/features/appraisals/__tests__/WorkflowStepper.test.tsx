/**
 * Unit tests for WorkflowStepper — verifies circle sizing (h-7 w-7),
 * inline flex connector approach, and 5-step / 6-step variants.
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { WorkflowStepper } from "../components/WorkflowStepper";
import type { AppraisalStatus } from "@/types";

const STATUSES_TO_TEST: ReadonlyArray<AppraisalStatus> = [
  "SELF_ASSESSMENT",
  "MANAGER_REVIEW",
  "FINALISED",
  "DISPUTED",
];

describe("WorkflowStepper", () => {
  describe("6-step mode (default)", () => {
    it.each(STATUSES_TO_TEST)(
      "renders h-7 w-7 circles (not h-8 w-8) for status %s",
      (status) => {
        const { container } = render(<WorkflowStepper status={status} selfRatingEnabled={true} />);
        const nav = container.querySelector("nav")!;

        const allStepCircles = nav.querySelectorAll(".h-7.w-7");
        expect(allStepCircles.length).toBeGreaterThan(0);

        const oversized = nav.querySelectorAll(".h-8, .w-8");
        expect(oversized.length).toBe(0);
      },
    );

    it.each(STATUSES_TO_TEST)(
      "uses no absolute positioning inside the stepper for status %s",
      (status) => {
        const { container } = render(<WorkflowStepper status={status} selfRatingEnabled={true} />);
        const nav = container.querySelector("nav")!;

        const absoluteElements = nav.querySelectorAll('[class*="absolute"]');
        expect(absoluteElements.length).toBe(0);
      },
    );

    it("renders connector lines as inline flex siblings", () => {
      const { container } = render(<WorkflowStepper status="MANAGER_REVIEW" selfRatingEnabled={true} />);
      const desktopGrid = container.querySelector(".grid.grid-cols-6")!;

      const cells = desktopGrid.children;
      expect(cells.length).toBe(6);

      for (let i = 0; i < cells.length; i++) {
        expect(cells[i]).toHaveClass("flex", "items-center");
      }
    });

    it("renders 6 step labels", () => {
      const { container } = render(<WorkflowStepper status="SELF_ASSESSMENT" selfRatingEnabled={true} />);
      const labels = container.querySelectorAll(".grid.grid-cols-6")[1];
      expect(labels).toBeTruthy();
      expect(labels!.children.length).toBe(6);
    });

    it("renders exactly 6 h-7 w-7 circles for status SELF_ASSESSMENT", () => {
      const { container } = render(<WorkflowStepper status="SELF_ASSESSMENT" selfRatingEnabled={true} />);
      const nav = container.querySelector("nav")!;
      const desktopSection = nav.querySelector(".hidden.sm\\:block")!;
      const circles = desktopSection.querySelectorAll(".h-7.w-7");
      expect(circles.length).toBe(6);
    });

    it("uses grid-cols-6 and not grid-cols-7", () => {
      const { container } = render(<WorkflowStepper status="SELF_ASSESSMENT" selfRatingEnabled={true} />);
      const grids6 = container.querySelectorAll(".grid-cols-6");
      expect(grids6.length).toBeGreaterThan(0);

      const grids7 = container.querySelectorAll(".grid-cols-7");
      expect(grids7.length).toBe(0);
    });

    it("renders 6 steps when selfRatingEnabled is true", () => {
      const { container } = render(<WorkflowStepper status="MANAGER_REVIEW" selfRatingEnabled={true} />);
      const grids6 = container.querySelectorAll(".grid-cols-6");
      expect(grids6.length).toBeGreaterThan(0);

      const grids5 = container.querySelectorAll(".grid-cols-5");
      expect(grids5.length).toBe(0);
    });
  });

  describe("5-step mode (selfRatingEnabled=false)", () => {
    it("renders grid-cols-5 layout", () => {
      const { container } = render(
        <WorkflowStepper status="MANAGER_REVIEW" selfRatingEnabled={false} />,
      );
      const grids5 = container.querySelectorAll(".grid-cols-5");
      expect(grids5.length).toBeGreaterThan(0);

      const grids6 = container.querySelectorAll(".grid-cols-6");
      expect(grids6.length).toBe(0);
    });

    it("renders exactly 5 circles in desktop view", () => {
      const { container } = render(
        <WorkflowStepper status="MANAGER_REVIEW" selfRatingEnabled={false} />,
      );
      const nav = container.querySelector("nav")!;
      const desktopSection = nav.querySelector(".hidden.sm\\:block")!;
      const circles = desktopSection.querySelectorAll(".h-7.w-7");
      expect(circles.length).toBe(5);
    });

    it("renders 5 step labels", () => {
      const { container } = render(
        <WorkflowStepper status="MANAGER_REVIEW" selfRatingEnabled={false} />,
      );
      const labels = container.querySelectorAll(".grid.grid-cols-5")[1];
      expect(labels).toBeTruthy();
      expect(labels!.children.length).toBe(5);
    });

    it("does not render Self Assess label", () => {
      const { container } = render(
        <WorkflowStepper status="MANAGER_REVIEW" selfRatingEnabled={false} />,
      );
      const allText = container.textContent ?? "";
      expect(allText).not.toContain("Self Assess");
    });

    it("maps FINALISED to the last step (index 4)", () => {
      const { container } = render(
        <WorkflowStepper status="FINALISED" selfRatingEnabled={false} />,
      );
      const nav = container.querySelector("nav")!;
      const desktopSection = nav.querySelector(".hidden.sm\\:block")!;
      const circles = desktopSection.querySelectorAll(".h-7.w-7");

      // The last circle (index 4) should be active — has aria-current="step"
      const lastCircle = circles[4];
      expect(lastCircle.getAttribute("aria-current")).toBe("step");
    });

    it("maps SELF_ASSESSMENT to step 0 as a guard fallback", () => {
      const { container } = render(
        <WorkflowStepper status="SELF_ASSESSMENT" selfRatingEnabled={false} />,
      );
      const nav = container.querySelector("nav")!;
      const desktopSection = nav.querySelector(".hidden.sm\\:block")!;
      const circles = desktopSection.querySelectorAll(".h-7.w-7");

      // First circle (index 0) should be active
      const firstCircle = circles[0];
      expect(firstCircle.getAttribute("aria-current")).toBe("step");
    });

    it("shows Step X of 5 in mobile view", () => {
      const { container } = render(
        <WorkflowStepper status="DISCUSSION" selfRatingEnabled={false} />,
      );
      const mobileSection = container.querySelector(".sm\\:hidden")!;
      expect(mobileSection.textContent).toContain("Step 2 of 5");
    });

    it("renders connector lines as inline flex siblings in 5-step mode", () => {
      const { container } = render(
        <WorkflowStepper status="MANAGER_REVIEW" selfRatingEnabled={false} />,
      );
      const desktopGrid = container.querySelector(".grid.grid-cols-5")!;

      const cells = desktopGrid.children;
      expect(cells.length).toBe(5);

      for (let i = 0; i < cells.length; i++) {
        expect(cells[i]).toHaveClass("flex", "items-center");
      }
    });
  });
});
