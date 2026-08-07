/**
 * CSVExportButton — Triggers a bulk CSV download of appraisal data.
 *
 * Renders only for HR_ADMIN users. Shows a loading spinner while
 * the download is in progress and an error alert on failure.
 */

import { useState, useCallback } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/auth/useAuth";
import { downloadAppraisalsCSV } from "@/api/reports";

interface CSVExportButtonProps {
  cycleId?: string;
}

export function CSVExportButton({ cycleId }: CSVExportButtonProps) {
  const { user } = useAuth();
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isHRAdmin = user?.roles.some((role) => role === "HR_ADMIN") ?? false;

  const handleExport = useCallback(async () => {
    setErrorMessage(null);
    setIsExporting(true);
    try {
      await downloadAppraisalsCSV(cycleId);
    } catch {
      setErrorMessage(
        "Failed to export CSV. Please try again or contact support.",
      );
    } finally {
      setIsExporting(false);
    }
  }, [cycleId]);

  if (!isHRAdmin) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleExport}
        disabled={isExporting}
        aria-label="Export appraisals as CSV"
      >
        {isExporting ? (
          <Loader2
            className="mr-2 h-4 w-4 animate-spin"
            aria-hidden="true"
          />
        ) : (
          <Download className="mr-2 h-4 w-4" aria-hidden="true" />
        )}
        {isExporting ? "Exporting..." : "Export CSV"}
      </Button>
      {errorMessage && (
        <Alert variant="error" className="mt-1">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
