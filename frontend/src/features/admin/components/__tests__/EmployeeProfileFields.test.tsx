/**
 * Unit tests for EmployeeProfileFields.
 *
 * Verifies that the department combobox renders normally when
 * isDepartmentsError is false, and renders the fallback error
 * message when isDepartmentsError is true.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/api/employees", () => ({
  listEmployeesForManager: vi.fn().mockResolvedValue([]),
  listEmployees: vi.fn().mockResolvedValue({ data: [], meta: {} }),
}));

import { EmployeeProfileFields } from "../EmployeeProfileFields";
import type { FormErrors } from "../../utils/validate-user-form";

const EMPTY_ERRORS: FormErrors = {
  fullName: "",
  email: "",
  roles: "",
  form: "",
  employeeNumber: "",
  jobTitle: "",
  jobFamily: "",
  departmentId: "",
  location: "",
  classification: "",
  managerId: "",
};

const DEFAULT_PROPS = {
  employeeNumber: "",
  jobTitle: "",
  jobFamily: "",
  departmentId: "",
  location: "",
  classification: "" as const,
  managerId: "",
  departments: [{ id: "dept-1", name: "Finance" }],
  locations: ["Head Office"],
  jobFamilies: ["Accounting"],
  isLookupsLoading: false,
  errors: EMPTY_ERRORS,
  onFieldChange: vi.fn(),
};

describe("EmployeeProfileFields", () => {
  it("renders department Combobox when isDepartmentsError is false", () => {
    render(
      <EmployeeProfileFields
        {...DEFAULT_PROPS}
        isDepartmentsError={false}
      />,
    );

    expect(
      screen.getByPlaceholderText(/Select or type department/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Could not load departments. Please try again."),
    ).not.toBeInTheDocument();
  });

  it("renders fallback error message instead of Combobox when isDepartmentsError is true", () => {
    render(
      <EmployeeProfileFields
        {...DEFAULT_PROPS}
        isDepartmentsError={true}
      />,
    );

    expect(
      screen.getByText("Could not load departments. Please try again."),
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText(/Select or type department/i),
    ).not.toBeInTheDocument();
  });

  it("renders loading skeleton instead of error when isLookupsLoading is true even if isDepartmentsError is true", () => {
    render(
      <EmployeeProfileFields
        {...DEFAULT_PROPS}
        isLookupsLoading={true}
        isDepartmentsError={true}
      />,
    );

    // Loading state takes precedence
    const busyElements = document.querySelectorAll("[aria-busy='true']");
    expect(busyElements.length).toBeGreaterThan(0);
    expect(
      screen.queryByText("Could not load departments. Please try again."),
    ).not.toBeInTheDocument();
  });

  it("renders department Combobox by default when isDepartmentsError is not passed", () => {
    render(<EmployeeProfileFields {...DEFAULT_PROPS} />);

    expect(
      screen.getByPlaceholderText(/Select or type department/i),
    ).toBeInTheDocument();
  });
});
