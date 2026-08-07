/**
 * MFAVerifyForm — TOTP / recovery code input step.
 *
 * Renders either a 6-digit TOTP input or a recovery code text input,
 * toggled by a ghost button. Fully controlled via props.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, XCircle } from "lucide-react";

/** Recovery codes follow the pattern XXXX-XXXX-XXXX (alphanumeric groups separated by hyphens). */
const RECOVERY_CODE_PATTERN = /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/;

interface MFAVerifyFormProps {
  onSubmit: (code: string) => Promise<void>;
  onRecoveryCode: (code: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

function MFAVerifyForm({
  onSubmit,
  onRecoveryCode,
  isLoading,
  error,
}: MFAVerifyFormProps) {
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryFormatError, setRecoveryFormatError] = useState<string | null>(null);
  const totpRef = useRef<HTMLInputElement>(null);
  const recoveryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (recoveryMode) {
      recoveryRef.current?.focus();
    } else {
      totpRef.current?.focus();
    }
  }, [recoveryMode]);

  // Auto-focus TOTP input on mount
  useEffect(() => {
    totpRef.current?.focus();
  }, []);

  const handleTotpChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value.replace(/\D/g, "").slice(0, 6);
      setTotpCode(value);
    },
    [],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setRecoveryFormatError(null);
      if (recoveryMode) {
        const trimmed = recoveryCode.trim();
        if (!trimmed) return;
        if (!RECOVERY_CODE_PATTERN.test(trimmed)) {
          setRecoveryFormatError("Recovery code must match the format XXXX-XXXX-XXXX.");
          return;
        }
        await onRecoveryCode(trimmed.toUpperCase());
      } else {
        if (totpCode.length !== 6) return;
        await onSubmit(totpCode);
      }
    },
    [recoveryMode, totpCode, recoveryCode, onSubmit, onRecoveryCode],
  );

  const toggleRecoveryMode = useCallback(() => {
    setRecoveryMode((prev) => !prev);
    setTotpCode("");
    setRecoveryCode("");
    setRecoveryFormatError(null);
  }, []);

  const heading = recoveryMode
    ? "Enter Recovery Code"
    : "Two-Factor Authentication";

  const description = recoveryMode
    ? "Enter one of your saved recovery codes."
    : "Enter the 6-digit code from your authenticator app.";

  const submitLabel = recoveryMode ? "Use Recovery Code" : "Verify Code";
  const loadingLabel = "Verifying\u2026";

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="space-y-4"
      noValidate
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-gray-900">{heading}</h2>
        <p className="text-sm text-gray-500">{description}</p>
      </div>

      {error && (
        <Alert variant="error" role="alert">
          <XCircle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription className="text-sm">{error}</AlertDescription>
        </Alert>
      )}

      {!recoveryMode && (
        <div className="space-y-1">
          <Label htmlFor="totp-code">
            Verification code{" "}
            <span className="text-red-600" aria-hidden="true">
              *
            </span>
          </Label>
          <Input
            ref={totpRef}
            id="totp-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            aria-label="6-digit verification code"
            aria-required="true"
            className="tracking-widest text-center text-lg font-mono"
            value={totpCode}
            onChange={handleTotpChange}
            disabled={isLoading}
          />
        </div>
      )}

      {recoveryMode && (
        <div className="space-y-1">
          <Label htmlFor="recovery-code">
            Recovery code{" "}
            <span className="text-red-600" aria-hidden="true">
              *
            </span>
          </Label>
          <Input
            ref={recoveryRef}
            id="recovery-code"
            type="text"
            placeholder="XXXX-XXXX-XXXX"
            aria-label="Recovery code"
            aria-required="true"
            aria-invalid={recoveryFormatError ? "true" : undefined}
            aria-describedby={recoveryFormatError ? "recovery-code-error" : undefined}
            className="font-mono"
            value={recoveryCode}
            onChange={(e) => {
              setRecoveryCode(e.target.value);
              setRecoveryFormatError(null);
            }}
            disabled={isLoading}
          />
          {recoveryFormatError && (
            <p id="recovery-code-error" className="text-sm text-red-600" role="alert">
              {recoveryFormatError}
            </p>
          )}
        </div>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={isLoading}
        aria-busy={isLoading}
        aria-label={isLoading ? "Verifying, please wait" : submitLabel}
      >
        {isLoading && (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        )}
        {isLoading ? loadingLabel : submitLabel}
      </Button>

      <div className="text-center">
        <Button
          type="button"
          variant="ghost"
          className="text-sm text-secondary hover:text-primary-dark hover:bg-primary-light"
          onClick={toggleRecoveryMode}
          disabled={isLoading}
        >
          {recoveryMode
            ? "Use authenticator code instead"
            : "Use a recovery code instead"}
        </Button>
      </div>
    </form>
  );
}

export { MFAVerifyForm };
export type { MFAVerifyFormProps };
