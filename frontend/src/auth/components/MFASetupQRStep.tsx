/**
 * MFASetupQRStep — Displays the QR code and manual secret for TOTP enrollment.
 *
 * The user scans the QR code with their authenticator app, or
 * manually enters the secret key.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Check, ClipboardCopy } from "lucide-react";

interface MFASetupQRStepProps {
  qrCode: string;
  secret: string;
  onProceed: () => void;
}

function MFASetupQRStep({ qrCode, secret, onProceed }: MFASetupQRStepProps) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const handleCopySecret = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopied(false);
      setCopyError(true);
    }
    if (copyTimerRef.current !== null) {
      clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = setTimeout(() => {
      setCopied(false);
      setCopyError(false);
      copyTimerRef.current = null;
    }, 2000);
  }, [secret]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-gray-900">
          Set Up Two-Factor Authentication
        </h1>
        <p className="text-sm text-gray-500">
          Scan the QR code below with your authenticator app (e.g. Google
          Authenticator, Authy).
        </p>
      </div>

      <div className="flex justify-center">
        <div className="rounded-md border border-gray-200 bg-white p-3">
          <QRCodeSVG
            value={qrCode}
            size={176}
            level="M"
            aria-label="QR code for authenticator app setup"
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm text-gray-500">
          Or enter this key manually:
        </p>
        <div className="flex items-center gap-2">
          <code
            className="flex-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-mono text-gray-900 break-all"
            aria-label="Secret key for manual entry"
          >
            {secret}
          </code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleCopySecret()}
            aria-label={
              copied
                ? "Secret key copied"
                : copyError
                  ? "Failed to copy secret key"
                  : "Copy secret key to clipboard"
            }
          >
            {copied ? (
              <Check className="h-4 w-4" aria-hidden="true" />
            ) : copyError ? (
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ClipboardCopy className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>

      <Button type="button" className="w-full" onClick={onProceed}>
        I have scanned the QR code
      </Button>
    </div>
  );
}

export { MFASetupQRStep };
export type { MFASetupQRStepProps };
