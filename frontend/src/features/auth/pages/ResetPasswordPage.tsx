/**
 * ResetPasswordPage — Public page for setting a new password via a reset token.
 *
 * Reads the `token` query parameter from the URL. If no token is present,
 * shows an error state with a link to request a new reset link.
 *
 * On successful password reset, shows a success message with a link to
 * sign in. On API error, displays the error inline and keeps the form usable.
 *
 * Authenticated users are redirected to /appraisals.
 */

import { useCallback, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PasswordStrengthIndicator } from "@/components/ui/PasswordStrengthIndicator";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/auth/useAuth";
import { confirmPasswordReset } from "@/api/auth-api";
import { extractApiError } from "@/utils/extract-api-error";

const MIN_PASSWORD_LENGTH = 8;

interface FieldErrors {
  password: string | null;
  confirm: string | null;
}

function ResetPasswordPage() {
  const { isAuthenticated } = useAuth();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({
    password: null,
    confirm: null,
  });
  const [apiError, setApiError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  const validate = useCallback((): boolean => {
    const errors: FieldErrors = { password: null, confirm: null };
    let valid = true;

    if (!password) {
      errors.password = "Password is required.";
      valid = false;
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
      valid = false;
    }

    if (!confirm) {
      errors.confirm = "Please confirm your password.";
      valid = false;
    } else if (password !== confirm) {
      errors.confirm = "Passwords do not match.";
      valid = false;
    }

    setFieldErrors(errors);
    return valid;
  }, [password, confirm]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!validate() || !token) return;

      setIsLoading(true);
      setApiError(null);

      try {
        await confirmPasswordReset(token, password, confirm);
        setSucceeded(true);
      } catch (err: unknown) {
        setApiError(extractApiError(err));
      } finally {
        setIsLoading(false);
      }
    },
    [validate, token, password, confirm],
  );

  if (isAuthenticated) {
    return <Navigate to="/appraisals" replace />;
  }

  return (
    <main
      className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12"
      aria-label="Set a new password"
    >
      <a
        href="#reset-form"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-white px-4 py-2 rounded text-sm font-medium text-primary focus-visible:ring-2 focus-visible:ring-secondary"
      >
        Skip to form
      </a>

      <div className="mb-8 text-center">
        <img
          src={`${import.meta.env.BASE_URL}images/logo-login.png`}
          srcSet={`${import.meta.env.BASE_URL}images/logo-login@2x.png 2x`}
          alt="Minerals Commission Ghana"
          className="w-24 h-24 mx-auto mb-4 object-contain"
        />
        <span className="text-2xl font-bold tracking-tight text-primary block">
          MINCOM
        </span>
        <span className="block text-xs font-medium text-gray-500 mt-1 tracking-widest uppercase">
          Performance Appraisal
        </span>
      </div>

      <Card className="w-full max-w-md shadow-md border-gray-200">
        <CardContent id="reset-form" className="px-8 py-8">
          <h1 className="text-2xl font-semibold text-gray-900 mb-6">
            Set a new password
          </h1>

          {!token ? (
            <InvalidTokenState />
          ) : succeeded ? (
            <SuccessState />
          ) : (
            <ResetForm
              password={password}
              confirm={confirm}
              showPassword={showPassword}
              showConfirm={showConfirm}
              fieldErrors={fieldErrors}
              apiError={apiError}
              isLoading={isLoading}
              onPasswordChange={setPassword}
              onConfirmChange={setConfirm}
              onTogglePassword={() => setShowPassword((p) => !p)}
              onToggleConfirm={() => setShowConfirm((p) => !p)}
              onSubmit={(e) => void handleSubmit(e)}
            />
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function InvalidTokenState() {
  return (
    <>
      <Alert variant="error" role="alert">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        <AlertDescription>
          This reset link is invalid or has expired.
        </AlertDescription>
      </Alert>
      <div className="mt-6 text-center">
        <Link
          to="/forgot-password"
          className="text-sm font-medium text-secondary hover:text-primary-dark hover:underline"
        >
          Request a new reset link
        </Link>
      </div>
    </>
  );
}

function SuccessState() {
  return (
    <>
      <div aria-live="polite">
        <Alert variant="success">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>
            Password reset successfully. You can now log in.
          </AlertDescription>
        </Alert>
      </div>
      <div className="mt-6 text-center">
        <Link
          to="/login"
          className="text-sm font-medium text-secondary hover:text-primary-dark hover:underline"
        >
          Go to sign in
        </Link>
      </div>
    </>
  );
}

interface ResetFormProps {
  password: string;
  confirm: string;
  showPassword: boolean;
  showConfirm: boolean;
  fieldErrors: FieldErrors;
  apiError: string | null;
  isLoading: boolean;
  onPasswordChange: (value: string) => void;
  onConfirmChange: (value: string) => void;
  onTogglePassword: () => void;
  onToggleConfirm: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

function ResetForm({
  password,
  confirm,
  showPassword,
  showConfirm,
  fieldErrors,
  apiError,
  isLoading,
  onPasswordChange,
  onConfirmChange,
  onTogglePassword,
  onToggleConfirm,
  onSubmit,
}: ResetFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {apiError && (
        <Alert variant="error" role="alert">
          <XCircle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>{apiError}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1">
        <Label htmlFor="new-password">
          New password{" "}
          <span className="text-red-600" aria-hidden="true">
            *
          </span>
        </Label>
        <div className="relative">
          <Input
            id="new-password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            aria-required="true"
            aria-invalid={fieldErrors.password ? "true" : undefined}
            aria-describedby={
              [
                fieldErrors.password ? "password-error" : null,
                password.length > 0 ? "reset-pwd-indicator" : null,
              ]
                .filter(Boolean)
                .join(" ") || undefined
            }
            placeholder="••••••••••••"
            className="pr-10"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            disabled={isLoading}
          />
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus-visible:ring-2 focus-visible:ring-secondary rounded"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-controls="new-password"
            onClick={onTogglePassword}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
        {password && (
          <div id="reset-pwd-indicator">
            <PasswordStrengthIndicator password={password} className="mt-2" />
          </div>
        )}
        {fieldErrors.password && (
          <p
            id="password-error"
            className="text-sm text-red-700"
            aria-live="polite"
          >
            {fieldErrors.password}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="confirm-password">
          Confirm new password{" "}
          <span className="text-red-600" aria-hidden="true">
            *
          </span>
        </Label>
        <div className="relative">
          <Input
            id="confirm-password"
            type={showConfirm ? "text" : "password"}
            autoComplete="new-password"
            aria-required="true"
            aria-invalid={fieldErrors.confirm ? "true" : undefined}
            aria-describedby={
              fieldErrors.confirm ? "confirm-error" : undefined
            }
            placeholder="••••••••••••"
            className="pr-10"
            value={confirm}
            onChange={(e) => onConfirmChange(e.target.value)}
            disabled={isLoading}
          />
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus-visible:ring-2 focus-visible:ring-secondary rounded"
            aria-label={
              showConfirm ? "Hide confirm password" : "Show confirm password"
            }
            aria-controls="confirm-password"
            onClick={onToggleConfirm}
          >
            {showConfirm ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
        {fieldErrors.confirm && (
          <p
            id="confirm-error"
            className="text-sm text-red-700"
            aria-live="polite"
          >
            {fieldErrors.confirm}
          </p>
        )}
      </div>

      <Button
        type="submit"
        className="w-full"
        disabled={isLoading}
        aria-busy={isLoading}
        aria-label={
          isLoading ? "Resetting password, please wait" : "Reset password"
        }
      >
        {isLoading && (
          <Loader2
            className="mr-2 h-4 w-4 animate-spin"
            aria-hidden="true"
          />
        )}
        {isLoading ? "Resetting\u2026" : "Reset password"}
      </Button>

      <div className="mt-2 text-center">
        <Link
          to="/login"
          className="text-sm font-medium text-secondary hover:text-primary-dark hover:underline"
        >
          &larr; Back to sign in
        </Link>
      </div>
    </form>
  );
}

export default ResetPasswordPage;
