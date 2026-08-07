/**
 * KDVarianceTable — Renders the KD (Key Deliverable) variance table
 * with colour-coded variance column. Positive variance (employee
 * over-rates) = red, negative (manager higher) = green.
 */

import type { KDVarianceRow } from "@/api/reports";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Return Tailwind classes for the variance value.
 * Positive (self > manager) = red, negative (manager > self) = green,
 * zero = neutral gray.
 */
function getVarianceClass(variance: number): string {
  if (variance > 0) return "text-red-700 font-semibold";
  if (variance < 0) return "text-green-700 font-semibold";
  return "text-gray-500";
}

/**
 * Format a variance value with explicit sign.
 */
function formatVariance(variance: number): string {
  const num = Number(variance);
  if (num > 0) return `+${num.toFixed(2)}`;
  return num.toFixed(2);
}

/**
 * Format a rating value to two decimal places.
 */
function formatRating(value: number): string {
  return Number(value).toFixed(2);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface KDVarianceTableProps {
  rows: KDVarianceRow[];
}

export function KDVarianceTable({ rows }: KDVarianceTableProps) {
  return (
    <div>
      <h3 className="text-base font-semibold text-gray-900 mb-3">
        KD Variance
      </h3>
      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table
          className="w-full text-sm"
          aria-label="Key deliverable variance table"
        >
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left">
              <th scope="col" className="px-4 py-3 font-semibold text-gray-900">
                KD Title
              </th>
              <th scope="col" className="px-4 py-3 font-semibold text-gray-900 text-right">
                Avg Self
              </th>
              <th scope="col" className="px-4 py-3 font-semibold text-gray-900 text-right">
                Avg Manager
              </th>
              <th scope="col" className="px-4 py-3 font-semibold text-gray-900 text-right">
                Variance
              </th>
              <th scope="col" className="px-4 py-3 font-semibold text-gray-900 text-right">
                Count
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.kd_title}
                className={`border-b border-gray-200 last:border-0 ${
                  i % 2 === 1 ? "bg-gray-50" : "bg-white"
                }`}
              >
                <td className="px-4 py-3 text-gray-900 font-medium">
                  {row.kd_title}
                </td>
                <td className="px-4 py-3 text-right text-gray-500 tabular-nums">
                  {formatRating(row.avg_self_rating)}
                </td>
                <td className="px-4 py-3 text-right text-gray-500 tabular-nums">
                  {formatRating(row.avg_manager_rating)}
                </td>
                <td
                  className={`px-4 py-3 text-right tabular-nums ${getVarianceClass(row.variance)}`}
                  data-testid="variance-value"
                >
                  {formatVariance(row.variance)}
                </td>
                <td className="px-4 py-3 text-right text-gray-500">
                  {row.count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
