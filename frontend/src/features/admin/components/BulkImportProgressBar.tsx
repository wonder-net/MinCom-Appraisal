/**
 * BulkImportProgressBar — Determinate progress indicator for the commit
 * phase of a bulk-import job.
 *
 * Renders `[████████░░░░] 640 / 1000  (64%)  ~30s remaining`.
 * The time estimate uses an exponential moving average (alpha = 0.3) over
 * the per-row throughput. The estimate is hidden until at least 10 rows
 * have been processed (below that, the noise dominates the signal).
 *
 * Accessibility: the bar exposes `role="progressbar"` with
 * `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, and `aria-valuetext`.
 */

import { useEffect, useRef, useState } from "react";

interface BulkImportProgressBarProps {
  processedRows: number;
  totalRows: number | null;
  /** ISO-8601 timestamp emitted by the backend when the commit started. */
  startedAt: string | null;
}

const EMA_ALPHA = 0.3;
const MIN_ROWS_FOR_ESTIMATE = 10;

export function BulkImportProgressBar({
  processedRows,
  totalRows,
  startedAt,
}: BulkImportProgressBarProps) {
  const total = totalRows ?? 0;
  const safeProcessed = Math.min(Math.max(processedRows, 0), total || processedRows);
  const percent = total > 0 ? Math.min(100, Math.round((safeProcessed / total) * 100)) : 0;

  const etaSeconds = useEtaSeconds(safeProcessed, total, startedAt);

  const showEstimate =
    safeProcessed >= MIN_ROWS_FOR_ESTIMATE &&
    total > safeProcessed &&
    etaSeconds !== null;

  const valueText = total > 0
    ? `${safeProcessed} of ${total} rows processed (${percent}%)`
    : `${safeProcessed} rows processed`;

  return (
    <div>
      <div
        role="progressbar"
        aria-valuenow={safeProcessed}
        aria-valuemin={0}
        aria-valuemax={total > 0 ? total : undefined}
        aria-valuetext={valueText}
        aria-label="Bulk import progress"
        className="h-3 w-full rounded-full bg-gray-200 overflow-hidden"
      >
        <div
          className="h-full bg-primary transition-all duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-gray-600">
        <span>
          {safeProcessed.toLocaleString()} / {total > 0 ? total.toLocaleString() : "?"}
          {total > 0 && <span className="ml-2 text-gray-500">({percent}%)</span>}
        </span>
        {showEstimate && (
          <span aria-live="polite">~{formatEta(etaSeconds!)} remaining</span>
        )}
      </div>
    </div>
  );
}

/**
 * Smooths the per-row throughput with an exponential moving average and
 * returns the estimated remaining seconds. Returns `null` until we have
 * a stable rate (i.e. at least one sample interval after start).
 */
function useEtaSeconds(
  processed: number,
  total: number,
  startedAt: string | null,
): number | null {
  // Keeps the smoothed rows-per-second across renders without restarting
  // the EMA each time the parent re-renders.
  const rateRef = useRef<number | null>(null);
  const lastProcessedRef = useRef<number>(0);
  const lastTimestampRef = useRef<number | null>(null);
  const [eta, setEta] = useState<number | null>(null);

  useEffect(() => {
    if (!startedAt || total <= 0) {
      rateRef.current = null;
      lastProcessedRef.current = 0;
      lastTimestampRef.current = null;
      setEta(null);
      return;
    }

    const now = Date.now();
    const lastTs = lastTimestampRef.current;
    const lastProcessed = lastProcessedRef.current;

    if (lastTs === null) {
      // First sample: seed using elapsed-since-start, which gives a
      // reasonable initial rate without burning a polling tick.
      const startMs = Date.parse(startedAt);
      const elapsedSeconds = Math.max((now - startMs) / 1000, 1);
      if (processed > 0) {
        rateRef.current = processed / elapsedSeconds;
      }
    } else {
      const deltaRows = processed - lastProcessed;
      const deltaSeconds = (now - lastTs) / 1000;
      if (deltaRows > 0 && deltaSeconds > 0) {
        const sampleRate = deltaRows / deltaSeconds;
        rateRef.current =
          rateRef.current === null
            ? sampleRate
            : EMA_ALPHA * sampleRate + (1 - EMA_ALPHA) * rateRef.current;
      }
    }

    lastProcessedRef.current = processed;
    lastTimestampRef.current = now;

    if (rateRef.current && rateRef.current > 0) {
      const remaining = Math.max(total - processed, 0);
      setEta(Math.round(remaining / rateRef.current));
    } else {
      setEta(null);
    }
  }, [processed, total, startedAt]);

  return eta;
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes < 60) {
    return remaining === 0 ? `${minutes}m` : `${minutes}m ${remaining}s`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}
