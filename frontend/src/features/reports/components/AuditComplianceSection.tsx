/**
 * AuditComplianceSection — Description card and PDF download button
 * for the audit compliance report.
 *
 * Shows a card explaining the report contents with a "Download PDF"
 * button that triggers a blob download. Handles loading, error, and
 * disabled (no cycle) states.
 */

import { useState, useCallback, useMemo } from "react";
import { Download, FileCheck, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { downloadAuditCompliancePdf } from "@/api/reports";
import { useCycles } from "@/features/appraisals/hooks/useCycles";

interface AuditComplianceSectionProps {
  cycleId?: string;
}

/**
 * Derive the cycle year from the cycle's period_name or start_date.
 * Returns the 4-digit year string, or "unknown" when unavailable.
 */
function deriveCycleYear(
  cycleId: string | undefined,
  cycles: ReadonlyArray<{ id: string; period_name: string; start_date: string }>,
): string {
  if (!cycleId) return "unknown";
  const cycle = cycles.find((c) => c.id === cycleId);
  if (!cycle) return "unknown";

  // Try to extract a 4-digit year from the period name first
  const yearMatch = cycle.period_name.match(/\b(20\d{2})\b/);
  if (yearMatch) return yearMatch[1];

  // Fallback: extract year from start_date (ISO format)
  const dateYear = cycle.start_date.slice(0, 4);
  return dateYear || "unknown";
}

export function AuditComplianceSection({ cycleId }: AuditComplianceSectionProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { cycles } = useCycles();

  const cycleYear = useMemo(
    () => deriveCycleYear(cycleId, cycles),
    [cycleId, cycles],
  );

  const handleDownload = useCallback(async () => {
    if (!cycleId) return;

    setErrorMessage(null);
    setIsDownloading(true);

    try {
      const filename = `audit-compliance-${cycleYear}.pdf`;
      await downloadAuditCompliancePdf(cycleId, filename);
    } catch {
      setErrorMessage(
        "Failed to download the audit compliance report. Please try again or contact support.",
      );
    } finally {
      setIsDownloading(false);
    }
  }, [cycleId, cycleYear]);

  const isDisabled = !cycleId || isDownloading;

  return (
    <section aria-label="Audit compliance report">
      <Card className="shadow-sm">
        <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200 px-6 py-4">
          <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <FileCheck className="h-5 w-5 text-secondary" aria-hidden="true" />
            Audit Compliance Report
          </CardTitle>
        </CardHeader>
        <CardContent className="px-6 py-6">
          <p className="text-sm text-gray-600 mb-6 max-w-2xl">
            Download a PDF document showing the complete sign-off chain for all
            appraisals in this cycle. Use this for audit and compliance reviews.
            The report includes appraiser and appraisee signatures, timestamps,
            and any dispute or rejection records.
          </p>

          <Button
            onClick={handleDownload}
            disabled={isDisabled}
            aria-label={
              isDownloading
                ? "Downloading audit compliance PDF"
                : "Download audit compliance PDF"
            }
          >
            {isDownloading ? (
              <Loader2
                className="mr-2 h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {isDownloading ? "Downloading..." : "Download PDF"}
          </Button>

          {!cycleId && (
            <p className="mt-3 text-sm text-gray-500" role="status">
              Select an appraisal cycle to enable the download.
            </p>
          )}

          {errorMessage && (
            <Alert variant="error" className="mt-4">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
