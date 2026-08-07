/**
 * useBulkImportJobStatus — Polls a bulk-import job until it reaches a
 * terminal state.
 *
 * Behaviour:
 *  - Fetches immediately when given a jobId, then again every
 *    `POLL_INTERVAL_MS` (2 s) via `setInterval`.
 *  - Stops polling once `isTerminalStatus(job.status)` is true.
 *  - Pauses polling when `document.visibilityState === "hidden"` and
 *    resumes (with an immediate fetch) when the tab returns to the
 *    foreground.
 *  - Transient network errors do NOT cancel the loop — the next tick
 *    retries. The most recent error is exposed via `error`.
 *  - Cleans up the interval and the visibility listener on unmount.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { getBulkImportJob } from "../api/bulkImportJobs";
import { isTerminalStatus, type BulkImportJob } from "../types/bulkImportJob";
import { extractApiError } from "@/utils/extract-api-error";

export const DEFAULT_POLL_INTERVAL_MS = 2_000;

// Exported as `let` (read via getter) so tests can dial the interval down
// without forcing every consumer to thread a prop. Production callers
// rely on the default 2 s value.
let pollIntervalMs = DEFAULT_POLL_INTERVAL_MS;
export function setBulkImportPollInterval(ms: number): void {
  pollIntervalMs = ms;
}
export function getBulkImportPollInterval(): number {
  return pollIntervalMs;
}

interface UseBulkImportJobStatusResult {
  job: BulkImportJob | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useBulkImportJobStatus(
  jobId: string | null,
): UseBulkImportJobStatusResult {
  const [job, setJob] = useState<BulkImportJob | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(jobId !== null);
  const [error, setError] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stoppedRef = useRef<boolean>(false);
  // Keeps the latest jobId visible inside callbacks without re-binding
  // the effect on every render. The effect itself resets stoppedRef
  // when the jobId actually changes.
  const jobIdRef = useRef<string | null>(jobId);
  jobIdRef.current = jobId;

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const fetchOnce = useCallback(async () => {
    const currentId = jobIdRef.current;
    if (!currentId || stoppedRef.current) return;
    try {
      const next = await getBulkImportJob(currentId);
      // Guard against a late response landing after the caller swapped jobIds
      if (jobIdRef.current !== currentId) return;
      setJob(next);
      setError(null);
      setIsLoading(false);
      if (isTerminalStatus(next.status)) {
        stoppedRef.current = true;
        clearTimer();
      }
    } catch (err: unknown) {
      // Transient network errors must not cancel polling — record the
      // message and let the next tick retry.
      if (jobIdRef.current !== currentId) return;
      setError(extractApiError(err));
      setIsLoading(false);
    }
  }, [clearTimer]);

  const startTimer = useCallback(() => {
    clearTimer();
    if (stoppedRef.current) return;
    intervalRef.current = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      void fetchOnce();
    }, pollIntervalMs);
  }, [clearTimer, fetchOnce]);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      setIsLoading(false);
      setError(null);
      stoppedRef.current = false;
      clearTimer();
      return;
    }

    stoppedRef.current = false;
    setIsLoading(true);
    setError(null);
    setJob(null);

    void fetchOnce();
    startTimer();

    const handleVisibilityChange = (): void => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "visible" && !stoppedRef.current) {
        // Immediate catch-up fetch when the tab regains focus
        void fetchOnce();
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      clearTimer();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [jobId, clearTimer, fetchOnce, startTimer]);

  const refetch = useCallback(() => {
    void fetchOnce();
  }, [fetchOnce]);

  return { job, isLoading, error, refetch };
}
