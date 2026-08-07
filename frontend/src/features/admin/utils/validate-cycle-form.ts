/**
 * Pure validation functions for the cycle form (New / Edit).
 *
 * No side effects — returns an errors object keyed by field name.
 */

export interface CycleFormValues {
  period_name: string;
  start_date: string;
  end_date: string;
  self_rating_enabled: boolean;
}

export interface CycleFormErrors {
  period_name: string;
  start_date: string;
  end_date: string;
  form: string;
}

export const INITIAL_CYCLE_FORM: CycleFormValues = {
  period_name: "",
  start_date: "",
  end_date: "",
  self_rating_enabled: true,
};

export const INITIAL_CYCLE_ERRORS: CycleFormErrors = {
  period_name: "",
  start_date: "",
  end_date: "",
  form: "",
};

export function validateCycleForm(values: CycleFormValues): CycleFormErrors {
  const errors: CycleFormErrors = { ...INITIAL_CYCLE_ERRORS };

  if (!values.period_name.trim()) {
    errors.period_name = "Period name is required";
  }

  if (!values.start_date) {
    errors.start_date = "Start date is required";
  }

  if (!values.end_date) {
    errors.end_date = "End date is required";
  }

  if (values.start_date && values.end_date && values.end_date <= values.start_date) {
    errors.end_date = "End date must be after start date";
  }

  return errors;
}

export function hasErrors(errors: CycleFormErrors): boolean {
  return Object.entries(errors).some(
    ([key, value]) => key !== "form" && value !== "",
  );
}
