/**
 * Unit tests for RoleSelect — the single-role dropdown control.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RoleSelect } from "../RoleSelect";

describe("RoleSelect", () => {
  it("renders the placeholder option and all roles in HR-tier grouping", () => {
    render(<RoleSelect selectedRole={null} onChange={vi.fn()} />);

    const dropdown = screen.getByLabelText(/^Role/) as HTMLSelectElement;
    const optionLabels = Array.from(dropdown.options).map(
      (o) => o.textContent,
    );

    // HR-tier roles grouped: HR Director → HR Admin → System Admin → Executive
    // (TASK-303). SYSTEM_ADMIN sits next to HR_ADMIN because they share
    // platform-admin access.
    expect(optionLabels).toEqual([
      "— Select a role —",
      "Appraisee",
      "Appraisor",
      "HR Director",
      "HR Admin",
      "System Admin",
      "Executive",
    ]);
  });

  it("shows the placeholder selected when selectedRole is null", () => {
    render(<RoleSelect selectedRole={null} onChange={vi.fn()} />);
    const dropdown = screen.getByLabelText(/^Role/) as HTMLSelectElement;
    expect(dropdown.value).toBe("");
  });

  it("pre-selects the provided role", () => {
    render(<RoleSelect selectedRole="HR_ADMIN" onChange={vi.fn()} />);
    const dropdown = screen.getByLabelText(/^Role/) as HTMLSelectElement;
    expect(dropdown.value).toBe("HR_ADMIN");
  });

  it("calls onChange with the new role when a different option is selected", () => {
    const onChange = vi.fn();
    render(<RoleSelect selectedRole={null} onChange={onChange} />);

    const dropdown = screen.getByLabelText(/^Role/);
    fireEvent.change(dropdown, { target: { value: "MANAGER" } });

    expect(onChange).toHaveBeenCalledWith("MANAGER");
  });

  it("calls onChange with null when the placeholder is re-selected", () => {
    const onChange = vi.fn();
    render(<RoleSelect selectedRole="EMPLOYEE" onChange={onChange} />);

    const dropdown = screen.getByLabelText(/^Role/);
    fireEvent.change(dropdown, { target: { value: "" } });

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("renders the error message when one is provided", () => {
    render(
      <RoleSelect
        selectedRole={null}
        onChange={vi.fn()}
        error="Please select a role"
      />,
    );

    expect(screen.getByText("Please select a role")).toBeInTheDocument();
    const dropdown = screen.getByLabelText(/^Role/);
    expect(dropdown).toHaveAttribute("aria-invalid", "true");
  });

  it("disables the dropdown when disabled prop is true", () => {
    render(
      <RoleSelect selectedRole={null} onChange={vi.fn()} disabled />,
    );
    const dropdown = screen.getByLabelText(/^Role/);
    expect(dropdown).toBeDisabled();
  });
});
