/**
 * RecoveryCodesDialog — Regenerates and displays new recovery codes.
 *
 * On open, calls regenerateRecoveryCodes API. Displays the new codes
 * with a "Copy all" button. Warns that codes will not be shown again.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, ClipboardCopy, Loader2 } from "lucide-react";
import { useAuth } from "@/auth/useAuth";
import { regenerateRecoveryCodesApi } from "@/api";
import { extractErrorMessage } from "@/auth/auth-utils";

interface RecoveryCodesDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

function RecoveryCodesDialog({ isOpen, onClose }: RecoveryCodesDialogProps) {
  const { accessToken } = useAuth();
  const [codes, setCodes] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const hasFetched = useRef(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      hasFetched.current = false;
      setCodes([]);
      setError(null);
      setCopied(false);
      return;
    }

    if (hasFetched.current || !accessToken) return;
    hasFetched.current = true;

    const regenerate = async () => {
      setIsLoading(true);
      try {
        const response = await regenerateRecoveryCodesApi(accessToken);
        setCodes(response.data.recovery_codes);
      } catch (err: unknown) {
        setError(extractErrorMessage(err));
      } finally {
        setIsLoading(false);
      }
    };
    void regenerate();
  }, [isOpen, accessToken]);

  const handleCopyAll = useCallback(async () => {
    const text = codes.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (copyTimerRef.current !== null) {
        clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = setTimeout(() => {
        setCopied(false);
        copyTimerRef.current = null;
      }, 2000);
    } catch {
      // Clipboard API may not be available; silently fail
    }
  }, [codes]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        role="dialog"
        aria-labelledby="recovery-codes-title"
        aria-modal="true"
      >
        <DialogHeader>
          <DialogTitle id="recovery-codes-title">
            Recovery Codes
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div
            className="flex items-center justify-center py-8"
            role="status"
            aria-label="Regenerating recovery codes"
          >
            <Loader2 className="h-8 w-8 animate-spin text-secondary" />
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        {!isLoading && !error && codes.length > 0 && (
          <div className="space-y-4">
            <div
              className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3"
              role="alert"
            >
              <span className="text-sm text-amber-700 font-medium">
                These codes will not be shown again. Save them in a secure
                place.
              </span>
            </div>

            <div
              className="grid grid-cols-2 gap-2 rounded-md border border-gray-200 bg-gray-50 p-4"
              aria-label="Recovery codes"
            >
              {codes.map((c) => (
                <code
                  key={c}
                  className="text-sm font-mono text-gray-900 text-center py-1"
                >
                  {c}
                </code>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => void handleCopyAll()}
              aria-label={copied ? "Codes copied" : "Copy all codes"}
            >
              {copied ? (
                <Check className="mr-2 h-4 w-4" aria-hidden="true" />
              ) : (
                <ClipboardCopy className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {copied ? "Copied" : "Copy all"}
            </Button>

            <Button
              type="button"
              className="w-full bg-primary text-white hover:bg-primary-dark"
              onClick={onClose}
            >
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export { RecoveryCodesDialog };
