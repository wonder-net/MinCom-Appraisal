/**
 * PasswordStrengthIndicator + usePasswordRequirements — Unit tests.
 *
 * Verifies hook logic for all edge cases and component rendering
 * behaviour including accessibility attributes and styling.
 */

import { render, renderHook, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { usePasswordRequirements } from "@/hooks/usePasswordRequirements";
import { PasswordStrengthIndicator } from "../PasswordStrengthIndicator";

describe("usePasswordRequirements", () => {
  it('returns only min-length as unmet for an empty string', () => {
    const { result } = renderHook(() => usePasswordRequirements(""));

    expect(result.current).toEqual([
      { id: "min-length", label: "At least 8 characters", met: false },
      { id: "not-numeric", label: "Not entirely numeric", met: true },
      { id: "special-char", label: "At least one special character (e.g., ! @ # $ %)", met: true },
      { id: "uppercase", label: "At least one uppercase letter", met: true },
    ]);
  });

  it('marks min-length as unmet, not-numeric as met, and special-char as unmet for "short"', () => {
    const { result } = renderHook(() => usePasswordRequirements("short"));

    const minLength = result.current.find((r) => r.id === "min-length");
    const notNumeric = result.current.find((r) => r.id === "not-numeric");
    const specialChar = result.current.find((r) => r.id === "special-char");
    const uppercase = result.current.find((r) => r.id === "uppercase");

    expect(minLength?.met).toBe(false);
    expect(notNumeric?.met).toBe(true);
    expect(specialChar?.met).toBe(false);
    expect(uppercase?.met).toBe(false);
  });

  it('marks min-length as met, not-numeric as unmet, and special-char as unmet for "123456789012"', () => {
    const { result } = renderHook(() =>
      usePasswordRequirements("123456789012"),
    );

    const minLength = result.current.find((r) => r.id === "min-length");
    const notNumeric = result.current.find((r) => r.id === "not-numeric");
    const specialChar = result.current.find((r) => r.id === "special-char");
    const uppercase = result.current.find((r) => r.id === "uppercase");

    expect(minLength?.met).toBe(true);
    expect(notNumeric?.met).toBe(false);
    expect(specialChar?.met).toBe(false);
    expect(uppercase?.met).toBe(false);
  });

  it('marks both requirements as met for "ValidPass123!"', () => {
    const { result } = renderHook(() =>
      usePasswordRequirements("ValidPass123!"),
    );

    expect(result.current.every((r) => r.met)).toBe(true);
  });

  it('marks min-length as false for exactly 7 characters', () => {
    const { result } = renderHook(() =>
      usePasswordRequirements("Short1!"),
    );

    const minLength = result.current.find((r) => r.id === "min-length");
    expect(minLength?.met).toBe(false);
  });

  it('marks min-length as true for exactly 8 characters', () => {
    const { result } = renderHook(() =>
      usePasswordRequirements("Abcde1!x"),
    );

    const minLength = result.current.find((r) => r.id === "min-length");
    expect(minLength?.met).toBe(true);
  });

  it('marks special-char as met when password contains a special character', () => {
    const { result } = renderHook(() =>
      usePasswordRequirements("Hello!"),
    );

    const specialChar = result.current.find((r) => r.id === "special-char");
    expect(specialChar?.met).toBe(true);
  });
});

describe("PasswordStrengthIndicator", () => {
  it("renders null when password is empty", () => {
    const { container } = render(
      <PasswordStrengthIndicator password="" />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("renders checklist rows when password is non-empty", () => {
    render(<PasswordStrengthIndicator password="a" />);

    expect(screen.getByText("At least 8 characters")).toBeInTheDocument();
    expect(screen.getByText("Not entirely numeric")).toBeInTheDocument();
    expect(screen.getByText("At least one special character (e.g., ! @ # $ %)")).toBeInTheDocument();
  });

  it("applies green styling to met requirements", () => {
    render(<PasswordStrengthIndicator password="ValidPass123!" />);

    const list = screen.getByRole("list");
    const items = list.querySelectorAll("li");

    items.forEach((item) => {
      expect(item.className).toContain("text-green-700");
    });
  });

  it("applies gray styling to unmet requirements", () => {
    render(<PasswordStrengthIndicator password="123" />);

    const list = screen.getByRole("list");
    const minLengthItem = list.querySelector("li");

    expect(minLengthItem?.className).toContain("text-gray-500");
  });

  it("shows green styling for met and gray for unmet in mixed state", () => {
    render(<PasswordStrengthIndicator password="short" />);

    const list = screen.getByRole("list");
    const items = list.querySelectorAll("li");

    // min-length is unmet (short < 8 chars)
    expect(items[0].className).toContain("text-gray-500");
    // not-numeric is met (contains letters)
    expect(items[1].className).toContain("text-green-700");
    // special-char is unmet ("short" has no special characters)
    expect(items[2].className).toContain("text-gray-500");
  });

  it('has aria-live="polite" on the wrapping container, not the list', () => {
    render(<PasswordStrengthIndicator password="test" />);

    const list = screen.getByRole("list");
    const wrapper = list.parentElement;

    expect(wrapper).toHaveAttribute("aria-live", "polite");
    expect(list).not.toHaveAttribute("aria-live");
  });

  it("renders as a <ul> element", () => {
    render(<PasswordStrengthIndicator password="test" />);

    const list = screen.getByRole("list");
    expect(list.tagName).toBe("UL");
  });

  it("applies optional className to the wrapping container", () => {
    render(
      <PasswordStrengthIndicator password="test" className="mt-2 space-y-1" />,
    );

    const list = screen.getByRole("list");
    const wrapper = list.parentElement;

    expect(wrapper?.className).toContain("mt-2");
    expect(wrapper?.className).toContain("space-y-1");
  });
});
