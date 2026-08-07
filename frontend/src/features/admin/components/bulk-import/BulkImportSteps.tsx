/**
 * Step components for the BulkImportDialog (TASK-304).
 *
 * Each function renders a single phase of the async import flow.
 * Splitting them out keeps the parent dialog file under the
 * project-wide 200-line ceiling.
 */

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  downloadBulkImportTemplate,
  downloadBulkImportCsvTemplate,
} from "@/api/admin-users";
import type { BulkImportJob } from "../../types/bulkImportJob";
import { BulkImportProgressBar } from "../BulkImportProgressBar";

export function CenteredSpinner({ label }: { label: string }) {
  return (
    <div
      className="flex flex-col items-center py-8 gap-3"
      role="status"
      aria-live="polite"
    >
      <span
        className="h-8 w-8 rounded-full border-3 border-gray-300 border-t-primary animate-spin"
        aria-hidden="true"
      />
      <p className="text-sm text-gray-600">{label}</p>
    </div>
  );
}

interface IdleStepProps {
  file: File | null;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUpload: () => void;
  onClose: () => void;
  onDownloadError: (msg: string) => void;
}

export function IdleStep({
  file,
  fileInputRef,
  onFileChange,
  onUpload,
  onClose,
  onDownloadError,
}: IdleStepProps) {
  const downloadTemplate = async (kind: "xlsx" | "csv"): Promise<void> => {
    try {
      const blob =
        kind === "xlsx"
          ? await downloadBulkImportTemplate()
          : await downloadBulkImportCsvTemplate();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `bulk_import_template.${kind}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      onDownloadError("Failed to download template.");
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Upload a .xlsx or .csv file with employee data. Each row will create a
        user account and employee profile.
      </p>
      <div className="flex items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.csv"
          onChange={onFileChange}
          className="text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded file:border file:border-gray-300 file:text-sm file:font-medium file:bg-white file:text-gray-700 hover:file:bg-gray-50"
        />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="text-sm text-blue-700 hover:text-blue-900 underline"
            onClick={() => void downloadTemplate("xlsx")}
          >
            Download .xlsx Template
          </button>
          <button
            type="button"
            className="text-sm text-blue-700 hover:text-blue-900 underline"
            onClick={() => void downloadTemplate("csv")}
          >
            Download .csv Template
          </button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            className="bg-primary text-white hover:bg-primary-dark"
            disabled={!file}
            onClick={onUpload}
          >
            Upload &amp; Validate
          </Button>
        </div>
      </div>
    </div>
  );
}

interface PreviewStepProps {
  job: BulkImportJob;
  isCommitting: boolean;
  commitError: string | null;
  onCommit: () => void;
  onClose: () => void;
}

export function PreviewStep({
  job,
  isCommitting,
  commitError,
  onCommit,
  onClose,
}: PreviewStepProps) {
  const preview = job.validation_preview;
  if (!preview) return null;

  const validCount = preview.valid_rows.length;
  const errorCount = preview.error_rows.length;
  const total = validCount + errorCount;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <SummaryCell value={total} label="Total Rows" />
        <SummaryCell value={validCount} label="Ready to Import" tone="success" />
        <SummaryCell value={errorCount} label="Errors" tone="error" />
      </div>

      {preview.new_departments.length > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-sm font-medium text-blue-800">
            New departments to be created:
          </p>
          <p className="text-sm text-blue-700 mt-1">
            {preview.new_departments.join(", ")}
          </p>
        </div>
      )}

      {preview.error_rows.length > 0 && (
        <div className="max-h-48 overflow-auto rounded border border-red-200">
          <table className="w-full text-xs">
            <thead className="bg-red-50 sticky top-0">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium text-red-800">Row</th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-red-800">Employee</th>
                <th scope="col" className="px-3 py-2 text-left font-medium text-red-800">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-red-100">
              {preview.error_rows.map((row) => (
                <tr key={row.row_number} className="bg-white">
                  <td className="px-3 py-2 text-gray-600">{row.row_number}</td>
                  <td className="px-3 py-2 text-gray-900">{row.employee_number || row.email}</td>
                  <td className="px-3 py-2 text-red-700">{row.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {commitError && (
        <Alert variant="error">
          <AlertDescription>{commitError}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onClose} disabled={isCommitting}>
          Cancel
        </Button>
        {validCount > 0 && (
          <Button
            size="sm"
            className="bg-primary text-white hover:bg-primary-dark"
            onClick={onCommit}
            disabled={isCommitting}
          >
            {isCommitting
              ? "Starting..."
              : `Commit Import (${validCount} user${validCount === 1 ? "" : "s"})`}
          </Button>
        )}
      </div>
    </div>
  );
}

function SummaryCell({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone?: "success" | "error";
}) {
  const tones = {
    default: "border-gray-200",
    success: "border-emerald-200 bg-emerald-50",
    error: "border-red-200 bg-red-50",
  } as const;
  const textTones = {
    default: "text-gray-900",
    success: "text-emerald-700",
    error: "text-red-700",
  } as const;
  const subTones = {
    default: "text-gray-500",
    success: "text-emerald-600",
    error: "text-red-600",
  } as const;
  const key = tone ?? "default";
  return (
    <div className={`rounded-lg border p-3 text-center ${tones[key]}`}>
      <p className={`text-2xl font-bold ${textTones[key]}`}>{value}</p>
      <p className={`text-xs ${subTones[key]}`}>{label}</p>
    </div>
  );
}

interface CommittingStepProps {
  job: BulkImportJob;
  jobError: string | null;
}

export function CommittingStep({ job, jobError }: CommittingStepProps) {
  return (
    <div className="space-y-4 py-4">
      <p className="text-sm text-gray-700">
        Creating user accounts. You can safely close this dialog — the job
        will continue in the background and you will receive an email when
        the import completes.
      </p>
      <BulkImportProgressBar
        processedRows={job.processed_rows}
        totalRows={job.total_rows}
        startedAt={job.commit_started_at}
      />
      {jobError && (
        <p className="text-xs text-amber-700" role="status">
          Temporarily lost connection — retrying...
        </p>
      )}
      {/* TODO: cancel job — backend does not support cancellation yet */}
    </div>
  );
}

interface TerminalStepProps {
  variant: "success" | "warning" | "error";
  title: string;
  onClose: () => void;
  action?: { label: string; onClick: () => void };
}

export function TerminalStep({
  variant,
  title,
  onClose,
  action,
}: TerminalStepProps) {
  const wrap = {
    success: "border-emerald-200 bg-emerald-50",
    warning: "border-amber-200 bg-amber-50",
    error: "border-red-200 bg-red-50",
  }[variant];
  const text = {
    success: "text-emerald-800",
    warning: "text-amber-800",
    error: "text-red-800",
  }[variant];
  const icon = { success: "✓", warning: "!", error: "×" }[variant];

  return (
    <div className="space-y-4">
      <div className={`rounded-lg border px-4 py-6 text-center ${wrap}`}>
        <p className={`text-3xl ${text}`} aria-hidden="true">{icon}</p>
        <p className={`text-base font-medium mt-2 ${text}`}>{title}</p>
      </div>
      <div className="flex justify-end gap-2">
        {action && (
          <Button variant="outline" size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
        <Button size="sm" onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}
