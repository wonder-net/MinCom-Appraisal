/**
 * LoginForm — Credentials step of the login flow.
 *
 * Renders an identifier (email or PF number) + password field,
 * optional CAPTCHA, lockout countdown, and error alerts. Fully
 * controlled via props.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Eye, EyeOff, Loader2, XCircle } from "lucide-react";

/** Maximum identifier length — matches Django's email max_length. */
const IDENTIFIER_MAX_LENGTH = 254;

/**
 * Formats a duration in seconds as a human-readable string.
 * Examples: "13 minutes 27 seconds", "45 seconds", "1 minute".
 */
function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0 && seconds > 0) {
    return `${minutes} minute${minutes !== 1 ? "s" : ""} ${seconds} second${seconds !== 1 ? "s" : ""}`;
  }
  if (minutes > 0) {
    return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
  }
  return `${seconds} second${seconds !== 1 ? "s" : ""}`;
}

interface LoginFormProps {
  onSubmit: (
    identifier: string,
    password: string,
    captchaToken?: string,
  ) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  captchaRequired: boolean;
  lockoutSeconds: number | null;
  rememberMe: boolean;
  onRememberMeChange: (value: boolean) => void;
}

function LoginForm({
  onSubmit,
  isLoading,
  error,
  captchaRequired,
  lockoutSeconds,
  rememberMe,
  onRememberMeChange,
}: LoginFormProps) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [identifierError, setIdentifierError] = useState<string | null>(null);
  const [identifierTouched, setIdentifierTouched] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(lockoutSeconds ?? 0);
  const identifierRef = useRef<HTMLInputElement>(null);

  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
  const isTurnstileConfigured = Boolean(siteKey);
  const showCaptcha = captchaRequired && isTurnstileConfigured;

  useEffect(() => {
    identifierRef.current?.focus();
  }, []);

  useEffect(() => {
    setCountdown(lockoutSeconds ?? 0);
  }, [lockoutSeconds]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          clearInterval(timer);
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutSeconds]);

  // Expose captcha callback on window for Turnstile widget
  useEffect(() => {
    if (!showCaptcha) return;

    const callbackName = "__mincomTurnstileCallback";
    const win = window as unknown as Record<string, unknown>;
    win[callbackName] = (token: string) => {
      setCaptchaToken(token);
    };

    return () => {
      delete win[callbackName];
    };
  }, [showCaptcha]);

  const validateIdentifier = useCallback((value: string): boolean => {
    const trimmed = value.trim();
    if (!trimmed) {
      setIdentifierError("Email or PF number is required.");
      return false;
    }
    if (trimmed.length > IDENTIFIER_MAX_LENGTH) {
      setIdentifierError(
        `Must be ${IDENTIFIER_MAX_LENGTH} characters or fewer.`,
      );
      return false;
    }
    setIdentifierError(null);
    return true;
  }, []);

  const handleIdentifierBlur = useCallback(() => {
    // Only show validation errors after the user has interacted with the field.
    // Skip validation on the initial auto-focus blur (field is still empty
    // and the user hasn't typed anything yet).
    if (!identifier.trim()) return;
    setIdentifierTouched(true);
    validateIdentifier(identifier);
  }, [identifier, validateIdentifier]);

  const handleIdentifierChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setIdentifier(value);
      if (identifierTouched) {
        validateIdentifier(value);
      }
    },
    [identifierTouched, validateIdentifier],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const trimmedIdentifier = identifier.trim();
      if (!validateIdentifier(trimmedIdentifier)) return;
      if (!password.trim()) return;
      await onSubmit(trimmedIdentifier, password, captchaToken ?? undefined);
    },
    [identifier, password, captchaToken, onSubmit, validateIdentifier],
  );

  const isLocked = countdown > 0;
  const isCaptchaPending = showCaptcha && !captchaToken;
  const isSubmitDisabled = isLoading || isLocked || isCaptchaPending;

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="space-y-4"
      noValidate
    >
      {isLocked && (
        <Alert
          variant="warning"
          role="status"
          aria-live="polite"
        >
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription className="text-sm">
            Account locked due to too many failed attempts. Try again in{" "}
            {formatCountdown(countdown)}.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="error" role="alert">
          <XCircle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription className="text-sm">{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1">
        <Label htmlFor="identifier">
          Email or PF Number{" "}
          <span className="text-red-600" aria-hidden="true">
            *
          </span>
        </Label>
        <Input
          ref={identifierRef}
          id="identifier"
          type="text"
          autoComplete="username"
          aria-required="true"
          aria-invalid={identifierError ? "true" : undefined}
          aria-describedby={identifierError ? "identifier-error" : undefined}
          placeholder="name@mincom.gov.gh or PF number"
          maxLength={IDENTIFIER_MAX_LENGTH}
          value={identifier}
          onChange={handleIdentifierChange}
          onBlur={handleIdentifierBlur}
          disabled={isLoading}
        />
        {identifierError && (
          <p
            id="identifier-error"
            className="text-sm text-red-700"
            aria-live="polite"
          >
            {identifierError}
          </p>
        )}
        <p className="text-xs text-gray-500 mt-1">
          First time?{" "}
          <Link
            to="/help/public/getting-started/first-time-sign-in"
            className="text-secondary hover:underline"
          >
            First-time setup guide
          </Link>
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="password">
          Password{" "}
          <span className="text-red-600" aria-hidden="true">
            *
          </span>
        </Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            aria-required="true"
            placeholder="••••••••"
            className="pr-10"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
          />
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus-visible:ring-2 focus-visible:ring-secondary rounded"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword ? "true" : "false"}
            onClick={() => setShowPassword((prev) => !prev)}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
        <div className="flex justify-end">
          <Link
            to="/forgot-password"
            className="text-xs font-medium text-secondary hover:text-primary-dark hover:underline"
          >
            Forgot password?
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="remember-me"
          checked={rememberMe}
          onCheckedChange={(v) => onRememberMeChange(Boolean(v))}
        />
        <Label
          htmlFor="remember-me"
          className="text-sm font-normal cursor-pointer"
        >
          Keep me signed in
        </Label>
      </div>

      {showCaptcha && (
        <div
          className="cf-turnstile"
          data-sitekey={siteKey}
          data-callback="__mincomTurnstileCallback"
          aria-label="Human verification challenge"
          data-testid="turnstile-widget"
        />
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={isSubmitDisabled}
        aria-busy={isLoading}
        aria-label={isLoading ? "Signing in, please wait" : "Sign in"}
      >
        {isLoading && (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        )}
        {isLoading ? "Signing in…" : "Sign in"}
      </Button>

      <p className="text-center text-xs text-gray-500 mt-3">
        Need help signing in?{" "}
        <Link
          to="/help/public/getting-started/logging-in"
          className="text-secondary hover:underline"
        >
          Read the guide
        </Link>
      </p>
    </form>
  );
}

export { LoginForm };
export type { LoginFormProps };
