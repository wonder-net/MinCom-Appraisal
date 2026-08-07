/**
 * Unit tests for admin user form validation.
 *
 * Tests cover: account-only validation, employee-field conditional
 * validation (triggered when employee_number is non-empty), and
 * the hasErrors utility.
 */

import { describe, it, expect } from "vitest";
import {
  validateAddForm,
  hasErrors,
  INITIAL_ADD_FORM,
  INITIAL_ERRORS,
  type AddUserFormState,
} from "../validate-user-form";

function makeForm(overrides: Partial<AddUserFormState> = {}): AddUserFormState {
  return {
    ...INITIAL_ADD_FORM,
    fullName: "Abena Owusu",
    email: "abena@mincom.com",
    role: "EMPLOYEE",
    ...overrides,
  };
}

describe("validateAddForm", () => {
  it("returns no errors for a valid account-only form", () => {
    const errors = validateAddForm(makeForm());
    expect(hasErrors(errors)).toBe(false);
  });

  it("requires full name", () => {
    const errors = validateAddForm(makeForm({ fullName: "" }));
    expect(errors.fullName).toBe("Full name is required");
  });

  it("requires email", () => {
    const errors = validateAddForm(makeForm({ email: "" }));
    expect(errors.email).toBe("Email address is required");
  });

  it("validates email format", () => {
    const errors = validateAddForm(makeForm({ email: "not-an-email" }));
    expect(errors.email).toBe("Please enter a valid email address");
  });

  it("requires a role to be selected", () => {
    const errors = validateAddForm(makeForm({ role: null }));
    expect(errors.role).toBe("Please select a role");
  });

  it("produces no employee-field errors when all employee fields are blank", () => {
    const errors = validateAddForm(makeForm());
    expect(errors.employeeNumber).toBe("");
    expect(errors.jobTitle).toBe("");
    expect(errors.departmentId).toBe("");
    expect(errors.classification).toBe("");
  });

  it("requires job_title when employee_number is non-empty", () => {
    const errors = validateAddForm(
      makeForm({ employeeNumber: "EMP-001", jobTitle: "" }),
    );
    expect(errors.jobTitle).toBe("Job title is required");
  });

  it("requires department when employee_number is non-empty", () => {
    const errors = validateAddForm(
      makeForm({ employeeNumber: "EMP-001", departmentId: "" }),
    );
    expect(errors.departmentId).toBe("Department is required");
  });

  it("requires classification when employee_number is non-empty", () => {
    const errors = validateAddForm(
      makeForm({ employeeNumber: "EMP-001", classification: "" }),
    );
    expect(errors.classification).toBe("Classification is required");
  });

  it("returns no employee errors when all required employee fields are filled", () => {
    const errors = validateAddForm(
      makeForm({
        employeeNumber: "EMP-001",
        jobTitle: "Analyst",
        departmentId: "dept-1",
        classification: "NON_MANAGERIAL",
      }),
    );
    expect(hasErrors(errors)).toBe(false);
  });

  it("triggers employee validation when any employee field is filled (not just employee_number)", () => {
    const errors = validateAddForm(
      makeForm({ jobTitle: "Analyst" }),
    );
    // employee_number is required because jobTitle triggers the group
    expect(errors.employeeNumber).toBe("Employee number is required");
    expect(errors.departmentId).toBe("Department is required");
    expect(errors.classification).toBe("Classification is required");
  });
});

describe("hasErrors", () => {
  it("returns false for initial empty errors", () => {
    expect(hasErrors(INITIAL_ERRORS)).toBe(false);
  });

  it("returns true when any field has an error", () => {
    expect(hasErrors({ ...INITIAL_ERRORS, email: "Required" })).toBe(true);
  });

  it("returns true for employee field errors", () => {
    expect(
      hasErrors({ ...INITIAL_ERRORS, jobTitle: "Job title is required" }),
    ).toBe(true);
  });

  it("returns true when role error is set", () => {
    expect(
      hasErrors({ ...INITIAL_ERRORS, role: "Please select a role" }),
    ).toBe(true);
  });
});
