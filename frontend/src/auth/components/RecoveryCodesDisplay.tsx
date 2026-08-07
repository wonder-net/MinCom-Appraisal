/**
 * RecoveryCodesDisplay — Shows recovery codes with copy and download actions.
 *
 * Renders codes in a grid with a copy-to-clipboard button and
 * a download-as-text-file button, plus a confirmation action.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Check, ClipboardCopy, Download, Loader2, XCircle } from "lucide-react";

interface RecoveryCodesDisplayProps {
  codes: string[];
  onConfirm: () => void | Promise<void>;
  isLoading?: boolean;
  error?: string | null;
}

function RecoveryCodesDisplay({ codes, onConfirm, isLoading = false, error = null }: RecoveryCodesDisplayProps) {
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

  const handleCopy = useCallback(async () => {
    const text = codes.join("\n");
    try {
      await navigator.clipboard.writeText(text);
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
  }, [codes]);

  const handleDownload = useCallback(() => {
    const text = codes.join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mincom-recovery-codes.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [codes]);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-gray-900">
          Recovery Codes
        </h2>
        <p className="text-sm text-gray-500">
          Save these codes in a secure place. Each code can only be used once.
        </p>
      </div>

      <div
        className="grid grid-cols-2 gap-2 rounded-md border border-gray-200 bg-gray-50 p-4"
        aria-label="Recovery codes"
      >
        {codes.map((code) => (
          <code
            key={code}
            className="text-sm font-mono text-gray-900 text-center py-1"
          >
            {code}
          </code>
        ))}
      </div>

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={() => void handleCopy()}
          aria-label={
            copied
              ? "Codes copied"
              : copyError
                ? "Failed to copy codes"
                : "Copy codes to clipboard"
          }
        >
          {copied ? (
            <Check className="mr-2 h-4 w-4" aria-hidden="true" />
          ) : copyError ? (
            <AlertTriangle className="mr-2 h-4 w-4" aria-hidden="true" />
          ) : (
            <ClipboardCopy className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          {copied ? "Copied" : copyError ? "Failed" : "Copy"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={handleDownload}
          aria-label="Download recovery codes as text file"
        >
          <Download className="mr-2 h-4 w-4" aria-hidden="true" />
          Download
        </Button>
      </div>

      {error && (
        <Alert variant="error" role="alert">
          <XCircle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription className="text-sm">{error}</AlertDescription>
        </Alert>
      )}

      <Button
        type="button"
        className="w-full"
        onClick={() => void onConfirm()}
        disabled={isLoading}
        aria-busy={isLoading}
        aria-label={isLoading ? "Confirming, please wait" : "I have saved these codes"}
      >
        {isLoading && (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        )}
        {isLoading ? "Confirming\u2026" : "I have saved these codes"}
      </Button>
    </div>
  );
}

export { RecoveryCodesDisplay };
export type { RecoveryCodesDisplayProps };
