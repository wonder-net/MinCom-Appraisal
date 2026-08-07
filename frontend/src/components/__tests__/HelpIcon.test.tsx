/**
 * Tests for the HelpIcon component.
 *
 * Verifies that the icon renders as a react-router `<Link>` (anchor element)
 * with the correct `href` and that the `aria-label` is composed from the
 * provided `label`, falling back to "Open help" when no label is given.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelpIcon } from "../HelpIcon";

describe("HelpIcon", () => {
  it("renders an anchor with the correct href and composed aria-label", () => {
    render(
      <MemoryRouter>
        <HelpIcon to="/help/foo/bar" label="foo" />
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "Open help for foo" });
    expect(link).toBeInTheDocument();
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "/help/foo/bar");
  });

  it("falls back to 'Open help' when no label is provided", () => {
    render(
      <MemoryRouter>
        <HelpIcon to="/help" />
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "Open help" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/help");
  });

  it("applies additional className when provided", () => {
    render(
      <MemoryRouter>
        <HelpIcon to="/help" label="x" className="ml-4" />
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "Open help for x" });
    expect(link.className).toContain("ml-4");
  });

  it("matches snapshot", () => {
    const { container } = render(
      <MemoryRouter>
        <HelpIcon to="/help/foo/bar" label="foo" />
      </MemoryRouter>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
