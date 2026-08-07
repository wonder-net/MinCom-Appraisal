/**
 * MFASetupDialog — Multi-step dialog for enabling MFA.
 *
 * Step 1: Calls setupMFA, shows QR code for scanning.
 * Step 2: TOTP code input to verify enrollment.
 * Step 3: Displays recovery codes on success.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/auth/useAuth";
import { mfaSetupApi, mfaSetupConfirmApi } from "@/api";
import { RecoveryCodesDisplay } from "@/auth/components/RecoveryCodesDisplay";
import { extractErrorMessage } from "@/auth/auth-utils";

type SetupStep = "loading" | "qr" | "verify" | "recovery";

interface MFASetupDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function MFASetupDialog({ isOpen, onClose, onSuccess }: MFASetupDialogProps) {
  const { accessToken } = useAuth();
  const [step, setStep] = useState<SetupStep>("loading");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      hasFetched.current = false;
      setStep("loading");
      setQrCodeUrl("");
      setSecret("");
      setCode("");
      setRecoveryCodes([]);
      setError(null);
      setIsVerifying(false);
      return;
    }

    if (hasFetched.current || !accessToken) return;
    hasFetched.current = true;

    const initSetup = async () => {
      try {
        const response = await mfaSetupApi(accessToken);
        setQrCodeUrl(response.data.provisioning_uri);
        setSecret(response.data.secret);
        setStep("qr");
      } catch (err: unknown) {
        setError(extractErrorMessage(err));
        setStep("qr");
      }
    };
    void initSetup();
  }, [isOpen, accessToken]);

  const handleCodeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value.replace(/\D/g, "").slice(0, 6);
      setCode(value);
    },
    [],
  );

  const handleVerify = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (code.length !== 6 || !accessToken) return;
      setIsVerifying(true);
      setError(null);

      try {
        const response = await mfaSetupConfirmApi(code, accessToken);
        setRecoveryCodes(response.data.recovery_codes);
        setStep("recovery");
      } catch (err: unknown) {
        setError(extractErrorMessage(err));
      } finally {
        setIsVerifying(false);
      }
    },
    [code, accessToken],
  );

  const handleConfirmRecoveryCodes = useCallback(() => {
    onSuccess();
    onClose();
  }, [onSuccess, onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        role="dialog"
        aria-labelledby="mfa-setup-title"
        aria-modal="true"
      >
        <DialogHeader>
          <DialogTitle id="mfa-setup-title">
            Set Up Two-Factor Authentication
          </DialogTitle>
        </DialogHeader>

        {step === "loading" && (
          <div
            className="flex items-center justify-center py-8"
            role="status"
            aria-label="Loading MFA setup"
          >
            <Loader2 className="h-8 w-8 animate-spin text-secondary" />
          </div>
        )}

        {step === "qr" && (
          <div className="space-y-4">
            {error && (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            )}
            {qrCodeUrl && (
              <>
                <p className="text-sm text-gray-500">
                  Scan this QR code with your authenticator app.
                </p>
                <div className="flex justify-center">
                  <div className="rounded-md border border-gray-200 bg-white p-3">
                    <QRCodeSVG
                      value={qrCodeUrl}
                      size={160}
                      level="M"
                      aria-label="MFA QR code"
                    />
                  </div>
                </div>
                {secret && (
                  <p className="text-xs text-gray-500 text-center">
                    Manual key:{" "}
                    <code className="font-mono text-gray-900">{secret}</code>
                  </p>
                )}
                <Button
                  type="button"
                  className="w-full bg-primary text-white hover:bg-primary-dark"
                  onClick={() => {
                    setStep("verify");
                    setError(null);
                  }}
                >
                  I have scanned the QR code
                </Button>
              </>
            )}
          </div>
        )}

        {step === "verify" && (
          <form
            onSubmit={(e) => void handleVerify(e)}
            className="space-y-4"
            noValidate
          >
            <p className="text-sm text-gray-500">
              Enter the 6-digit code from your authenticator app.
            </p>
            {error && (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            )}
            <div className="space-y-1">
              <Label
                htmlFor="totp-code"
                className="text-sm font-medium text-gray-900"
              >
                Verification code{" "}
                <span className="text-red-700">*</span>
              </Label>
              <Input
                id="totp-code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                className="h-10 w-36 border-gray-200 focus-visible:ring-2 focus-visible:ring-secondary tracking-[0.3em] text-center font-mono"
                aria-required="true"
                value={code}
                onChange={handleCodeChange}
                disabled={isVerifying}
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setStep("qr");
                  setError(null);
                }}
                disabled={isVerifying}
              >
                Back
              </Button>
              <Button
                type="submit"
                className="bg-primary text-white hover:bg-primary-dark"
                disabled={isVerifying || code.length !== 6}
                aria-busy={isVerifying}
              >
                {isVerifying && (
                  <Loader2
                    className="mr-2 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                )}
                {isVerifying ? "Verifying\u2026" : "Verify and Enable"}
              </Button>
            </div>
          </form>
        )}

        {step === "recovery" && (
          <RecoveryCodesDisplay
            codes={recoveryCodes}
            onConfirm={handleConfirmRecoveryCodes}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export { MFASetupDialog };
