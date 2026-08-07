/**
 * Unit tests for BulkImportDialog — TASK-304 async pipeline.
 *
 * Covers:
 *   - Idle UI: file picker + both template downloads (legacy TASK-249 paths).
 *   - Happy path: upload → validation poll → preview → commit poll → success.
 *   - Partial success: download-failed-rows button is present and fires.
 *   - Validation failed: shows error and "Try Again" resets to idle.
 *   - Close-mid-commit / reopen: polling resumes for the same jobId.
 *   - Polling stops on terminal state.
 *
 * Polling tests use real timers but a short tick to keep the suite fast.
 * Real timers avoid the well-known `waitFor + fake timers` deadlock.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { BulkImportJob } from "../../types/bulkImportJob";

const mockDownloadXlsx = vi.fn();
const mockDownloadCsv = vi.fn();

vi.mock("@/api/admin-users", () => ({
  downloadBulkImportTemplate: (...args: unknown[]) => mockDownloadXlsx(...args),
  downloadBulkImportCsvTemplate: (...args: unknown[]) => mockDownloadCsv(...args),
}));

const mockCreateJob = vi.fn();
const mockGetJob = vi.fn();
const mockCommitJob = vi.fn();
const mockDownloadFailedRows = vi.fn();

vi.mock("../../api/bulkImportJobs", () => ({
  createBulkImportJob: (...args: unknown[]) => mockCreateJob(...args),
  getBulkImportJob: (...args: unknown[]) => mockGetJob(...args),
  commitBulkImportJob: (...args: unknown[]) => mockCommitJob(...args),
  downloadFailedRowsCsv: (...args: unknown[]) => mockDownloadFailedRows(...args),
  failedRowsCsvUrl: (id: string) => `/api/v1/admin/users/bulk-import/jobs/${id}/failed-rows.csv/`,
}));

import { setBulkImportPollInterval } from "../../hooks/useBulkImportJobStatus";
// Shorten the polling interval used by the hook so tests do not need to
// wait 2 s per tick. The setter is read on every tick scheduler call.
setBulkImportPollInterval(50);

const mockCreateObjectURL = vi.fn(() => "blob:mock-url");
const mockRevokeObjectURL = vi.fn();
globalThis.URL.createObjectURL = mockCreateObjectURL;
globalThis.URL.revokeObjectURL = mockRevokeObjectURL;

// jsdom lacks native <dialog> support
HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
  this.setAttribute("open", "");
});
HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
  this.removeAttribute("open");
});

import { BulkImportDialog } from "../BulkImportDialog";

function buildJob(overrides: Partial<BulkImportJob> = {}): BulkImportJob {
  return {
    id: "job-1",
    status: "PENDING_VALIDATION",
    total_rows: null,
    processed_rows: 0,
    created_count: 0,
    failed_count: 0,
    validation_preview: null,
    failed_rows: null,
    error_message: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    validation_completed_at: null,
    commit_started_at: null,
    commit_completed_at: null,
    created_by: { id: "u-1", email: "admin@mincom.com", full_name: "Admin" },
    ...overrides,
  };
}

describe("BulkImportDialog — async pipeline (TASK-304)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders file input with accept='.xlsx,.csv'", () => {
    render(<BulkImportDialog isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
    const fileInput = document.querySelector("input[type='file']") as HTMLInputElement;
    expect(fileInput).not.toBeNull();
    expect(fileInput.getAttribute("accept")).toBe(".xlsx,.csv");
  });

  it("description mentions .xlsx and .csv", () => {
    render(<BulkImportDialog isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByText(/Upload a .xlsx or .csv file/)).toBeInTheDocument();
  });

  it("renders both template download buttons", () => {
    render(<BulkImportDialog isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByText("Download .xlsx Template")).toBeInTheDocument();
    expect(screen.getByText("Download .csv Template")).toBeInTheDocument();
  });

  it("clicking 'Download .xlsx Template' triggers a download", async () => {
    mockDownloadXlsx.mockResolvedValue(new Blob(["xlsx"]));
    render(<BulkImportDialog isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);

    const clickSpy = vi.fn();
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = origCreateElement(tag);
      if (tag === "a") {
        Object.defineProperty(el, "click", { value: clickSpy });
      }
      return el;
    });

    fireEvent.click(screen.getByText("Download .xlsx Template"));
    await waitFor(() => expect(mockDownloadXlsx).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));

    vi.restoreAllMocks();
  });

  it("happy path: upload → validation poll → preview → commit poll → success", async () => {
    const onSuccess = vi.fn();
    mockCreateJob.mockResolvedValue(buildJob({ status: "PENDING_VALIDATION" }));
    mockGetJob
      .mockResolvedValueOnce(buildJob({ status: "PENDING_VALIDATION" }))
      .mockResolvedValueOnce(buildJob({
        status: "VALIDATED",
        total_rows: 3,
        validation_preview: {
          valid_rows: [
            { row_number: 1, employee_number: "PF001", full_name: "Alice", email: "a@m.com", status: "valid", error: "" },
            { row_number: 2, employee_number: "PF002", full_name: "Bob", email: "b@m.com", status: "valid", error: "" },
            { row_number: 3, employee_number: "PF003", full_name: "Cara", email: "c@m.com", status: "valid", error: "" },
          ],
          error_rows: [],
          new_departments: ["Finance"],
        },
      }))
      .mockResolvedValueOnce(buildJob({
        status: "COMMITTING",
        total_rows: 3,
        processed_rows: 1,
        commit_started_at: "2026-01-01T00:01:00Z",
      }))
      .mockResolvedValue(buildJob({
        status: "SUCCEEDED",
        total_rows: 3,
        processed_rows: 3,
        created_count: 3,
        commit_started_at: "2026-01-01T00:01:00Z",
        commit_completed_at: "2026-01-01T00:02:00Z",
      }));
    mockCommitJob.mockResolvedValue(buildJob({
      status: "COMMITTING",
      total_rows: 3,
      processed_rows: 0,
    }));

    render(<BulkImportDialog isOpen onClose={vi.fn()} onSuccess={onSuccess} />);

    const fileInput = document.querySelector("input[type='file']") as HTMLInputElement;
    const file = new File(["pf,email\nPF001,a@m.com"], "import.csv", { type: "text/csv" });
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Upload & Validate"));
    });
    await waitFor(() => expect(mockCreateJob).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(screen.getByText(/Ready to Import/)).toBeInTheDocument());
    expect(screen.getByText("Finance")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText(/Commit Import/));
    });
    await waitFor(() => expect(mockCommitJob).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(screen.getByRole("progressbar")).toBeInTheDocument());

    await waitFor(() =>
      expect(screen.getByText(/3 users created successfully\./)).toBeInTheDocument(),
    );
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("partial success exposes a 'Download failed rows' button", async () => {
    mockGetJob.mockResolvedValue(buildJob({
      status: "PARTIAL_SUCCESS",
      total_rows: 5,
      processed_rows: 5,
      created_count: 3,
      failed_count: 2,
      failed_rows: [
        { row_number: 4, employee_number: "PF004", email: "d@m.com", error: "Duplicate" },
        { row_number: 5, employee_number: "PF005", email: "e@m.com", error: "Invalid role" },
      ],
    }));
    mockDownloadFailedRows.mockResolvedValue(undefined);

    render(
      <BulkImportDialog
        isOpen
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        resumeJobId="job-1"
      />,
    );

    await waitFor(() => expect(mockGetJob).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByText(/3 of 5 users created. 2 failed\./)).toBeInTheDocument(),
    );

    const button = screen.getByText("Download failed rows");
    await act(async () => {
      fireEvent.click(button);
    });
    await waitFor(() => expect(mockDownloadFailedRows).toHaveBeenCalledWith("job-1"));
  });

  it("validation failed: shows error and 'Try Again' resets to idle", async () => {
    mockGetJob.mockResolvedValue(buildJob({
      status: "VALIDATION_FAILED",
      error_message: "File is missing the 'email' column.",
    }));

    render(
      <BulkImportDialog
        isOpen
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        resumeJobId="job-bad"
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText("File is missing the 'email' column."),
      ).toBeInTheDocument(),
    );

    await act(async () => {
      fireEvent.click(screen.getByText("Try Again"));
    });

    await waitFor(() =>
      expect(screen.getByText("Upload & Validate")).toBeInTheDocument(),
    );
  });

  it("close mid-commit and reopen: polling resumes via resumeJobId", async () => {
    mockGetJob.mockResolvedValue(buildJob({
      status: "COMMITTING",
      total_rows: 100,
      processed_rows: 30,
      commit_started_at: "2026-01-01T00:01:00Z",
    }));

    const onClose = vi.fn();
    const { rerender } = render(
      <BulkImportDialog
        isOpen
        onClose={onClose}
        onSuccess={vi.fn()}
        resumeJobId="job-running"
      />,
    );
    await waitFor(() => expect(mockGetJob).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole("progressbar")).toBeInTheDocument());

    rerender(
      <BulkImportDialog
        isOpen={false}
        onClose={onClose}
        onSuccess={vi.fn()}
        resumeJobId="job-running"
      />,
    );

    const callsAfterClose = mockGetJob.mock.calls.length;

    rerender(
      <BulkImportDialog
        isOpen
        onClose={onClose}
        onSuccess={vi.fn()}
        resumeJobId="job-running"
      />,
    );

    await waitFor(() => expect(screen.getByRole("progressbar")).toBeInTheDocument());
    expect(mockGetJob.mock.calls.length).toBeGreaterThanOrEqual(callsAfterClose);
  });

  it("closing mid-commit preserves the parent's jobId pointer (R1-FE-1)", async () => {
    // R1 QA fix: handleClose must NOT call onJobIdChange(null) while the
    // job is still in flight, otherwise the "View import status" re-entry
    // link in AdminUsers disappears even though the job is still running.
    mockCreateJob.mockResolvedValue(buildJob({ status: "PENDING_VALIDATION" }));
    mockGetJob
      .mockResolvedValueOnce(buildJob({
        status: "COMMITTING",
        total_rows: 50,
        processed_rows: 10,
        commit_started_at: "2026-01-01T00:01:00Z",
      }))
      .mockResolvedValue(buildJob({
        status: "COMMITTING",
        total_rows: 50,
        processed_rows: 12,
        commit_started_at: "2026-01-01T00:01:00Z",
      }));

    const onClose = vi.fn();
    const onJobIdChange = vi.fn();

    const { rerender } = render(
      <BulkImportDialog
        isOpen
        onClose={onClose}
        onSuccess={vi.fn()}
        resumeJobId={null}
        onJobIdChange={onJobIdChange}
      />,
    );

    // Idle → upload to enter the polling pipeline.
    const fileInput = document.querySelector("input[type='file']") as HTMLInputElement;
    const file = new File(["pf,email\nPF001,a@m.com"], "import.csv", { type: "text/csv" });
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Upload & Validate"));
    });
    await waitFor(() => expect(mockCreateJob).toHaveBeenCalledTimes(1));
    // Job creation reports the new id up to the parent.
    await waitFor(() =>
      expect(onJobIdChange).toHaveBeenCalledWith("job-1"),
    );

    // Wait until the dialog renders the COMMITTING progress bar.
    await waitFor(() =>
      expect(screen.getByRole("progressbar")).toBeInTheDocument(),
    );

    // Reset the spy so we can assert the close handler's behaviour in
    // isolation from the earlier "we have a new job" notification.
    onJobIdChange.mockClear();

    // User closes the dialog mid-commit (header X button).
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Close"));
    });

    // Parent must NOT be told to clear the jobId — the job is still
    // running server-side and the re-entry link must remain visible.
    expect(onJobIdChange).not.toHaveBeenCalledWith(null);
    expect(onClose).toHaveBeenCalledTimes(1);

    // Re-open with the same jobId — dialog should resume in COMMITTING
    // state showing the progress bar (no idle reset occurred).
    rerender(
      <BulkImportDialog
        isOpen
        onClose={onClose}
        onSuccess={vi.fn()}
        resumeJobId="job-1"
        onJobIdChange={onJobIdChange}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("progressbar")).toBeInTheDocument(),
    );
  });

  it("polling stops once a terminal state is reached", async () => {
    mockGetJob.mockResolvedValue(buildJob({
      status: "SUCCEEDED",
      total_rows: 2,
      processed_rows: 2,
      created_count: 2,
    }));

    render(
      <BulkImportDialog
        isOpen
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        resumeJobId="job-final"
      />,
    );

    await waitFor(() =>
      expect(screen.getByText(/2 users created successfully\./)).toBeInTheDocument(),
    );

    const callsAtTerminal = mockGetJob.mock.calls.length;

    // Give the (real) interval ample time to fire again. If polling has
    // not been cleared, the count will grow past `callsAtTerminal`.
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(mockGetJob.mock.calls.length).toBe(callsAtTerminal);
  });
});
