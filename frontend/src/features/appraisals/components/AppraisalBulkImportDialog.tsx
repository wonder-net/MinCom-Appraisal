/**
 * AppraisalBulkImportDialog — Multi-step dialog for bulk appraisal import.
 *
 * Step 1: Upload .xls or .zip + select target status
 * Step 2: Review match preview + resolve unmatched files
 * Step 3: Confirm → runs in background
 */

import { useState, useCallback, useRef, useEffect, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  appraisalBulkImportValidate,
  appraisalBulkImportConfirm,
  listCycles,
  type AppraisalImportPreview,
  type AppraisalImportFilePreview,
} from "@/api/appraisals";
import type { AppraisalCycle } from "@/types";
import { extractApiError } from "@/utils/extract-api-error";
import { apiClient } from "@/api/client";

async function downloadTemplate(formType: string, filename: string) {
  const response = await apiClient.get(`appraisals/templates/${formType}/`, {
    responseType: "blob",
  });
  const url = URL.createObjectURL(response.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

type DialogStep = "upload" | "validating" | "preview" | "confirming" | "importing" | "error";

const TARGET_STATUSES = [
  { value: "DISCUSSION", label: "Discussion" },
  { value: "GROWTH_PLANNING", label: "Growth Planning" },
  { value: "PENDING_SIGNOFF", label: "Pending Sign-off" },
  { value: "SIGNED_OFF", label: "Signed Off" },
  { value: "FINALISED", label: "Finalised" },
];

interface AppraisalBulkImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AppraisalBulkImportDialog({
  isOpen,
  onClose,
  onSuccess,
}: AppraisalBulkImportDialogProps) {
  const [step, setStep] = useState<DialogStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [targetStatus, setTargetStatus] = useState("FINALISED");
  const [cycleId, setCycleId] = useState("");
  const [cycles, setCycles] = useState<AppraisalCycle[]>([]);
  const [preview, setPreview] = useState<AppraisalImportPreview | null>(null);
  const [confirmedMatches, setConfirmedMatches] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    else if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  // Load active cycles when dialog opens
  useEffect(() => {
    if (!isOpen) return;
    void listCycles().then((all) => {
      const active = all.filter((c) => c.status === "ACTIVE");
      setCycles(active);
      if (active.length === 1) setCycleId(active[0].id);
    });
  }, [isOpen]);

  const resetState = useCallback(() => {
    setStep("upload");
    setFile(null);
    setTargetStatus("FINALISED");
    setCycleId("");
    setPreview(null);
    setConfirmedMatches({});
    setErrorMessage("");
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  const handleUpload = useCallback(async () => {
    if (!file) return;
    setStep("validating");
    try {
      const result = await appraisalBulkImportValidate(file, cycleId, targetStatus);
      setPreview(result);

      // Auto-populate confirmed matches for exact/auto matches
      const matches: Record<string, string> = {};
      for (const fp of result.files) {
        if (fp.matched_employee && (fp.match_status === "exact" || fp.match_status === "auto")) {
          matches[fp.filename] = fp.matched_employee.id;
        }
      }
      setConfirmedMatches(matches);
      setStep("preview");
    } catch (err) {
      setErrorMessage(extractApiError(err));
      setStep("error");
    }
  }, [file, cycleId, targetStatus]);

  const handleConfirm = useCallback(async () => {
    if (!preview) return;
    setStep("confirming");
    try {
      await appraisalBulkImportConfirm(preview.import_id, confirmedMatches);
      setStep("importing");
    } catch (err) {
      setErrorMessage(extractApiError(err));
      setStep("error");
    }
  }, [preview, confirmedMatches]);

  const handleMatchOverride = useCallback((filename: string, employeeId: string) => {
    setConfirmedMatches((prev) => ({ ...prev, [filename]: employeeId }));
  }, []);

  if (!isOpen) return null;

  const confirmableCount = Object.keys(confirmedMatches).length;

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-50 m-auto w-full max-w-4xl rounded-lg border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/50 max-h-[90vh] overflow-hidden"
      onCancel={(e) => { e.preventDefault(); if (step !== "importing") handleClose(); }}
      onClick={(e) => { if (e.target === dialogRef.current && step !== "importing") handleClose(); }}
    >
      <div className="p-6 overflow-y-auto max-h-[85vh]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Bulk Import Appraisals</h2>
          <button type="button" onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-xl" aria-label="Close">&times;</button>
        </div>

        {/* Upload */}
        {step === "upload" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Upload completed appraisal .xls/.xlsx files (single file or .zip archive) to import into the system.
            </p>
            <div className="flex gap-3 text-xs">
              <span className="text-gray-500">Download templates:</span>
              <button
                type="button"
                className="text-secondary hover:underline font-medium"
                onClick={async () => { try { await downloadTemplate("form-a", "MINCOM_PA_Template_Managerial.xlsx"); } catch { setErrorMessage("Failed to download template."); setStep("error"); } }}
              >
                Form A (Managerial)
              </button>
              <button
                type="button"
                className="text-secondary hover:underline font-medium"
                onClick={async () => { try { await downloadTemplate("form-b", "MINCOM_PA_Template_Non_Managerial.xlsx"); } catch { setErrorMessage("Failed to download template."); setStep("error"); } }}
              >
                Form B (Non-Managerial)
              </button>
            </div>
            {cycles.length === 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-center">
                <p className="text-base font-medium text-amber-800">No active cycle available</p>
                <p className="text-sm text-amber-600 mt-2">
                  Please create and activate an appraisal cycle before importing appraisals.
                </p>
                <div className="mt-4">
                  <Button variant="outline" size="sm" onClick={handleClose}>Close</Button>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">File</label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xls,.xlsx,.zip"
                      onChange={(e: ChangeEvent<HTMLInputElement>) => {
                        setFile(e.target.files?.[0] ?? null);
                      }}
                      className="hidden"
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          // Reset value so re-selecting the same file triggers onChange
                          if (fileInputRef.current) fileInputRef.current.value = "";
                          fileInputRef.current?.click();
                        }}
                      >
                        Choose File
                      </Button>
                      <span className="text-sm text-gray-500 truncate max-w-[180px]">
                        {file ? file.name : "No file selected"}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cycle</label>
                    <Select value={cycleId} onChange={(e) => setCycleId(e.target.value)} className="w-full">
                      {cycles.length > 1 && <option value="">Select cycle...</option>}
                      {cycles.map((c) => (
                        <option key={c.id} value={c.id}>{c.period_name}</option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Import as status</label>
                    <Select value={targetStatus} onChange={(e) => setTargetStatus(e.target.value)} className="w-full">
                      {TARGET_STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
                  <Button size="sm" className="bg-primary text-white hover:bg-primary-dark" disabled={!file || !cycleId} onClick={() => void handleUpload()}>
                    Upload & Validate
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Validating */}
        {step === "validating" && (
          <div className="flex flex-col items-center py-8 gap-3">
            <span className="h-8 w-8 rounded-full border-3 border-gray-300 border-t-primary animate-spin" />
            <p className="text-sm text-gray-600">Parsing and matching files...</p>
          </div>
        )}

        {/* Preview */}
        {step === "preview" && preview && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-5 gap-2 text-center">
              <div className="rounded border p-2">
                <p className="text-xl font-bold">{preview.summary.total_files}</p>
                <p className="text-xs text-gray-500">Total</p>
              </div>
              <div className="rounded border border-emerald-200 bg-emerald-50 p-2">
                <p className="text-xl font-bold text-emerald-700">{preview.summary.matched}</p>
                <p className="text-xs text-emerald-600">Matched</p>
              </div>
              <div className="rounded border border-amber-200 bg-amber-50 p-2">
                <p className="text-xl font-bold text-amber-700">{preview.summary.suggested}</p>
                <p className="text-xs text-amber-600">Suggested</p>
              </div>
              <div className="rounded border border-red-200 bg-red-50 p-2">
                <p className="text-xl font-bold text-red-700">{preview.summary.unmatched + preview.summary.errors}</p>
                <p className="text-xs text-red-600">Unmatched/Errors</p>
              </div>
              <div className="rounded border border-blue-200 bg-blue-50 p-2">
                <p className="text-xl font-bold text-blue-700">{preview.summary.score_discrepancies}</p>
                <p className="text-xs text-blue-600">Score Issues</p>
              </div>
            </div>

            {/* File table */}
            <div className="max-h-96 overflow-auto rounded border">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">File</th>
                    <th className="px-3 py-2 text-left font-medium">Employee Match</th>
                    <th className="px-3 py-2 text-center font-medium">Confidence</th>
                    <th className="px-3 py-2 text-center font-medium">Form</th>
                    <th className="px-3 py-2 text-center font-medium">Scores</th>
                    <th className="px-3 py-2 text-center font-medium">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {preview.files.map((fp) => (
                    <FilePreviewRow
                      key={fp.filename}
                      file={fp}
                      confirmedMatch={confirmedMatches[fp.filename]}
                      onMatchOverride={handleMatchOverride}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="text-sm text-gray-500">
                {confirmableCount} file{confirmableCount !== 1 ? "s" : ""} ready to import as <strong>{targetStatus}</strong>
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
                {confirmableCount > 0 && (
                  <Button size="sm" className="bg-primary text-white hover:bg-primary-dark" onClick={() => void handleConfirm()}>
                    Import {confirmableCount} Appraisal{confirmableCount !== 1 ? "s" : ""}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Confirming */}
        {step === "confirming" && (
          <div className="flex flex-col items-center py-8 gap-3">
            <span className="h-8 w-8 rounded-full border-3 border-gray-300 border-t-primary animate-spin" />
            <p className="text-sm text-gray-600">Starting import...</p>
          </div>
        )}

        {/* Importing */}
        {step === "importing" && preview && (
          <div className="space-y-4 py-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-6 text-center">
              <p className="text-base font-medium text-emerald-800">Import is running in the background</p>
              <p className="text-sm text-emerald-600 mt-2">
                You&apos;ll receive a notification when it&apos;s complete, or you can{" "}
                <Link
                  to={`/admin/appraisals/import/${preview.import_id}/results`}
                  className="font-medium underline hover:text-emerald-800"
                  onClick={() => { onSuccess(); handleClose(); }}
                >
                  follow the progress here
                </Link>.
              </p>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={() => { onSuccess(); handleClose(); }}>Close</Button>
            </div>
          </div>
        )}

        {/* Error */}
        {step === "error" && (
          <div className="space-y-4">
            <Alert variant="error"><AlertDescription>{errorMessage}</AlertDescription></Alert>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={resetState}>Try Again</Button>
              <Button size="sm" onClick={handleClose}>Close</Button>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}

function FilePreviewRow({
  file,
  confirmedMatch,
  onMatchOverride,
}: {
  file: AppraisalImportFilePreview;
  confirmedMatch?: string;
  onMatchOverride: (filename: string, employeeId: string) => void;
}) {
  const hasErrors = file.errors.length > 0;
  const isMatched = file.match_status === "exact" || file.match_status === "auto";
  const isSuggested = file.match_status === "suggested";

  const bgClass = hasErrors
    ? "bg-red-50"
    : isMatched
      ? "bg-white"
      : isSuggested
        ? "bg-amber-50"
        : "bg-gray-50";

  return (
    <tr className={bgClass}>
      <td className="px-3 py-2 text-gray-900 font-medium max-w-[200px] truncate" title={file.filename}>
        {file.filename}
        {hasErrors && (
          <p className="text-red-600 text-xs mt-0.5">{file.errors.join("; ")}</p>
        )}
      </td>
      <td className="px-3 py-2">
        {hasErrors ? (
          <span className="text-red-600">--</span>
        ) : isMatched && file.matched_employee ? (
          <span className="text-gray-900">{file.matched_employee.name}</span>
        ) : isSuggested && file.candidates && file.candidates.length > 0 ? (
          <select
            value={confirmedMatch ?? ""}
            onChange={(e) => onMatchOverride(file.filename, e.target.value)}
            className="text-xs border rounded px-1 py-0.5 w-full"
          >
            <option value="">Select employee...</option>
            {file.candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.department}) — {c.score}%
              </option>
            ))}
          </select>
        ) : (
          <span className="text-gray-400">No match</span>
        )}
      </td>
      <td className="px-3 py-2 text-center">
        {file.match_confidence != null && (
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
            (file.match_confidence ?? 0) >= 85
              ? "bg-emerald-100 text-emerald-700"
              : (file.match_confidence ?? 0) >= 60
                ? "bg-amber-100 text-amber-700"
                : "bg-red-100 text-red-700"
          }`}>
            {file.match_confidence}%
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-center text-gray-600">
        {file.form_type === "FORM_A" ? "Mgr" : file.form_type === "FORM_B" ? "Non-Mgr" : "--"}
      </td>
      <td className="px-3 py-2 text-center">
        {file.score_validation ? (
          file.score_validation.has_discrepancy ? (
            <span className="text-amber-600" title={file.score_validation.discrepancy_details.join("; ")}>&#9888;</span>
          ) : (
            <span className="text-emerald-600">&#10003;</span>
          )
        ) : "--"}
      </td>
      <td className="px-3 py-2 text-center text-gray-500">
        {file.data_summary.kd_count} KDs, {file.data_summary.competency_count} BCs
      </td>
    </tr>
  );
}
