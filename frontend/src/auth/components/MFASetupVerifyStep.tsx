/**
 * MFASetupVerifyStep — TOTP code verification during MFA setup.
 *
 * The user enters the 6-digit code from their authenticator app
 * to confirm the TOTP enrollment.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, XCircle } from "lucide-react";

interface MFASetupVerifyStepProps {
  onVerify: (code: string) => Promise<void>;
  onBack: () => void;
  isLoading: boolean;
  error: string | null;
}

function MFASetupVerifyStep({
  onVerify,
  onBack,
  isLoading,
  error,
}: MFASetupVerifyStepProps) {
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleCodeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value.replace(/\D/g, "").slice(0, 6);
      setCode(value);
    },
    [],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (code.length !== 6) return;
      await onVerify(code);
    },
    [code, onVerify],
  );

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="space-y-4"
      noValidate
    >
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-gray-900">
          Verify Your Code
        </h1>
        <p className="text-sm text-gray-500">
          Enter the 6-digit code from your authenticator app to complete setup.
        </p>
      </div>

      {error && (
        <Alert variant="error" role="alert">
          <XCircle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription className="text-sm">{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1">
        <Label htmlFor="setup-totp-code">
          Verification code{" "}
          <span className="text-red-600" aria-hidden="true">
            *
          </span>
        </Label>
        <Input
          ref={inputRef}
          id="setup-totp-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          aria-label="6-digit verification code"
          aria-required="true"
          className="tracking-widest text-center text-lg font-mono"
          value={code}
          onChange={handleCodeChange}
          disabled={isLoading}
        />
      </div>

      <Button
        type="submit"
        className="w-full"
        disabled={isLoading || code.length !== 6}
        aria-busy={isLoading}
        aria-label={isLoading ? "Verifying, please wait" : "Verify and activate"}
      >
        {isLoading && (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        )}
        {isLoading ? "Verifying\u2026" : "Verify and Activate"}
      </Button>

      <div className="text-center">
        <Button
          type="button"
          variant="ghost"
          className="text-sm text-secondary hover:text-primary-dark hover:bg-primary-light"
          onClick={onBack}
          disabled={isLoading}
        >
          &larr; Back to QR code
        </Button>
      </div>
    </form>
  );
}

export { MFASetupVerifyStep };
export type { MFASetupVerifyStepProps };
