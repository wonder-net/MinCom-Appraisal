/**
 * BandBar — A single horizontal bar row in the score distribution chart.
 * Displays label, colored bar scaled to percentage, count, and percentage text.
 */

import type { BandRow } from "@/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BAND_COLORS: Record<string, string> = {
  "Below Standard": "bg-red-500",
  "Generally Performing": "bg-amber-500",
  "Fully Competent": "bg-green-500",
  "Exceeds Expectations": "bg-blue-500",
  "Outstanding": "bg-emerald-500",
};

const DEFAULT_BAR_COLOR = "bg-gray-400";

// ---------------------------------------------------------------------------
// Pure helper
// ---------------------------------------------------------------------------

function getBandColor(label: string): string {
  return BAND_COLORS[label] ?? DEFAULT_BAR_COLOR;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface BandBarProps {
  band: BandRow;
}

export function BandBar({ band }: BandBarProps) {
  const colorClass = getBandColor(band.label);
  const percentage = Number(band.percentage);

  return (
    <div className="flex items-center gap-3" role="listitem">
      <span className="w-40 shrink-0 text-sm font-medium text-gray-900 text-right">
        {band.label}
      </span>
      <div className="flex-1 h-7 bg-gray-100 rounded-md overflow-hidden">
        <div
          className={`h-full rounded-md transition-all duration-300 ${colorClass}`}
          style={{ width: `${Math.max(percentage, 0)}%` }}
          role="progressbar"
          aria-valuenow={percentage}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${band.label}: ${percentage.toFixed(1)}%`}
        />
      </div>
      <span className="w-10 text-right text-sm font-semibold text-gray-900 shrink-0">
        {band.count}
      </span>
      <span className="w-16 text-right text-sm text-gray-500 shrink-0">
        {percentage.toFixed(1)}%
      </span>
    </div>
  );
}
