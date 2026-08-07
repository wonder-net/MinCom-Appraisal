/**
 * Pure formatting and colour utility functions for score display.
 *
 * DRF DecimalField serialises numeric values as strings (e.g. "3.50").
 * These helpers coerce to Number before formatting and handle null/undefined.
 */

/**
 * Formats a score value for display.
 * Returns em-dash for null/undefined; otherwise Number-coerced .toFixed(2).
 */
export function formatScore(
  value: string | number | null | undefined,
): string {
  if (value === null || value === undefined) return "\u2014";
  return Number(value).toFixed(2);
}

/**
 * Returns a Tailwind text colour class based on score value.
 * null/undefined -> gray, <= 2 -> red, < 4 -> amber, >= 4 -> green.
 */
export function scoreColour(
  value: string | number | null | undefined,
): string {
  if (value === null || value === undefined) return "text-gray-400";
  const n = Number(value);
  if (n >= 4) return "text-green-600";
  if (n > 2) return "text-amber-600";
  return "text-red-600";
}

/**
 * Formats a completion rate for display.
 * Guards against NaN from divide-by-zero.
 */
export function formatCompletionRate(
  completed: number,
  total: number,
): string {
  if (total === 0) return "0.0%";
  return `${((completed / total) * 100).toFixed(1)}%`;
}
