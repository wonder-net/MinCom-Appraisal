/**
 * EditUserDialog — Modal form for editing an existing user account.
 *
 * Email is read-only. Roles, name, employee number, and employee
 * profile fields are editable. Toggling is_active to false triggers
 * a DeactivateAlert confirmation.
 */

import { useState, useEffect, useCallback } from "react";
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
import { DeactivateAlert } from "./DeactivateAlert";
import { EmployeeProfileFields } from "./EmployeeProfileFields";
import { ResetMFAAlert } from "./ResetMFAAlert";
import { UnlockAccountAlert } from "./UnlockAccountAlert";
import {
  updateUser,
  resetUserMFA,
  isResetMFAError,
  unlockUser,
  isUnlockUserError,
} from "@/api/admin-users";
import { useEmployeeLookups } from "../hooks/useEmployeeLookups";
import { useAuth } from "@/auth/useAuth";
import { useToast } from "@/hooks/use-toast";
import { ToastContainer } from "@/components/toast-container";
import { extractApiError } from "@/utils/extract-api-error";
import type { AdminUser, AdminRole, EmployeeClassification, UpdateUserPayload } from "@/types";
import { ROLE_DISPLAY_LABELS } from "@/types";
import { isUUID } from "@/utils/validation";
import {
  type FormErrors,
  INITIAL_ERRORS,
  hasErrors,
} from "../utils/validate-user-form";

interface EditUserDialogProps {
  user: AdminUser | null;
  onClose: () => void;
  onSuccess: () => void;
  /**
   * Optional callback invoked after a non-form action mutates the user
   * (e.g. MFA reset). Parents typically pass a refetch handler so the
   * underlying user list reflects the change.
   */
  onUserChanged?: () => void;
}

interface EditFormState {
  fullName: string;
  /**
   * Single role at the UI layer. Pre-existing multi-role users keep
   * their first role pre-selected here; saving with a value reduces
   * their backend `roles` array to that single element.
   */
  role: AdminRole | null;
  isActive: boolean;
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

/**
 * Priority order for pre-selecting a role when a user has multiple
 * roles assigned. The role with the lowest index here that appears
 * in the user's roles array wins. This gives stable pre-selection
 * regardless of the order the backend returns the roles in.
 */
const ROLE_PRIORITY: AdminRole[] = [
  "HR_ADMIN",
  "SYSTEM_ADMIN",
  "HR_OFFICER",
  "EXECUTIVE",
  "MANAGER",
  "EMPLOYEE",
];

function pickPrimaryRole(roles: readonly AdminRole[]): AdminRole | null {
  for (const candidate of ROLE_PRIORITY) {
    if (roles.includes(candidate)) return candidate;
  }
  return roles[0] ?? null;
}

function buildInitialState(user: AdminUser): EditFormState {
  return {
    fullName: user.full_name,
    role: pickPrimaryRole(user.roles),
    isActive: user.is_active,
    employeeNumber: user.employee_number ?? "",
    jobTitle: user.job_title ?? "",
    jobFamily: user.job_family ?? "",
    departmentId: user.department_id ?? "",
    location: user.location ?? "",
    classification: user.classification ?? "",
    managerId: user.manager_id ?? "",
    matrixAppraiserId: user.matrix_appraiser_id ?? "",
  };
}

function validateEditForm(form: EditFormState): FormErrors {
  const errors: FormErrors = { ...INITIAL_ERRORS };

  if (!form.fullName.trim()) {
    errors.fullName = "Full name is required";
  }
  if (form.role === null) {
    errors.role = "Please select a role";
  }

  // Employee fields required if any employee field is filled
  const hasEmployee = Boolean(
    form.employeeNumber.trim() ||
    form.jobTitle.trim() ||
    form.jobFamily.trim() ||
    form.departmentId.trim() ||
    form.location.trim() ||
    form.classification ||
    form.managerId.trim() ||
    form.matrixAppraiserId.trim(),
  );

  if (hasEmployee) {
    if (!form.jobTitle.trim()) errors.jobTitle = "Job title is required";
    if (!form.departmentId.trim()) errors.departmentId = "Department is required";
    if (!form.classification) errors.classification = "Classification is required";
  }

  return errors;
}

function buildUpdatePayload(
  form: EditFormState,
  original: AdminUser,
): UpdateUserPayload {
  const payload: UpdateUserPayload = {};

  if (form.fullName !== original.full_name) payload.full_name = form.fullName;
  // Dirty-check the single UI role against the original (possibly
  // multi-element) roles array. If different, send the new single-
  // element array; backend contract is unchanged.
  const nextRoles: AdminRole[] = form.role ? [form.role] : [];
  if (JSON.stringify(nextRoles) !== JSON.stringify(original.roles)) {
    payload.roles = nextRoles;
  }
  if (form.isActive !== original.is_active) payload.is_active = form.isActive;
  if (form.employeeNumber !== (original.employee_number ?? "")) {
    payload.employee_number = form.employeeNumber || undefined;
  }
  if (form.jobTitle !== (original.job_title ?? "")) {
    payload.job_title = form.jobTitle || undefined;
  }
  if (form.jobFamily !== (original.job_family ?? "")) {
    payload.job_family = form.jobFamily || undefined;
  }
  if (form.departmentId !== (original.department_id ?? "")) {
    const deptValue = form.departmentId || undefined;
    if (deptValue) {
      if (isUUID(deptValue)) {
        payload.department_id = deptValue;
      } else {
        payload.department_name = deptValue;
      }
    }
  }
  if (form.location !== (original.location ?? "")) {
    payload.location = form.location || undefined;
  }
  if (form.classification !== (original.classification ?? "")) {
    payload.classification =
      (form.classification as EmployeeClassification) || undefined;
  }
  if (form.managerId !== (original.manager_id ?? "")) {
    payload.manager_id = form.managerId || null;
  }
  if (form.matrixAppraiserId !== (original.matrix_appraiser_id ?? "")) {
    payload.matrix_appraiser_id = form.matrixAppraiserId || null;
  }

  return payload;
}

export function EditUserDialog({
  user,
  onClose,
  onSuccess,
  onUserChanged,
}: EditUserDialogProps) {
  const { user: currentUser } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState<EditFormState>({
    fullName: "",
    role: null,
    isActive: true,
    employeeNumber: "",
    jobTitle: "",
    jobFamily: "",
    departmentId: "",
    location: "",
    classification: "",
    managerId: "",
    matrixAppraiserId: "",
  });
  const [errors, setErrors] = useState<FormErrors>(INITIAL_ERRORS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeactivateOpen, setIsDeactivateOpen] = useState(false);
  const [isResetMFAOpen, setIsResetMFAOpen] = useState(false);
  const [unlockAccountOpen, setUnlockAccountOpen] = useState(false);

  const { departments, locations, jobFamilies, isLoading: isLookupsLoading, isError: isLookupsError, refetch: refetchLookups } =
    useEmployeeLookups();

  useEffect(() => {
    if (user) {
      setForm(buildInitialState(user));
      setErrors(INITIAL_ERRORS);
      setIsSubmitting(false);
      setIsDeactivateOpen(false);
      setIsResetMFAOpen(false);
      setUnlockAccountOpen(false);
      // Re-fetch lookups so newly created departments appear in the dropdown.
      refetchLookups();
    }
  }, [user, refetchLookups]);

  const handleActiveToggle = useCallback((checked: boolean) => {
    if (!checked) {
      setIsDeactivateOpen(true);
    } else {
      setForm((prev) => ({ ...prev, isActive: true }));
    }
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user) return;

      const validationErrors = validateEditForm(form);
      setErrors(validationErrors);
      if (hasErrors(validationErrors)) return;

      setIsSubmitting(true);
      setErrors(INITIAL_ERRORS);

      try {
        const payload = buildUpdatePayload(form, user);
        await updateUser(user.id, payload);
        onSuccess();
      } catch (err: unknown) {
        setErrors((prev) => ({ ...prev, form: extractApiError(err) }));
      } finally {
        setIsSubmitting(false);
      }
    },
    [user, form, onSuccess],
  );

  const updateEmployeeField = useCallback(
    (field: string, value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const handleResetMFAConfirm = useCallback(
    async (password: string) => {
      if (!user) return;
      const target = user;
      try {
        await resetUserMFA(target.id, password);
        toast.success(
          `MFA reset for ${target.full_name} — they will set it up again on next sign-in`,
        );
        setIsResetMFAOpen(false);
        onUserChanged?.();
      } catch (err: unknown) {
        if (isResetMFAError(err) && err.code === "INVALID_PASSWORD") {
          // Let the alert dialog display the inline "Incorrect password" error.
          throw err;
        }
        if (isResetMFAError(err) && err.code === "MFA_NOT_ENABLED") {
          toast.error("This user does not have MFA enabled.");
          setIsResetMFAOpen(false);
          return;
        }
        if (isResetMFAError(err) && err.code === "SELF_RESET_NOT_ALLOWED") {
          toast.error("You cannot reset your own MFA from this screen.");
          setIsResetMFAOpen(false);
          return;
        }
        toast.error("Failed to reset MFA. Please try again.");
        setIsResetMFAOpen(false);
      }
    },
    [user, toast, onUserChanged],
  );

  const handleUnlockConfirm = useCallback(
    async (password: string) => {
      if (!user) return;
      const target = user;
      try {
        await unlockUser(target.id, password);
        toast.success(
          `${target.full_name}'s account has been unlocked — they can sign in immediately`,
        );
        setUnlockAccountOpen(false);
        onUserChanged?.();
      } catch (err: unknown) {
        if (isUnlockUserError(err) && err.code === "INVALID_PASSWORD") {
          // Let the alert dialog display the inline "Incorrect password" error.
          throw err;
        }
        if (isUnlockUserError(err) && err.code === "NOT_LOCKED") {
          toast.error("This user's account is not currently locked.");
          setUnlockAccountOpen(false);
          return;
        }
        if (isUnlockUserError(err) && err.code === "SELF_UNLOCK_NOT_ALLOWED") {
          toast.error(
            "You cannot unlock your own account from this screen.",
          );
          setUnlockAccountOpen(false);
          return;
        }
        toast.error("Failed to unlock account. Please try again.");
        setUnlockAccountOpen(false);
      }
    },
    [user, toast, onUserChanged],
  );

  if (!user) return null;

  // Combined gate: only show the Reset MFA action when the target user has
  // MFA enabled AND is not the currently-signed-in admin (the backend rejects
  // self-reset, but the UI should not even tempt it).
  const canResetMFA =
    user.mfa_enabled && currentUser !== null && user.id !== currentUser.id;

  // Combined gate: only show the Unlock account action when the target user
  // is currently locked AND is not the currently-signed-in admin (the backend
  // rejects self-unlock, but the UI should not even tempt it).
  const canUnlockAccount =
    user.is_locked && currentUser !== null && user.id !== currentUser.id;

  const showAccountActions = canResetMFA || canUnlockAccount;

  return (
    <>
      <Dialog open={!!user} onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          className="max-w-2xl"
          role="dialog"
          aria-labelledby="edit-user-title"
          aria-modal="true"
        >
          <DialogHeader className="px-6 py-4 border-b border-gray-200">
            <DialogTitle
              id="edit-user-title"
              className="text-lg font-semibold text-gray-900"
            >
              Edit User
            </DialogTitle>
          </DialogHeader>

          <form
            className="overflow-y-auto max-h-[70vh] px-6 py-4 space-y-6"
            onSubmit={handleSubmit}
            aria-label="Edit user form"
          >
            {/* Account section */}
            <fieldset className="space-y-4">
              <legend className="text-sm font-semibold text-primary uppercase tracking-wide pb-2 border-b border-gray-200 w-full">
                Account
              </legend>

              <div>
                <label
                  htmlFor="edit-email"
                  className="block text-sm font-medium text-gray-900 mb-1"
                >
                  Email address
                </label>
                <Input
                  id="edit-email"
                  type="email"
                  value={user.email}
                  readOnly
                  aria-readonly="true"
                  className="bg-gray-50 text-gray-500 cursor-default"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Email cannot be changed after account creation.
                </p>
              </div>

              <div>
                <label
                  htmlFor="edit-full-name"
                  className="block text-sm font-medium text-gray-900 mb-1"
                >
                  Full name{" "}
                  <span className="text-red-700" aria-hidden="true">
                    *
                  </span>
                </label>
                <Input
                  id="edit-full-name"
                  value={form.fullName}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      fullName: e.target.value,
                    }))
                  }
                  aria-required="true"
                  aria-describedby={
                    errors.fullName ? "edit-full-name-error" : undefined
                  }
                  className={errors.fullName ? "border-red-300" : ""}
                />
                {errors.fullName && (
                  <p
                    id="edit-full-name-error"
                    role="alert"
                    className="text-sm text-red-700 mt-1"
                  >
                    {errors.fullName}
                  </p>
                )}
              </div>

              {user.roles.length > 1 && (
                <div
                  role="status"
                  className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                >
                  This user currently has multiple roles:{" "}
                  {user.roles
                    .map((r) => ROLE_DISPLAY_LABELS[r] ?? r)
                    .join(", ")}
                  . Editing will reduce them to the selected role.
                </div>
              )}

              <RoleSelect
                id="edit-role"
                selectedRole={form.role}
                onChange={(role) =>
                  setForm((prev) => ({ ...prev, role }))
                }
                error={errors.role || undefined}
              />

              {/* Active toggle */}
              <div className="flex items-center justify-between rounded-md border border-gray-200 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    Account active
                  </p>
                  <p className="text-xs text-gray-500">
                    Deactivating will immediately log the user out.
                  </p>
                </div>
                <label
                  className="relative inline-flex items-center cursor-pointer"
                  aria-label="Toggle account active status"
                >
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => handleActiveToggle(e.target.checked)}
                    className="sr-only peer"
                    aria-label="Toggle account active status"
                  />
                  <div className="w-11 h-6 bg-gray-300 peer-focus:ring-2 peer-focus:ring-secondary rounded-full peer peer-checked:bg-accent after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:border-gray-300 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white" />
                </label>
              </div>
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
              managerName={user?.manager_name ?? undefined}
              matrixAppraiserId={form.matrixAppraiserId}
              matrixAppraiserName={user?.matrix_appraiser_name ?? undefined}
              departments={departments}
              locations={locations}
              jobFamilies={jobFamilies}
              isLookupsLoading={isLookupsLoading}
              isDepartmentsError={isLookupsError}
              errors={errors}
              employeeNumberReadOnly={false}
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

            {showAccountActions && (
              <section
                aria-labelledby="edit-user-account-actions-title"
                className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3"
              >
                <h3
                  id="edit-user-account-actions-title"
                  className="text-xs font-semibold uppercase tracking-wide text-gray-500"
                >
                  Account actions
                </h3>
                {canResetMFA && (
                  <div className="mt-2 flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        Reset multi-factor authentication
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Removes this user&rsquo;s MFA device. They will be
                        required to set up MFA again on next sign-in.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsResetMFAOpen(true)}
                      disabled={isSubmitting}
                      className="border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
                      aria-label={`Reset MFA for ${user.full_name}`}
                    >
                      Reset MFA
                    </Button>
                  </div>
                )}
                {canUnlockAccount && (
                  <div
                    className={`flex items-start justify-between gap-4 flex-wrap ${
                      canResetMFA
                        ? "mt-3 pt-3 border-t border-gray-200"
                        : "mt-2"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        Unlock account
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Releases the temporary sign-in lockout from too many
                        failed attempts. They can sign in again immediately.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setUnlockAccountOpen(true)}
                      disabled={isSubmitting}
                      className="border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
                      aria-label={`Unlock account for ${user.full_name}`}
                    >
                      Unlock account
                    </Button>
                  </div>
                )}
              </section>
            )}

            <DialogFooter className="px-0 py-4 border-t border-gray-200 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || isLookupsError}
                className="bg-primary text-white hover:bg-primary-dark transition-colors duration-150"
              >
                {isSubmitting ? "Saving\u2026" : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DeactivateAlert
        open={isDeactivateOpen}
        onConfirm={() => {
          setForm((prev) => ({ ...prev, isActive: false }));
          setIsDeactivateOpen(false);
        }}
        onCancel={() => setIsDeactivateOpen(false)}
      />

      <ResetMFAAlert
        open={isResetMFAOpen}
        user={user}
        onConfirm={handleResetMFAConfirm}
        onCancel={() => setIsResetMFAOpen(false)}
      />

      <UnlockAccountAlert
        open={unlockAccountOpen}
        user={user}
        onConfirm={handleUnlockConfirm}
        onCancel={() => setUnlockAccountOpen(false)}
      />

      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
    </>
  );
}
