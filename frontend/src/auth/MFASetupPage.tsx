/**
 * MFASetupPage — First-time MFA setup for authenticated users.
 *
 * Step 1: Display QR code and secret key for authenticator app enrollment.
 * Step 2: Verify the TOTP code to confirm setup.
 * Step 3: Display recovery codes for the user to save.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/auth/useAuth";
import { mfaSetupApi, mfaSetupConfirmApi } from "@/api";
import { extractErrorMessage } from "@/auth/auth-utils";
import { MFASetupQRStep } from "./components/MFASetupQRStep";
import { MFASetupVerifyStep } from "./components/MFASetupVerifyStep";
import { RecoveryCodesDisplay } from "./components/RecoveryCodesDisplay";

type SetupStep = "loading" | "qr" | "verify" | "recovery" | "error";

function MFASetupPage() {
  const { accessToken, isAuthenticated, updateUser, mfaSetupRequired } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<SetupStep>("loading");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) {
      void navigate("/login", { replace: true });
      return;
    }

    if (hasFetched.current || !accessToken) return;
    hasFetched.current = true;
    void runSetup();
  }, [isAuthenticated, accessToken, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  const runSetup = useCallback(async () => {
    const token = accessToken;
    if (!token) return;
    setStep("loading");
    setError(null);
    try {
      const response = await mfaSetupApi(token);
      setQrCode(response.data.provisioning_uri);
      setSecret(response.data.secret);
      setStep("qr");
    } catch (err: unknown) {
      const message = extractErrorMessage(err);
      if (message.toLowerCase().includes("already enabled") || message.toLowerCase().includes("already set up")) {
        // Update user state directly so ProtectedRoute sees is_mfa_enabled: true
        // JWT refresh won't work because the refresh token carries stale claims
        updateUser({ is_mfa_enabled: true });
        void navigate("/appraisals", { replace: true });
        return;
      }
      setError(message);
      setStep("error");
    }
  }, [accessToken, navigate, updateUser]);

  const handleProceedToVerify = useCallback(() => {
    setStep("verify");
    setVerifyError(null);
  }, []);

  const handleVerify = useCallback(
    async (code: string) => {
      if (!accessToken) return;
      setIsVerifying(true);
      setVerifyError(null);

      try {
        const response = await mfaSetupConfirmApi(code, accessToken);
        setRecoveryCodes(response.data.recovery_codes);
        setStep("recovery");
      } catch (err: unknown) {
        setVerifyError(extractErrorMessage(err));
      } finally {
        setIsVerifying(false);
      }
    },
    [accessToken],
  );

  const handleBackToQR = useCallback(() => {
    setStep("qr");
    setVerifyError(null);
  }, []);

  const handleConfirmRecoveryCodes = useCallback(() => {
    // Update user state directly — JWT refresh won't work because
    // the refresh token carries stale is_mfa_enabled: false claims
    updateUser({ is_mfa_enabled: true });
    void navigate("/appraisals", { replace: true });
  }, [navigate, updateUser]);

  return (
    <main
      className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12"
      aria-label="Set up two-factor authentication"
    >
      <div className="mb-8 text-center" aria-hidden="true">
        <span className="text-2xl font-bold tracking-tight text-primary">
          MINCOM
        </span>
        <span className="block text-xs font-medium text-gray-500 mt-1 tracking-widest uppercase">
          Performance Appraisal
        </span>
      </div>

      <Card className="w-full max-w-md shadow-md border-gray-200">
        <CardContent className="px-8 py-8">
          {step === "loading" && (
            <div
              className="flex items-center justify-center py-12"
              role="status"
              aria-label="Loading MFA setup"
            >
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-secondary" />
            </div>
          )}

          {step === "error" && (
            <div className="space-y-4 text-center" role="alert">
              <h1 className="text-lg font-semibold text-gray-900">
                Setup Failed
              </h1>
              <p className="text-sm text-red-700">
                {error ?? "Could not initialise MFA setup."}
              </p>
              <div className="flex justify-center gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void runSetup()}
                >
                  Try Again
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void navigate("/login", { replace: true })}
                >
                  Return to Login
                </Button>
              </div>
            </div>
          )}

          {step === "qr" && (
            <>
              <MFASetupQRStep
                qrCode={qrCode}
                secret={secret}
                onProceed={handleProceedToVerify}
              />
              {!mfaSetupRequired && (
                <div className="mt-4 text-center">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => void navigate("/appraisals", { replace: true })}
                  >
                    Skip for now
                  </Button>
                </div>
              )}
            </>
          )}

          {step === "verify" && (
            <>
              <MFASetupVerifyStep
                onVerify={handleVerify}
                onBack={handleBackToQR}
                isLoading={isVerifying}
                error={verifyError}
              />
              {!mfaSetupRequired && (
                <div className="mt-4 text-center">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => void navigate("/appraisals", { replace: true })}
                  >
                    Skip for now
                  </Button>
                </div>
              )}
            </>
          )}

          {step === "recovery" && (
            <RecoveryCodesDisplay
              codes={recoveryCodes}
              onConfirm={handleConfirmRecoveryCodes}
            />
          )}
        </CardContent>
      </Card>
    </main>
  );
}

export default MFASetupPage;
