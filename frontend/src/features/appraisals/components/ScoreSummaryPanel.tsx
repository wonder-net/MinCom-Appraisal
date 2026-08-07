/**
 * ScoreSummaryPanel — Displays KPI average, Mincom Core Values total, and
 * overall total score with descriptors and colour coding, plus the
 * Balanced Scorecard Rating Scale legend (HR change request #9).
 *
 * Only shown when the appraisal is in MANAGER_REVIEW or later
 * (scores exist). The parent decides visibility.
 *
 * Rescaled to a 100-point system (HR change requests #8/#9): Key
 * Performance Indicators contribute up to 70 points (kdAverage itself
 * stays the same 0-5 weighted average the backend has always computed —
 * see ScoreEngine::calculateKdAverage() — only its *contribution* to the
 * total changed), Mincom Core Values contribute up to 30 points (bcAverage
 * is now a SUM of the 4 core values' direct-point ratings, 0-30, not a
 * mean — see ScoreEngine::calculateBcPoints()).
 */

import type { AppraisalStatus } from "@/types";
import { formatScore } from "@/utils/format";
import {
  CORE_VALUES_POINTS_MAX,
  KPI_POINTS_MAX,
  SCORE_BANDS,
  getScoreBand,
} from "../constants/ratingScale";

interface ScoreSummaryPanelProps {
  kdAverage: string | number | null;
  kdDescriptor: string | null;
  bcAverage: string | number | null;
  bcDescriptor: string | null;
  totalScore: string | number | null;
  performanceDescriptor: string | null;
  status: AppraisalStatus;
}

const SCORE_HIDDEN_STATUSES: ReadonlySet<AppraisalStatus> = new Set([
  "SELF_ASSESSMENT",
]);

/**
 * Normalises a component score to percent-of-its-own-max before resolving
 * a Balanced Scorecard band — mirrors ScoreEngine::resolveDescriptor()'s
 * normalisation server-side, so a 0-5 KPI average and a 0-30 Core Values
 * sum can both be judged against the same 0-100 band table as the total.
 */
function componentColorClass(
  value: string | number | null,
  max: number,
): string {
  if (value === null || value === undefined) return "text-gray-400";
  const band = getScoreBand((Number(value) / max) * 100);
  return band?.colorClass ?? "text-gray-400";
}

function totalColorClass(value: string | number | null): string {
  if (value === null || value === undefined) return "text-gray-400";
  return getScoreBand(value)?.colorClass ?? "text-gray-400";
}

export function ScoreSummaryPanel({
  kdAverage,
  kdDescriptor,
  bcAverage,
  bcDescriptor,
  totalScore,
  performanceDescriptor,
  status,
}: ScoreSummaryPanelProps) {
  if (SCORE_HIDDEN_STATUSES.has(status)) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 flex items-center justify-center min-h-[120px]">
        <p className="text-sm text-gray-400 text-center">
          Scores available after manager review.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
        Score Summary
      </p>

      <div className="flex justify-between text-sm">
        <span className="text-gray-600">KPI Average ({KPI_POINTS_MAX} pts max)</span>
        <output aria-label={`KPI average score: ${formatScore(kdAverage)} out of 5`}>
          <span className={`font-semibold tabular-nums ${componentColorClass(kdAverage, 5)}`}>
            {formatScore(kdAverage)}
          </span>
          {kdDescriptor && (
            <span className="ml-1 text-xs font-normal text-gray-500">
              ({kdDescriptor})
            </span>
          )}
        </output>
      </div>

      <div className="flex justify-between text-sm">
        <span className="text-gray-600">
          Mincom Core Values Total ({CORE_VALUES_POINTS_MAX} pts max)
        </span>
        <output
          aria-label={`Mincom Core Values total: ${formatScore(bcAverage)} out of ${CORE_VALUES_POINTS_MAX}`}
        >
          <span
            className={`font-semibold tabular-nums ${componentColorClass(bcAverage, CORE_VALUES_POINTS_MAX)}`}
          >
            {formatScore(bcAverage)}
          </span>
          {bcDescriptor && (
            <span className="ml-1 text-xs font-normal text-gray-500">
              ({bcDescriptor})
            </span>
          )}
        </output>
      </div>

      <div className="border-t border-gray-200 pt-2 mt-1 flex justify-between items-baseline">
        <span className="text-sm font-semibold text-gray-800">
          Total Score (out of 100)
        </span>
        <output
          aria-label={`Total score: ${formatScore(totalScore)} out of 100`}
          className="text-right"
        >
          <span className={`text-3xl font-bold tabular-nums ${totalColorClass(totalScore)}`}>
            {formatScore(totalScore)}
          </span>
          {performanceDescriptor && (
            <span className="block text-xs text-gray-500">
              {performanceDescriptor}
            </span>
          )}
        </output>
      </div>

      <div className="border-t border-gray-200 pt-2 mt-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
          Balanced Scorecard Rating Scale
        </p>
        <ul className="space-y-0.5">
          {SCORE_BANDS.map((band) => (
            <li key={band.label} className="flex justify-between text-xs">
              <span className={band.colorClass}>{band.label}</span>
              <span className="text-gray-500 tabular-nums">
                {band.max >= 100 ? `${band.min}+` : `${band.min} – ${band.max}`}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
