/**
 * ImportExcelDialog — Dialog for importing an Excel file into an appraisal.
 *
 * Shows a file picker, uploads via multipart/form-data, and displays
 * import summary on success or error list on 400 validation failure.
 */

import { useState, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { importExcel } from "@/api/appraisals";
import type { ImportSummary } from "@/api/appraisals";
import { isAxiosError } from "axios";

interface ImportExcelDialogProps {
  appraisalId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type DialogState =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "success"; summary: ImportSummary }
  | { kind: "error"; messages: string[] };

export function ImportExcelDialog({
  appraisalId,
  isOpen,
  onClose,
  onSuccess,
}: ImportExcelDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dialogState, setDialogState] = useState<DialogState>({
    kind: "idle",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setSelectedFile(null);
    setDialogState({ kind: "idle" });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null;
      setSelectedFile(file);
      setDialogState({ kind: "idle" });
    },
    [],
  );

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;
    setDialogState({ kind: "uploading" });
    try {
      const summary = await importExcel(appraisalId, selectedFile);
      setDialogState({ kind: "success", summary });
      onSuccess();
      resetState();
      onClose();
    } catch (err: unknown) {
      if (isAxiosError(err) && err.response?.status === 400) {
        const responseData = err.response.data as
          | { errors?: string[]; detail?: string }
          | undefined;
        const messages: string[] =
          responseData?.errors ??
          (responseData?.detail ? [responseData.detail] : ["Validation failed."]);
        setDialogState({ kind: "error", messages });
      } else {
        setDialogState({
          kind: "error",
          messages: ["An unexpected error occurred. Please try again."],
        });
      }
    }
  }, [selectedFile, appraisalId, onSuccess, onClose, resetState]);

  const isUploading = dialogState.kind === "uploading";
  const isError = dialogState.kind === "error";

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !open && handleClose()}
    >
      <DialogContent
        className="max-w-md"
        role="dialog"
        aria-labelledby="import-excel-title"
        aria-modal="true"
      >
        <DialogHeader>
          <DialogTitle
            id="import-excel-title"
            className="text-lg font-semibold text-gray-900"
          >
            Import Excel
          </DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="space-y-1">
            <Label
              htmlFor="import-file"
              className="text-sm font-medium text-gray-900"
            >
              Select file
            </Label>
            <input
              ref={fileInputRef}
              id="import-file"
              type="file"
              accept=".xls,.xlsx"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border file:border-gray-200 file:text-sm file:font-medium file:bg-white file:text-gray-900 hover:file:bg-gray-50"
              disabled={isUploading}
              aria-describedby="import-file-hint"
            />
            <p id="import-file-hint" className="text-xs text-gray-500">
              Accepted formats: .xls, .xlsx
            </p>
          </div>

          {isError && (
            <div
              className="rounded-md border border-red-300 bg-red-50 px-4 py-3"
              role="alert"
              aria-live="polite"
            >
              <p className="text-sm font-medium text-red-700 mb-1">
                Import errors:
              </p>
              <ul className="list-disc list-inside text-sm text-red-700 space-y-0.5">
                {dialogState.messages.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {isError ? (
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
            >
              Dismiss
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isUploading}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!selectedFile || isUploading}
                className="bg-primary text-white hover:bg-primary-dark"
                onClick={() => void handleUpload()}
              >
                {isUploading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Uploading&hellip;
                  </span>
                ) : (
                  "Upload"
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
