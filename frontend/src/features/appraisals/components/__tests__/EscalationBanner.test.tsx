/**
 * Tests for EscalationBanner — AC-13 of TASK-268.
 *
 * Verifies:
 *  1. Banner renders the executive name in its text.
 *  2. Banner has no close/dismiss button — it is non-dismissable.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EscalationBanner } from "../EscalationBanner";

describe("EscalationBanner", () => {
  it("renders the executive name inside the banner text", () => {
    render(<EscalationBanner executiveName="Akua Boateng" />);
    expect(
      screen.getByText(/This appraisal has been escalated/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Akua Boateng")).toBeInTheDocument();
    expect(screen.getByText(/is now the appraisor/i)).toBeInTheDocument();
  });

  it("has no dismiss/close button in the DOM", () => {
    const { container } = render(
      <EscalationBanner executiveName="Akua Boateng" />,
    );
    expect(
      screen.queryByRole("button", { name: /dismiss|close/i }),
    ).not.toBeInTheDocument();
    // Defence-in-depth: no buttons of any kind in the banner subtree.
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });
});
