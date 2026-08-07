/**
 * ChangePasswordForm — Allows users to change their password.
 *
 * Validates:
 * - current_password is required
 * - new_password minimum 8 characters
 * - confirm_new_password must match new_password
 *
 * On success: clears form, shows success toast.
 * On API error: displays error inline below the form.
 */

import { useCallback, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/auth/useAuth";
import { changePasswordApi } from "@/api";
import { extractApiError } from "@/utils/extract-api-error";
import { PasswordStrengthIndicator } from "@/components/ui/PasswordStrengthIndicator";

interface FormFields {
  current_password: string;
  new_password: string;
  confirm_new_password: string;
}

interface FormErrors {
  current_password?: string;
  new_password?: string;
  confirm_new_password?: string;
}

const INITIAL_FIELDS: FormFields = {
  current_password: "",
  new_password: "",
  confirm_new_password: "",
};

function validateFields(fields: FormFields): FormErrors {
  const errors: FormErrors = {};

  if (!fields.current_password.trim()) {
    errors.current_password = "Current password is required.";
  }

  if (!fields.new_password) {
    errors.new_password = "New password is required.";
  } else if (fields.new_password.length < 8) {
    errors.new_password = "Password must be at least 8 characters.";
  }

  if (!fields.confirm_new_password) {
    errors.confirm_new_password = "Please confirm your new password.";
  } else if (fields.confirm_new_password !== fields.new_password) {
    errors.confirm_new_password = "Passwords do not match.";
  }

  return errors;
}

const hasErrors = (errors: FormErrors): boolean =>
  Object.keys(errors).length > 0;

interface ChangePasswordFormProps {
  onSuccess?: () => void;
}

function ChangePasswordForm({ onSuccess }: ChangePasswordFormProps) {
  const { accessToken } = useAuth();
  const [fields, setFields] = useState<FormFields>(INITIAL_FIELDS);
  const [errors, setErrors] = useState<FormErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleChange = useCallback(
    (field: keyof FormFields) =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setFields((prev) => ({ ...prev, [field]: value }));
        setErrors((prev) => {
          const next = { ...prev };
          delete next[field];
          return next;
        });
        setApiError(null);
        setSuccessMessage(null);
      },
    [],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setApiError(null);
      setSuccessMessage(null);

      const validationErrors = validateFields(fields);
      setErrors(validationErrors);
      if (hasErrors(validationErrors)) return;
      if (!accessToken) return;

      setIsSubmitting(true);
      try {
        await changePasswordApi(
          fields.current_password,
          fields.new_password,
          fields.confirm_new_password,
          accessToken,
        );
        setFields(INITIAL_FIELDS);
        setErrors({});
        setSuccessMessage("Password changed successfully.");
        onSuccess?.();
      } catch (err: unknown) {
        setApiError(extractApiError(err));
      } finally {
        setIsSubmitting(false);
      }
    },
    [fields, accessToken, onSuccess],
  );

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="max-w-md space-y-4"
      noValidate
    >
      {successMessage && (
        <div
          className="flex items-center gap-2 rounded-md border border-green-300 bg-green-50 px-4 py-3"
          role="status"
        >
          <span className="text-sm text-green-700 font-medium">
            {successMessage}
          </span>
        </div>
      )}

      <div className="space-y-1">
        <Label
          htmlFor="current-password"
          className="text-sm font-medium text-gray-900"
        >
          Current Password <span className="text-red-600">*</span>
        </Label>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          className="h-10 border-gray-300 focus-visible:ring-2 focus-visible:ring-secondary"
          aria-required="true"
          aria-invalid={errors.current_password ? "true" : undefined}
          aria-describedby={
            errors.current_password ? "current-pwd-error" : undefined
          }
          value={fields.current_password}
          onChange={handleChange("current_password")}
          disabled={isSubmitting}
        />
        {errors.current_password && (
          <p
            id="current-pwd-error"
            className="text-sm text-red-600 mt-1"
            aria-live="polite"
          >
            {errors.current_password}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <Label
          htmlFor="new-password"
          className="text-sm font-medium text-gray-900"
        >
          New Password <span className="text-red-600">*</span>
        </Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          className="h-10 border-gray-300 focus-visible:ring-2 focus-visible:ring-secondary"
          aria-required="true"
          aria-invalid={errors.new_password ? "true" : undefined}
          aria-describedby={
            errors.new_password
              ? "new-pwd-error"
              : fields.new_password
                ? "new-pwd-indicator"
                : undefined
          }
          value={fields.new_password}
          onChange={handleChange("new_password")}
          disabled={isSubmitting}
        />
        {fields.new_password && (
          <div id="new-pwd-indicator">
            <PasswordStrengthIndicator
              password={fields.new_password}
              className="mt-2"
            />
          </div>
        )}
        {errors.new_password && (
          <p
            id="new-pwd-error"
            className="text-sm text-red-600 mt-1"
            aria-live="polite"
          >
            {errors.new_password}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <Label
          htmlFor="confirm-password"
          className="text-sm font-medium text-gray-900"
        >
          Confirm New Password <span className="text-red-600">*</span>
        </Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          className="h-10 border-gray-300 focus-visible:ring-2 focus-visible:ring-secondary"
          aria-required="true"
          aria-invalid={errors.confirm_new_password ? "true" : undefined}
          aria-describedby={
            errors.confirm_new_password ? "confirm-pwd-error" : undefined
          }
          value={fields.confirm_new_password}
          onChange={handleChange("confirm_new_password")}
          disabled={isSubmitting}
        />
        {errors.confirm_new_password && (
          <p
            id="confirm-pwd-error"
            className="text-sm text-red-600 mt-1"
            aria-live="polite"
          >
            {errors.confirm_new_password}
          </p>
        )}
      </div>

      {apiError && (
        <p className="text-sm text-red-600 mt-2" role="alert">
          {apiError}
        </p>
      )}

      <div className="pt-2">
        <button
          type="submit"
          className="h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
        >
          {isSubmitting && (
            <Loader2
              className="mr-2 h-4 w-4 animate-spin inline"
              aria-hidden="true"
            />
          )}
          {isSubmitting ? "Updating\u2026" : "Update Password"}
        </button>
      </div>
    </form>
  );
}

export { ChangePasswordForm };
