/**
 * Pure date formatting utilities for display purposes.
 */

/**
 * Format an ISO 8601 date string into a human-readable comment timestamp.
 * Example: "14 Mar 2026, 10:42 AM"
 */
export function formatCommentTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }) +
    ", " +
    date.toLocaleTimeString("en-GB", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).toUpperCase();
}

/**
 * Format an ISO date string (YYYY-MM-DD) into "DD MMM YYYY".
 * Example: "2026-01-01" -> "01 Jan 2026"
 */
export function formatShortDate(isoDate: string): string {
  const date = new Date(isoDate + "T00:00:00");
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
