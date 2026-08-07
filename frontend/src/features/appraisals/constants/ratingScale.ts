/**
 * Shared constants for the rescaled 100-point scoring system (HR change
 * requests #8/#9): Key Performance Indicators contribute up to 70 points
 * (unchanged 1.0-5.0 input scale, server-side rescaled — see
 * ScoreEngine::calculateTotalScore()), Mincom Core Values contribute up to
 * 30 points (4 core values, each rated directly in points from 1.0 to 7.5
 * in 0.5 increments — see ScoreEngine::calculateBcPoints()).
 *
 * Single source of truth so the rating options and the score-band
 * thresholds aren't duplicated (or allowed to drift) across
 * CompetenciesTab.tsx and ScoreSummaryPanel.tsx.
 */

/** 1.0, 1.5, 2.0, ... 7.5 — the only valid Mincom Core Value rating values. */
export const CORE_VALUE_RATING_OPTIONS: readonly string[] = Array.from(
  { length: 14 },
  (_, i) => ((i + 2) / 2).toFixed(1),
);

export const KPI_POINTS_MAX = 70;
export const CORE_VALUES_POINTS_MAX = 30;
export const TOTAL_POINTS_MAX = 100;

export interface ScoreBand {
  label: string;
  /** Tailwind text-colour class, matching the existing scoreColour() convention. */
  colorClass: string;
  min: number;
  max: number;
}

/**
 * The Balanced Scorecard rating scale (HR change request #9), matching the
 * backend's seeded `score_descriptor` defaults
 * (migrations/Version20260806120000.php). Hardcoded here rather than
 * fetched from the API — there's no dedicated endpoint exposing these
 * bands today, and they change rarely; same tradeoff the PDF report's
 * equivalent legend already accepts.
 */
export const SCORE_BANDS: readonly ScoreBand[] = [
  { label: "Outstanding Performer", colorClass: "text-green-600", min: 80, max: 100 },
  { label: "Good Performer", colorClass: "text-emerald-600", min: 70, max: 79.99 },
  { label: "Moderate Performer", colorClass: "text-amber-600", min: 60, max: 69.99 },
  { label: "Average Performer", colorClass: "text-orange-600", min: 50, max: 59.99 },
  { label: "Under Performer", colorClass: "text-red-600", min: 0, max: 49.99 },
];

/**
 * Resolves a 0-100 total score to its Balanced Scorecard band. Returns
 * the "gray" empty state for null/undefined, matching scoreColour()'s
 * convention in utils/format.ts (that function's 1-5-scale thresholds are
 * unrelated and still used elsewhere — e.g. Key Performance Indicator
 * rating cells — this is a separate, 100-point-scale function, not a
 * replacement for it).
 */
export function getScoreBand(
  value: string | number | null | undefined,
): ScoreBand | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return SCORE_BANDS.find((band) => n >= band.min && n <= band.max) ?? null;
}
