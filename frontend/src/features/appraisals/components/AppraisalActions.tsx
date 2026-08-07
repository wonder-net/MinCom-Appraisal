/**
 * AppraisalActions — HR Admin action buttons for the appraisal detail page.
 *
 * Renders Exclude, Re-include, Import Excel, and Export PDF buttons
 * based on the user's role, appraisal status, and relationship.
 */

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  excludeAppraisal,
  reincludeAppraisal,
  downloadAppraisalPDF,
} from "@/api/appraisals";
import { ExcludeDialog } from "./ExcludeDialog";
import { ReincludeDialog } from "./ReincludeDialog";
import { ImportExcelDialog } from "./ImportExcelDialog";
import { useToast } from "@/hooks/use-toast";
import { ToastContainer } from "@/components/toast-container";
import { extractCorrelationId, extractDetail } from "@/utils/extract-correlation-id";
import type { AppraisalStatus } from "@/types";

interface AppraisalActionsProps {
  appraisalId: string;
  status: AppraisalStatus;
  isHRAdmin: boolean;
  canExportPDF: boolean;
  onActionSuccess: () => void;
}

const TERMINAL: ReadonlySet<AppraisalStatus> = new Set([
  "SIGNED_OFF", "FINALISED", "EXCLUDED", "INCOMPLETE",
]);
const PDF_OK: ReadonlySet<AppraisalStatus> = new Set(["SIGNED_OFF", "FINALISED"]);
const IMPORT_OK: ReadonlySet<AppraisalStatus> = new Set(["SELF_ASSESSMENT"]);

function buildErrorMessage(err: unknown): string {
  const detail = extractDetail(err);
  const cid = extractCorrelationId(err);
  return cid ? `${detail}. Correlation: ${cid}` : detail;
}

export function AppraisalActions({
  appraisalId, status, isHRAdmin, canExportPDF, onActionSuccess,
}: AppraisalActionsProps) {
  const [confirmExclude, setConfirmExclude] = useState(false);
  const [confirmReinclude, setConfirmReinclude] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const { toasts, error: toastError, dismiss } = useToast();

  const showExclude = isHRAdmin && status !== "EXCLUDED" && !TERMINAL.has(status);
  const showReinclude = isHRAdmin && status === "EXCLUDED";
  const showImport = isHRAdmin && IMPORT_OK.has(status);
  const pdfEnabled = PDF_OK.has(status);

  const handleExclude = useCallback(async (reason: string) => {
    setIsSubmitting(true);
    try {
      await excludeAppraisal(appraisalId, { reason });
      setConfirmExclude(false);
      onActionSuccess();
    } catch (err: unknown) {
      setConfirmExclude(false);
      toastError(buildErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }, [appraisalId, onActionSuccess, toastError]);

  const handleReinclude = useCallback(async () => {
    setIsSubmitting(true);
    try {
      await reincludeAppraisal(appraisalId);
      setConfirmReinclude(false);
      onActionSuccess();
    } catch (err: unknown) {
      setConfirmReinclude(false);
      toastError(buildErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }, [appraisalId, onActionSuccess, toastError]);

  const handleDownloadPDF = useCallback(async () => {
    setIsDownloading(true);
    try {
      const blob = await downloadAppraisalPDF(appraisalId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `appraisal-${appraisalId}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (_err: unknown) {
      toastError("Failed to generate PDF. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  }, [appraisalId, toastError]);

  const handleImportSuccess = useCallback(() => {
    setIsImportOpen(false);
    onActionSuccess();
  }, [onActionSuccess]);

  const hasActions = showExclude || showReinclude || showImport || canExportPDF;
  if (!hasActions) return <ToastContainer toasts={toasts} onDismiss={dismiss} />;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {showExclude && (
          <Button variant="destructive" size="sm" onClick={() => setConfirmExclude(true)} disabled={isSubmitting} aria-label="Exclude appraisal">
            Exclude
          </Button>
        )}
        {showReinclude && (
          <Button variant="outline" size="sm" onClick={() => setConfirmReinclude(true)} disabled={isSubmitting} aria-label="Re-include appraisal">
            Re-include
          </Button>
        )}
        {showImport && (
          <Button variant="outline" size="sm" onClick={() => setIsImportOpen(true)} aria-label="Import Excel">
            Import Excel
          </Button>
        )}
        {canExportPDF && (
          <Button variant="outline" size="sm" onClick={() => void handleDownloadPDF()} disabled={!pdfEnabled || isDownloading} aria-label="Export PDF">
            {isDownloading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Exporting&hellip;
              </span>
            ) : "Export PDF"}
          </Button>
        )}
      </div>

      <ExcludeDialog open={confirmExclude} isSubmitting={isSubmitting} onConfirm={(r) => void handleExclude(r)} onCancel={() => setConfirmExclude(false)} />
      <ReincludeDialog open={confirmReinclude} isSubmitting={isSubmitting} onConfirm={() => void handleReinclude()} onCancel={() => setConfirmReinclude(false)} />
      <ImportExcelDialog appraisalId={appraisalId} isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} onSuccess={handleImportSuccess} />
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
