/**
 * BulkImportDialog — Async bulk-employee import dialog (TASK-304).
 *
 * Flow:
 *   idle → uploading → polling (PENDING_VALIDATION)
 *        → VALIDATED preview → commit → polling (COMMITTING)
 *        → SUCCEEDED / PARTIAL_SUCCESS / FAILED / VALIDATION_FAILED
 *
 * The job is owned by the backend — closing the dialog mid-flight does
 * NOT cancel anything, and re-opening with a known jobId resumes polling
 * exactly where it left off.
 *
 * The step renderers live in `bulk-import/BulkImportSteps.tsx` to keep
 * this file under the project-wide 200-line ceiling.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { extractApiError } from "@/utils/extract-api-error";
import {
  createBulkImportJob,
  commitBulkImportJob,
  downloadFailedRowsCsv,
} from "../api/bulkImportJobs";
import { useBulkImportJobStatus } from "../hooks/useBulkImportJobStatus";
import type { BulkImportJob } from "../types/bulkImportJob";
import {
  CenteredSpinner,
  CommittingStep,
  IdleStep,
  PreviewStep,
  TerminalStep,
} from "./bulk-import/BulkImportSteps";

interface BulkImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** Optional jobId to resume polling for an in-flight job. */
  resumeJobId?: string | null;
  /** Notifies the parent when a new job is created so it can persist the
   *  jobId for the "View import status" link across dialog close/reopen. */
  onJobIdChange?: (jobId: string | null) => void;
}

export function BulkImportDialog({
  isOpen,
  onClose,
  onSuccess,
  resumeJobId = null,
  onJobIdChange,
}: BulkImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(resumeJobId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const { job, isLoading: isJobLoading, error: jobError } =
    useBulkImportJobStatus(jobId);

  // Adopt `resumeJobId` once per id — guards against re-syncing after the
  // user manually clears the dialog via "Try Again" / Close.
  const lastResumeIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (resumeJobId && resumeJobId !== lastResumeIdRef.current) {
      lastResumeIdRef.current = resumeJobId;
      setJobId(resumeJobId);
      setFile(null);
      setUploadError(null);
    }
  }, [resumeJobId]);

  const resetState = useCallback(() => {
    setFile(null);
    setJobId(null);
    setIsUploading(false);
    setIsCommitting(false);
    setUploadError(null);
    onJobIdChange?.(null);
  }, [onJobIdChange]);

  // Job is in flight when it exists server-side in any non-terminal state.
  // Closing the dialog in this window must preserve the parent's jobId
  // pointer so the "View import status" link remains a valid re-entry point.
  const status = job?.status ?? null;
  const isInFlight =
    status !== null &&
    ["PENDING_VALIDATION", "VALIDATED", "COMMITTING"].includes(status);

  const handleClose = useCallback(() => {
    if (isInFlight) {
      // Job continues server-side; preserve the re-entry pointer.
      onClose();
      return;
    }
    resetState();
    onClose();
  }, [isInFlight, resetState, onClose]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setFile(e.target.files?.[0] ?? null);
      setUploadError(null);
    },
    [],
  );

  const handleUpload = useCallback(async () => {
    if (!file) return;
    setIsUploading(true);
    setUploadError(null);
    try {
      const created = await createBulkImportJob(file);
      setJobId(created.id);
      onJobIdChange?.(created.id);
      // isUploading stays true here — cleared by the effect below once
      // polling confirms a job object, so the upload button does not
      // flicker back to its enabled state during the gap between the
      // POST resolving and the first poll arriving.
    } catch (err) {
      setUploadError(extractApiError(err));
      setIsUploading(false);
    }
  }, [file, onJobIdChange]);

  const handleCommit = useCallback(async () => {
    if (!jobId) return;
    setIsCommitting(true);
    setUploadError(null);
    try {
      await commitBulkImportJob(jobId);
      // isCommitting stays true here — cleared by the effect below once
      // polling reports a status that reflects the commit having taken
      // effect (COMMITTING or terminal).  The Commit button shows
      // "Starting..." with disabled state until then, so the user
      // never sees a brief flicker back to the enabled state between
      // the POST resolving and the next poll arriving.
    } catch (err) {
      setUploadError(extractApiError(err));
      setIsCommitting(false);
    }
  }, [jobId]);

  // Clear the local upload-in-flight flag once polling has materialised
  // the job object, eliminating the brief flicker where the upload
  // button re-rendered as enabled between the POST resolving and the
  // first poll arriving.
  useEffect(() => {
    if (job && isUploading) {
      setIsUploading(false);
    }
  }, [job, isUploading]);

  // Clear the local commit-in-flight flag once polling reports the
  // commit has actually started (status moved to COMMITTING) or
  // reached a terminal state.  Prevents the same flicker on the
  // commit button.
  useEffect(() => {
    if (!isCommitting || !job) return;
    if (
      job.status === "COMMITTING" ||
      job.status === "SUCCEEDED" ||
      job.status === "PARTIAL_SUCCESS" ||
      job.status === "FAILED"
    ) {
      setIsCommitting(false);
    }
  }, [job, isCommitting]);

  const handleDownloadFailedRows = useCallback(async () => {
    if (!jobId) return;
    try {
      await downloadFailedRowsCsv(jobId);
    } catch (err) {
      setUploadError(extractApiError(err));
    }
  }, [jobId]);

  // Fire onSuccess once when a job reaches a (partial-)success terminal
  // state, and clear the parent's stored jobId on any terminal failure.
  const notifiedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!job) return;
    if (
      (job.status === "SUCCEEDED" || job.status === "PARTIAL_SUCCESS") &&
      notifiedRef.current !== job.id
    ) {
      notifiedRef.current = job.id;
      onSuccess();
      onJobIdChange?.(null);
    }
    if (job.status === "FAILED" || job.status === "VALIDATION_FAILED") {
      onJobIdChange?.(null);
    }
  }, [job, onSuccess, onJobIdChange]);

  // Drive the native <dialog> open/close
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    else if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  if (!isOpen) return null;

  const inCommitPhase = job?.status === "COMMITTING";

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-50 m-auto w-full max-w-2xl rounded-lg border border-gray-200 bg-white p-0 shadow-xl backdrop:bg-black/50"
      onCancel={(e) => {
        e.preventDefault();
        if (!inCommitPhase) handleClose();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current && !inCommitPhase) handleClose();
      }}
      aria-labelledby="bulk-import-title"
    >
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 id="bulk-import-title" className="text-lg font-semibold text-gray-900">
            Bulk Import Employees
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <DialogBody
          job={job}
          jobError={jobError}
          isJobLoading={isJobLoading}
          file={file}
          fileInputRef={fileInputRef}
          isUploading={isUploading}
          isCommitting={isCommitting}
          uploadError={uploadError}
          onFileChange={handleFileChange}
          onUpload={() => void handleUpload()}
          onCommit={() => void handleCommit()}
          onDownloadFailedRows={() => void handleDownloadFailedRows()}
          onTryAgain={resetState}
          onClose={handleClose}
          onDownloadTemplateError={(msg) => setUploadError(msg)}
        />
      </div>
    </dialog>
  );
}

interface DialogBodyProps {
  job: BulkImportJob | null;
  jobError: string | null;
  isJobLoading: boolean;
  file: File | null;
  fileInputRef: React.RefObject<HTMLInputElement>;
  isUploading: boolean;
  isCommitting: boolean;
  uploadError: string | null;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUpload: () => void;
  onCommit: () => void;
  onDownloadFailedRows: () => void;
  onTryAgain: () => void;
  onClose: () => void;
  onDownloadTemplateError: (msg: string) => void;
}

function DialogBody(props: DialogBodyProps) {
  const {
    job, jobError, isJobLoading, file, fileInputRef, isUploading,
    isCommitting, uploadError, onFileChange, onUpload, onCommit,
    onDownloadFailedRows, onTryAgain, onClose, onDownloadTemplateError,
  } = props;

  if (uploadError && !job) {
    return (
      <div className="space-y-4">
        <Alert variant="error"><AlertDescription>{uploadError}</AlertDescription></Alert>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onTryAgain}>Try Again</Button>
          <Button size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    );
  }

  if (isUploading) return <CenteredSpinner label="Uploading and validating..." />;

  if (!job) {
    return (
      <IdleStep
        file={file}
        fileInputRef={fileInputRef}
        onFileChange={onFileChange}
        onUpload={onUpload}
        onClose={onClose}
        onDownloadError={onDownloadTemplateError}
      />
    );
  }

  if (job.status === "PENDING_VALIDATION" || isJobLoading) {
    const label = job.total_rows
      ? `Validating row ${job.processed_rows} of ${job.total_rows}...`
      : "Validating spreadsheet...";
    return <CenteredSpinner label={label} />;
  }

  if (job.status === "VALIDATED") {
    return (
      <PreviewStep
        job={job}
        isCommitting={isCommitting}
        commitError={uploadError}
        onCommit={onCommit}
        onClose={onClose}
      />
    );
  }

  if (job.status === "VALIDATION_FAILED") {
    return (
      <div className="space-y-4">
        <Alert variant="error">
          <AlertDescription>
            {job.error_message ?? "Validation failed. Please review the file and try again."}
          </AlertDescription>
        </Alert>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onTryAgain}>Try Again</Button>
          <Button size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    );
  }

  if (job.status === "COMMITTING") {
    return <CommittingStep job={job} jobError={jobError} />;
  }

  if (job.status === "SUCCEEDED") {
    return (
      <TerminalStep
        variant="success"
        title={`${job.created_count} user${job.created_count === 1 ? "" : "s"} created successfully.`}
        onClose={onClose}
      />
    );
  }

  if (job.status === "PARTIAL_SUCCESS") {
    return (
      <TerminalStep
        variant="warning"
        title={`${job.created_count} of ${job.total_rows ?? 0} users created. ${job.failed_count} failed.`}
        onClose={onClose}
        action={{ label: "Download failed rows", onClick: onDownloadFailedRows }}
      />
    );
  }

  // FAILED
  return (
    <TerminalStep
      variant="error"
      title={job.error_message ?? "Import failed."}
      onClose={onClose}
    />
  );
}
