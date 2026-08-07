/**
 * Pure validation functions for admin user forms.
 *
 * Employee profile fields become required when employee_number is
 * non-empty (i.e. the admin has started filling in the employee
 * section). When employee_number is blank, all employee-field
 * validation errors are suppressed.
 */

import type { AdminRole, EmployeeClassification } from "@/types";
import { EMAIL_REGEX } from "@/utils/validation";

export interface AddUserFormState {
  fullName: string;
  email: string;
  role: AdminRole | null;
  employeeNumber: string;
  jobTitle: string;
  jobFamily: string;
  departmentId: string;
  location: string;
  classification: EmployeeClassification | "";
  managerId: string;
  /** Optional second reporting line (HR change request #3). */
  matrixAppraiserId: string;
}

export interface FormErrors {
  fullName: string;
  email: string;
  role: string;
  form: string;
  employeeNumber: string;
  jobTitle: string;
  jobFamily: string;
  departmentId: string;
  location: string;
  classification: string;
  managerId: string;
  matrixAppraiserId: string;
}

export const INITIAL_ADD_FORM: AddUserFormState = {
  fullName: "",
  email: "",
  role: null,
  employeeNumber: "",
  jobTitle: "",
  jobFamily: "",
  departmentId: "",
  location: "",
  classification: "",
  managerId: "",
  matrixAppraiserId: "",
};

export const INITIAL_ERRORS: FormErrors = {
  fullName: "",
  email: "",
  role: "",
  form: "",
  employeeNumber: "",
  jobTitle: "",
  jobFamily: "",
  departmentId: "",
  location: "",
  classification: "",
  managerId: "",
  matrixAppraiserId: "",
};

/**
 * Returns true when any employee-section field has a non-empty value,
 * which triggers validation of the required employee fields.
 */
function hasAnyEmployeeField(form: AddUserFormState): boolean {
  return Boolean(
    form.employeeNumber.trim() ||
    form.jobTitle.trim() ||
    form.jobFamily.trim() ||
    form.departmentId.trim() ||
    form.location.trim() ||
    form.classification ||
    form.managerId.trim() ||
    form.matrixAppraiserId.trim(),
  );
}

export function validateAddForm(form: AddUserFormState): FormErrors {
  const errors: FormErrors = { ...INITIAL_ERRORS };

  if (!form.fullName.trim()) {
    errors.fullName = "Full name is required";
  }
  if (!form.email.trim()) {
    errors.email = "Email address is required";
  } else if (!EMAIL_REGEX.test(form.email)) {
    errors.email = "Please enter a valid email address";
  }
  if (form.role === null) {
    errors.role = "Please select a role";
  }

  // Employee fields are required only when any employee field is filled
  if (hasAnyEmployeeField(form)) {
    if (!form.employeeNumber.trim()) {
      errors.employeeNumber = "Employee number is required";
    }
    if (!form.jobTitle.trim()) {
      errors.jobTitle = "Job title is required";
    }
    if (!form.departmentId.trim()) {
      errors.departmentId = "Department is required";
    }
    if (!form.classification) {
      errors.classification = "Classification is required";
    }
  }

  return errors;
}

export function hasErrors(errors: FormErrors): boolean {
  return Object.values(errors).some((v) => Boolean(v));
}
