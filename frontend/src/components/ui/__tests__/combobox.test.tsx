/**
 * Unit tests for the Combobox component.
 *
 * Tests cover: placeholder rendering, filtering, option selection,
 * free-text entry, and keyboard navigation.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Combobox, type ComboboxOption } from "../combobox";

const OPTIONS: ComboboxOption[] = [
  { value: "finance", label: "Finance" },
  { value: "retail-banking", label: "Retail Banking" },
  { value: "it", label: "Information Technology" },
  { value: "hr", label: "Human Resources" },
  { value: "operations", label: "Operations" },
];

function renderCombobox(overrides: Partial<React.ComponentProps<typeof Combobox>> = {}) {
  const onChange = vi.fn();
  const result = render(
    <Combobox
      options={OPTIONS}
      value=""
      onChange={onChange}
      placeholder="Select department"
      id="test-combo"
      {...overrides}
    />,
  );
  return { onChange, ...result };
}

describe("Combobox", () => {
  it("renders placeholder when value is empty", () => {
    renderCombobox();
    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("placeholder", "Select department");
    expect(input).toHaveValue("");
  });

  it("shows all options when focused with no text", async () => {
    renderCombobox();
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);

    // Wait for Popover to render
    const listbox = await screen.findByRole("listbox");
    const optionElements = listbox.querySelectorAll("[role='option']");
    expect(optionElements.length).toBe(OPTIONS.length);
  });

  it("filters options when typing 'fin' — case insensitive", async () => {
    renderCombobox();
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "fin" } });

    const listbox = await screen.findByRole("listbox");
    const optionElements = listbox.querySelectorAll("[role='option']");
    // "Finance" matches "fin"
    expect(optionElements.length).toBe(1);
    expect(optionElements[0].textContent).toBe("Finance");
  });

  it("calls onChange with option value when selecting an option", async () => {
    const { onChange } = renderCombobox();
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);

    const listbox = await screen.findByRole("listbox");
    const financeOption = listbox.querySelector("[role='option']");
    expect(financeOption).toBeTruthy();

    fireEvent.mouseDown(financeOption!);

    expect(onChange).toHaveBeenCalledWith("finance");
  });

  it("shows no-match message for unmatched text", async () => {
    renderCombobox();
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "xyz123" } });

    const listbox = await screen.findByRole("listbox");
    expect(listbox.textContent).toContain("No matches");
    expect(listbox.textContent).toContain("xyz123");
  });

  it("commits free text on Enter when no option highlighted", async () => {
    const { onChange } = renderCombobox();
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "New Dept" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("New Dept");
  });

  it("navigates with ArrowDown/ArrowUp and selects with Enter", async () => {
    const { onChange } = renderCombobox();
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);

    // Wait for listbox to appear
    await screen.findByRole("listbox");

    // ArrowDown once -> highlight index 0 (Finance)
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute(
      "aria-activedescendant",
      "test-combo-option-0",
    );

    // ArrowDown again -> highlight index 1 (Retail Banking)
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute(
      "aria-activedescendant",
      "test-combo-option-1",
    );

    // ArrowUp -> back to index 0
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input).toHaveAttribute(
      "aria-activedescendant",
      "test-combo-option-0",
    );

    // Enter -> select Finance
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("finance");
  });

  it("closes dropdown on Escape", async () => {
    renderCombobox();
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    await screen.findByRole("listbox");

    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("has proper ARIA attributes", () => {
    renderCombobox();
    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    expect(input).toHaveAttribute("aria-controls", "test-combo-listbox");
  });

  it("is disabled when disabled prop is true", () => {
    renderCombobox({ disabled: true });
    const input = screen.getByRole("combobox");
    expect(input).toBeDisabled();
  });
});
