/**
 * Tests for UnapraisedEmployeesPage — representative test for
 * all 7 thin page wrappers created in TASK-186.
 *
 * Verifies that the page reads cycleId from ReportsCycleContext
 * and passes it to the section component.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { UnapraisedEmployeesPage } from "../pages/UnapraisedEmployeesPage";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const MOCK_CYCLE_ID = "cycle-2026";

vi.mock("../context/ReportsCycleContext", () => ({
  useReportsCycle: () => ({ cycleId: MOCK_CYCLE_ID }),
}));

vi.mock("../components/UnapraisedEmployeesSection", () => ({
  UnapraisedEmployeesSection: ({ cycleId }: { cycleId?: string }) => (
    <div data-testid="unapprised-section" data-cycle-id={cycleId}>
      UnapraisedEmployeesSection
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("UnapraisedEmployeesPage", () => {
  it("renders the page heading", () => {
    render(<UnapraisedEmployeesPage />);

    expect(
      screen.getByRole("heading", { name: "Unapprised Employees" }),
    ).toBeInTheDocument();
  });

  it("renders UnapraisedEmployeesSection with cycleId from context", () => {
    render(<UnapraisedEmployeesPage />);

    const section = screen.getByTestId("unapprised-section");
    expect(section).toBeInTheDocument();
    expect(section).toHaveAttribute("data-cycle-id", MOCK_CYCLE_ID);
  });

});
