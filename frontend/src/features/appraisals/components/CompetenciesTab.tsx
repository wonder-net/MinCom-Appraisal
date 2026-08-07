/**
 * CompetenciesTab — Table of Mincom Core Values ratings (HR change
 * requests #7/#8) with optional self-rating column and appraisor rating
 * inputs.
 *
 * Each core value is rated directly in points, 1.0-7.5 in 0.5
 * increments (not a 1-5 scale averaged afterward) — the Mincom Core
 * Values Total shown in the summary row is the SUM of the 4 core
 * values' Appraisor Ratings (max 30), not a mean.
 *
 * Supports self-rating input when the appraisee is in SELF_ASSESSMENT
 * and self_rating_enabled is true.
 */

import { useMemo, useState, useCallback, useRef } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import type { CompetencyRating, AppraisalStatus } from "@/types";
import { CORE_VALUE_RATING_OPTIONS, CORE_VALUES_POINTS_MAX, getScoreBand } from "../constants/ratingScale";

type RatingField = "self_rating" | "manager_rating";

/** Key for tracking per-cell save status. */
type CellKey = `${string}:${RatingField}`;

interface CompetenciesTabProps {
  competencies: CompetencyRating[];
  selfRatingEnabled: boolean;
  canMgrRate: boolean;
  canSelfRate: boolean;
  status: AppraisalStatus;
  bcAverage: string | number | null;
  bcDescriptor: string | null;
  onUpdateRating: (crId: string, field: RatingField, value: number) => Promise<void>;
}

function SaveIndicator({ status }: { status: "saving" | "saved" | undefined }) {
  if (!status) return null;
  if (status === "saving") {
    return (
      <span
        className="inline-block ml-1.5 h-3.5 w-3.5 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin"
        role="status"
        aria-label="Saving"
      />
    );
  }
  return (
    <span className="inline-block ml-1 text-xs text-emerald-600" aria-label="Saved">
      &#10003;
    </span>
  );
}

/** Colour thresholds for a single core value's 1.0-7.5 point rating. */
function ScoreCell({ score }: { score: string | number | null }) {
  if (score === null || score === undefined) return <span className="text-gray-400">&mdash;</span>;
  const n = Number(score);
  const colour = n >= 6 ? "text-emerald-700" : n >= 4 ? "text-amber-600" : "text-red-700";
  return <span className={`font-semibold tabular-nums ${colour}`}>{n.toFixed(1)}</span>;
}

export function CompetenciesTab({
  competencies,
  selfRatingEnabled,
  canMgrRate,
  canSelfRate,
  bcAverage,
  bcDescriptor,
  onUpdateRating,
}: CompetenciesTabProps) {
  const colCount = useMemo(
    () => 1 + (selfRatingEnabled ? 1 : 0) + 1,
    [selfRatingEnabled],
  );

  // Track per-cell save status: "saving" | "saved"
  const [cellStatus, setCellStatus] = useState<Map<CellKey, "saving" | "saved">>(new Map());
  const savedTimers = useRef<Map<CellKey, ReturnType<typeof setTimeout>>>(new Map());

  const handleRating = useCallback(
    (crId: string, field: RatingField, value: number) => {
      const key: CellKey = `${crId}:${field}`;
      // Clear any existing "saved" timer
      const existing = savedTimers.current.get(key);
      if (existing) clearTimeout(existing);

      setCellStatus((prev) => new Map(prev).set(key, "saving"));
      onUpdateRating(crId, field, value)
        .then(() => {
          setCellStatus((prev) => new Map(prev).set(key, "saved"));
          const timer = setTimeout(() => {
            setCellStatus((prev) => {
              const next = new Map(prev);
              next.delete(key);
              return next;
            });
          }, 1500);
          savedTimers.current.set(key, timer);
        })
        .catch(() => {
          setCellStatus((prev) => {
            const next = new Map(prev);
            next.delete(key);
            return next;
          });
        });
    },
    [onUpdateRating],
  );

  const bcBand = getScoreBand(
    bcAverage !== null && bcAverage !== undefined
      ? (Number(bcAverage) / CORE_VALUES_POINTS_MAX) * 100
      : null,
  );

  return (
    <Card className="shadow-sm">
      <CardHeader className="py-3 px-4 bg-gradient-to-r from-blue-50 to-white border-b">
        <CardTitle className="text-sm font-semibold">
          Mincom Core Values Ratings
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-gray-500 bg-gray-50 border-b">
              <th scope="col" className="px-4 py-2 text-left">
                Core Value
              </th>
              {selfRatingEnabled && (
                <th scope="col" className="px-4 py-2 text-center">
                  Self Rating
                </th>
              )}
              <th scope="col" className="px-4 py-2 text-center">
                Appraisor Rating
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {competencies.length === 0 && (
              <tr>
                <td
                  colSpan={colCount}
                  className="px-4 py-6 text-center text-gray-400 text-sm"
                >
                  No core value ratings available.
                </td>
              </tr>
            )}
            {competencies.map((cr) => (
              <tr
                key={cr.id}
                className="bg-white hover:bg-gray-50 transition-colors"
              >
                <td className="px-4 py-2 text-gray-900 align-top">
                  <div>{cr.competency_name}</div>
                  {cr.sub_competencies && cr.sub_competencies.length > 0 && (
                    <ul className="mt-0.5 text-xs text-gray-500 list-disc list-inside space-y-0.5">
                      {cr.sub_competencies.map((sub) => (
                        <li key={sub}>{sub}</li>
                      ))}
                    </ul>
                  )}
                </td>
                {selfRatingEnabled && (
                  <td className="px-4 py-2 text-center align-top">
                    {canSelfRate ? (
                      <span className="inline-flex items-center justify-center">
                        <Select
                          value={cr.self_rating != null ? Number(cr.self_rating).toFixed(1) : ""}
                          onChange={(e) =>
                            handleRating(cr.id, "self_rating", Number(e.target.value))
                          }
                          aria-label={`Self rating for ${cr.competency_name}`}
                          className="h-8 w-20 px-1 text-sm text-center"
                        >
                          <option value="">-</option>
                          {CORE_VALUE_RATING_OPTIONS.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </Select>
                        <SaveIndicator status={cellStatus.get(`${cr.id}:self_rating`)} />
                      </span>
                    ) : (
                      <ScoreCell score={cr.self_rating} />
                    )}
                  </td>
                )}
                <td className="px-4 py-2 text-center align-top">
                  {canMgrRate ? (
                    <span className="inline-flex items-center justify-center">
                      <Select
                        value={cr.manager_rating != null ? Number(cr.manager_rating).toFixed(1) : ""}
                        onChange={(e) =>
                          handleRating(cr.id, "manager_rating", Number(e.target.value))
                        }
                        aria-label={`Appraisor rating for ${cr.competency_name}`}
                        className="h-8 w-20 px-1 text-sm text-center"
                      >
                        <option value="">-</option>
                        {CORE_VALUE_RATING_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </Select>
                      <SaveIndicator status={cellStatus.get(`${cr.id}:manager_rating`)} />
                    </span>
                  ) : (
                    <ScoreCell score={cr.manager_rating} />
                  )}
                </td>
              </tr>
            ))}
            {/* Summary row — SUM of the core values' points, not a mean */}
            {competencies.length > 0 && (
              <tr className="bg-gray-50 border-t font-semibold">
                <td
                  className="px-4 py-3 text-gray-700"
                  colSpan={selfRatingEnabled ? 2 : 1}
                >
                  Mincom Core Values Total ({CORE_VALUES_POINTS_MAX} pts max)
                </td>
                <td className="px-4 py-3 text-center">
                  {bcAverage !== null ? (
                    <span className={`tabular-nums ${bcBand?.colorClass ?? "text-gray-400"}`}>
                      {Number(bcAverage).toFixed(2)}
                      {bcDescriptor && (
                        <span className="ml-1 text-xs font-normal text-gray-500">
                          ({bcDescriptor})
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-gray-400">&mdash;</span>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
