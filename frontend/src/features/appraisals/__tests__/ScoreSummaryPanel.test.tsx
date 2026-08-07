/**
 * Unit tests for ScoreSummaryPanel — verifies heading margin (mb-3)
 * and total score divider spacing (mt-1).
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScoreSummaryPanel } from "../components/ScoreSummaryPanel";

describe("ScoreSummaryPanel", () => {
  it("renders the heading with mb-3 class", () => {
    render(
      <ScoreSummaryPanel
        kdAverage="3.79"
        kdDescriptor="Fully Competent"
        bcAverage="3.50"
        bcDescriptor="Fully Competent"
        totalScore="3.70"
        performanceDescriptor="Fully Competent"
        status="MANAGER_REVIEW"
      />,
    );

    const heading = screen.getByText("Score Summary");
    expect(heading).toHaveClass("mb-3");
    expect(heading).not.toHaveClass("mb-2");
  });

  it("renders the total score divider with mt-1 class", () => {
    render(
      <ScoreSummaryPanel
        kdAverage="3.79"
        kdDescriptor="Fully Competent"
        bcAverage="3.50"
        bcDescriptor="Fully Competent"
        totalScore="3.70"
        performanceDescriptor="Fully Competent"
        status="MANAGER_REVIEW"
      />,
    );

    const totalLabel = screen.getByText("Total Score (out of 100)");
    const dividerRow = totalLabel.closest("div")!;
    expect(dividerRow).toHaveClass("mt-1");
    expect(dividerRow).toHaveClass("border-t");
    expect(dividerRow).toHaveClass("pt-2");
  });

  it("shows placeholder when status is SELF_ASSESSMENT", () => {
    render(
      <ScoreSummaryPanel
        kdAverage={null}
        kdDescriptor={null}
        bcAverage={null}
        bcDescriptor={null}
        totalScore={null}
        performanceDescriptor={null}
        status="SELF_ASSESSMENT"
      />,
    );

    expect(
      screen.getByText("Scores available after manager review."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Score Summary")).not.toBeInTheDocument();
  });

  it("displays formatted scores with accessible output labels", () => {
    render(
      <ScoreSummaryPanel
        kdAverage="3.79"
        kdDescriptor="Fully Competent"
        bcAverage="3.50"
        bcDescriptor="Fully Competent"
        totalScore="3.70"
        performanceDescriptor="Fully Competent"
        status="FINALISED"
      />,
    );

    expect(
      screen.getByLabelText(/KPI average score: 3\.79/),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Mincom Core Values total: 3\.50/),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Total score: 3\.70/),
    ).toBeInTheDocument();
  });
});
