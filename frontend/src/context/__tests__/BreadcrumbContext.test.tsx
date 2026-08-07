/**
 * Unit tests for BreadcrumbContext — verifies useBreadcrumbs throws
 * outside provider and that setter correctly updates breadcrumbs.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { BreadcrumbProvider, useBreadcrumbs } from "../BreadcrumbContext";

/** Test component that reads breadcrumbs from context. */
function BreadcrumbDisplay() {
  const { breadcrumbs } = useBreadcrumbs();
  return (
    <ul data-testid="crumbs">
      {breadcrumbs.map((item, i) => (
        <li key={i}>{item.label}</li>
      ))}
    </ul>
  );
}

/** Test component that sets breadcrumbs via the context setter. */
function BreadcrumbSetter() {
  const { setBreadcrumbs } = useBreadcrumbs();
  return (
    <button
      onClick={() =>
        setBreadcrumbs([
          { label: "Appraisals", href: "/appraisals" },
          { label: "Jane Doe" },
        ])
      }
    >
      Set crumbs
    </button>
  );
}

describe("BreadcrumbContext", () => {
  it("throws when useBreadcrumbs is called outside BreadcrumbProvider", () => {
    // Suppress React error boundary console noise
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<BreadcrumbDisplay />)).toThrow(
      "useBreadcrumbs must be used within a BreadcrumbProvider",
    );
    spy.mockRestore();
  });

  it("returns empty breadcrumbs by default", () => {
    render(
      <BreadcrumbProvider>
        <BreadcrumbDisplay />
      </BreadcrumbProvider>,
    );

    const list = screen.getByTestId("crumbs");
    expect(list.children.length).toBe(0);
  });

  it("updates breadcrumbs when setBreadcrumbs is called", async () => {
    const { getByText, getByTestId } = render(
      <BreadcrumbProvider>
        <BreadcrumbSetter />
        <BreadcrumbDisplay />
      </BreadcrumbProvider>,
    );

    const button = getByText("Set crumbs");
    await act(async () => {
      button.click();
    });

    const list = getByTestId("crumbs");
    expect(list.children.length).toBe(2);
    expect(getByText("Appraisals")).toBeInTheDocument();
    expect(getByText("Jane Doe")).toBeInTheDocument();
  });
});
