/**
 * AddUserDialog — Modal form for creating a new user account
 * with optional employee profile fields.
 *
 * Two fieldsets: Account (name, email, roles) and Employee Profile
 * (number, title, department, location, classification, manager).
 * Employee fields become required when employee_number is non-empty.
 */

import { useState, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RoleSelect } from "./RoleSelect";
import { EmployeeProfileFields } from "./EmployeeProfileFields";
import { createUser } from "@/api/admin-users";
import { useEmployeeLookups } from "../hooks/useEmployeeLookups";
import { extractApiError } from "@/utils/extract-api-error";
import { isAxiosError } from "axios";
import type { AdminRole, EmployeeClassification } from "@/types";
import { isUUID } from "@/utils/validation";
import {
  type FormErrors,
  INITIAL_ADD_FORM,
  INITIAL_ERRORS,
  validateAddForm,
  hasErrors,
} from "../utils/validate-user-form";

interface AddUserDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type EmployeeFieldKey =
  | "employeeNumber"
  | "jobTitle"
  | "departmentId"
  | "location"
  | "classification"
  | "managerId"
  | "matrixAppraiserId";

function buildCreatePayload(form: typeof INITIAL_ADD_FORM) {
  const payload: Parameters<typeof createUser>[0] = {
    email: form.email,
    full_name: form.fullName,
    // Backend contract still expects an array — wrap the single role.
    roles: form.role ? [form.role] : [],
  };

  if (form.employeeNumber.trim()) {
    payload.employee_number = form.employeeNumber.trim();
    payload.job_title = form.jobTitle.trim();
    if (form.jobFamily.trim()) payload.job_family = form.jobFamily.trim();
    if (form.departmentId) {
      if (isUUID(form.departmentId)) {
        payload.department_id = form.departmentId;
      } else {
        payload.department_name = form.departmentId;
      }
    }
    if (form.location.trim()) payload.location = form.location.trim();
    if (form.classification) {
      payload.classification = form.classification as EmployeeClassification;
    }
    if (form.managerId.trim()) payload.manager_id = form.managerId;
    if (form.matrixAppraiserId.trim()) {
      payload.matrix_appraiser_id = form.matrixAppraiserId;
    }
  }

  return payload;
}

export function AddUserDialog({
  isOpen,
  onClose,
  onSuccess,
}: AddUserDialogProps) {
  const [form, setForm] = useState(INITIAL_ADD_FORM);
  const [errors, setErrors] = useState<FormErrors>(INITIAL_ERRORS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { departments, locations, jobFamilies, isLoading: isLookupsLoading, isError: isLookupsError, refetch: refetchLookups } =
    useEmployeeLookups();

  // Re-fetch lookups each time the dialog opens so newly created
  // departments (via free-text entry) appear in the dropdown.
  useEffect(() => {
    if (isOpen) {
      refetchLookups();
    }
  }, [isOpen, refetchLookups]);

  const resetForm = useCallback(() => {
    setForm(INITIAL_ADD_FORM);
    setErrors(INITIAL_ERRORS);
    setIsSubmitting(false);
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const validationErrors = validateAddForm(form);
      setErrors(validationErrors);
      if (hasErrors(validationErrors)) return;

      setIsSubmitting(true);
      setErrors(INITIAL_ERRORS);

      try {
        await createUser(buildCreatePayload(form));
        resetForm();
        onSuccess();
      } catch (err: unknown) {
        if (isAxiosError(err) && err.response?.status === 409) {
          setErrors((prev) => ({
            ...prev,
            email: "A user with this email already exists",
          }));
        } else {
          setErrors((prev) => ({ ...prev, form: extractApiError(err) }));
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [form, resetForm, onSuccess],
  );

  const updateField = useCallback(
    (field: "fullName" | "email", value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const updateRole = useCallback((role: AdminRole | null) => {
    setForm((prev) => ({ ...prev, role }));
  }, []);

  const updateEmployeeField = useCallback(
    (field: string, value: string) => {
      setForm((prev) => ({
        ...prev,
        [field as EmployeeFieldKey]: value,
      }));
    },
    [],
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        className="max-w-2xl"
        role="dialog"
        aria-labelledby="add-user-title"
        aria-modal="true"
      >
        <DialogHeader className="px-6 py-4 border-b border-gray-200">
          <DialogTitle
            id="add-user-title"
            className="text-lg font-semibold text-gray-900"
          >
            Add User
          </DialogTitle>
        </DialogHeader>

        <form
          className="overflow-y-auto max-h-[70vh] px-6 py-4 space-y-6"
          onSubmit={handleSubmit}
          aria-label="Add user form"
        >
          {/* Account section */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-primary uppercase tracking-wide pb-2 border-b border-gray-200 w-full">
              Account
            </legend>

            <div>
              <label
                htmlFor="new-full-name"
                className="block text-sm font-medium text-gray-900 mb-1"
              >
                Full name{" "}
                <span className="text-red-700" aria-hidden="true">
                  *
                </span>
              </label>
              <Input
                id="new-full-name"
                placeholder="e.g. Abena Owusu"
                autoComplete="name"
                value={form.fullName}
                onChange={(e) => updateField("fullName", e.target.value)}
                aria-required="true"
                aria-describedby={
                  errors.fullName ? "new-full-name-error" : undefined
                }
                className={errors.fullName ? "border-red-300" : ""}
              />
              {errors.fullName && (
                <p
                  id="new-full-name-error"
                  role="alert"
                  className="text-sm text-red-700 mt-1"
                >
                  {errors.fullName}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="new-email"
                className="block text-sm font-medium text-gray-900 mb-1"
              >
                Email address{" "}
                <span className="text-red-700" aria-hidden="true">
                  *
                </span>
              </label>
              <Input
                id="new-email"
                type="email"
                placeholder="e.g. name@mincom.gov.gh"
                autoComplete="email"
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
                aria-required="true"
                aria-describedby={
                  errors.email ? "new-email-error" : undefined
                }
                className={errors.email ? "border-red-300" : ""}
              />
              {errors.email && (
                <p
                  id="new-email-error"
                  role="alert"
                  className="text-sm text-red-700 mt-1"
                >
                  {errors.email}
                </p>
              )}
            </div>

            <RoleSelect
              id="new-role"
              selectedRole={form.role}
              onChange={updateRole}
              error={errors.role || undefined}
            />
          </fieldset>

          {/* Employee Profile section */}
          <EmployeeProfileFields
            employeeNumber={form.employeeNumber}
            jobTitle={form.jobTitle}
            jobFamily={form.jobFamily}
            departmentId={form.departmentId}
            location={form.location}
            classification={form.classification}
            managerId={form.managerId}
            matrixAppraiserId={form.matrixAppraiserId}
            departments={departments}
            locations={locations}
            jobFamilies={jobFamilies}
            isLookupsLoading={isLookupsLoading}
            isDepartmentsError={isLookupsError}
            errors={errors}
            onFieldChange={updateEmployeeField}
          />

          {errors.form && (
            <div
              role="alert"
              className="rounded-md bg-red-50 border border-red-300 px-4 py-3 text-sm text-red-700"
            >
              {errors.form}
            </div>
          )}

          <DialogFooter className="px-0 py-4 border-t border-gray-200 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || isLookupsError}
              className="bg-primary text-white hover:bg-primary-dark transition-colors duration-150"
            >
              {isSubmitting ? "Creating\u2026" : "Create User"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
