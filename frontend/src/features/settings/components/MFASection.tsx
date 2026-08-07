/**
 * MFASection — Manages MFA status display and actions.
 *
 * Fetches MFA status on mount and renders one of two states:
 * - MFA disabled: shows "Set Up MFA" button
 * - MFA enabled: shows "Disable MFA" and "Regenerate Recovery Codes" buttons
 *
 * Each action opens its respective dialog. After any successful action,
 * the MFA status is refetched to update the display.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { getMfaStatus } from "@/api";
import type { MfaStatusResponse } from "@/api";
import { MFASetupDialog } from "./MFASetupDialog";
import { MFADisableDialog } from "./MFADisableDialog";
import { RecoveryCodesDialog } from "./RecoveryCodesDialog";

function MFASection() {
  const [status, setStatus] = useState<MfaStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const hasFetched = useRef(false);

  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getMfaStatus();
      setStatus(data);
    } catch {
      setError("Failed to load MFA status.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    void fetchStatus();
  }, [fetchStatus]);

  const handleSetupSuccess = useCallback(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const handleDisableSuccess = useCallback(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const mfaEnabled = status?.is_mfa_enabled ?? false;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div />
        {!isLoading && status && (
          <Badge
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              mfaEnabled
                ? "bg-green-50 text-green-700 border border-green-300"
                : "bg-gray-100 text-gray-600 border border-gray-300"
            }`}
          >
            {mfaEnabled ? "Enabled" : "Disabled"}
          </Badge>
        )}
      </div>

      {isLoading && (
        <div
          className="flex items-center justify-center py-8"
          role="status"
          aria-label="Loading MFA status"
        >
          <Loader2 className="h-6 w-6 animate-spin text-secondary" />
        </div>
      )}

      {error && (
        <div className="space-y-3">
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void fetchStatus()}
          >
            Retry
          </Button>
        </div>
      )}

      {!isLoading && !error && mfaEnabled && (
        <div className="max-w-md space-y-5">
          <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
            Authenticator app is active. Use your app to generate codes when
            signing in.
          </div>

          <div className="space-y-1">
            <p className="text-sm font-medium text-gray-900">Backup Codes</p>
            <p className="text-xs text-gray-500">
              Backup codes let you sign in if you lose access to your
              authenticator app. Each code can only be used once.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 border-gray-200 text-primary"
              onClick={() => setRecoveryOpen(true)}
            >
              Regenerate Backup Codes
            </Button>
          </div>

          <div className="pt-3 border-t border-gray-200 space-y-1">
            <p className="text-sm font-medium text-red-700">Disable MFA</p>
            <p className="text-xs text-gray-500">
              Disabling MFA reduces your account security.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 border-red-300 text-red-700 hover:bg-red-50"
              onClick={() => setDisableOpen(true)}
            >
              Disable Two-Factor Authentication
            </Button>
          </div>
        </div>
      )}

      {!isLoading && !error && !mfaEnabled && (
        <div className="max-w-md space-y-4">
          <div
            className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3"
            role="note"
          >
            <span className="text-amber-700 text-sm font-medium">
              Your account is not protected by two-factor authentication.
            </span>
          </div>
          <p className="text-sm text-gray-500">
            Use an authenticator app (Google Authenticator, Authy) to scan
            the QR code and enable MFA.
          </p>
          <Button
            type="button"
            className="bg-primary text-white hover:bg-primary-dark"
            onClick={() => setSetupOpen(true)}
          >
            Set Up MFA
          </Button>
        </div>
      )}

      <MFASetupDialog
        isOpen={setupOpen}
        onClose={() => setSetupOpen(false)}
        onSuccess={handleSetupSuccess}
      />
      <MFADisableDialog
        isOpen={disableOpen}
        onClose={() => setDisableOpen(false)}
        onSuccess={handleDisableSuccess}
      />
      <RecoveryCodesDialog
        isOpen={recoveryOpen}
        onClose={() => setRecoveryOpen(false)}
      />
    </>
  );
}

export { MFASection };
