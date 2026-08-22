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
 * A core value with sub-competencies configured (see SubCompetency's
 * backend docblock) is rated per sub-item instead of directly: each
 * sub-item has its own frozen `max_score` share of the parent's 7.5
 * ceiling (not always a "nice" round number, so a bounded number input
 * is used rather than the fixed-step dropdown the legacy direct-rating
 * path uses), and the core value's own rating becomes a read-only
 * roll-up total the server computes once every sub-item is rated.
 *
 * Supports self-rating input when the appraisee is in SELF_ASSESSMENT
 * and self_rating_enabled is true. That same appraisee can also add
 * their OWN sub-competency under any core value at that point (see
 * AddSubCompetencyControl) — per-appraisal only, never touching HR's
 * master sub-competency list — even converting a core value that had
 * no sub-competencies at all into itemized rating on the spot.
 */

import { useMemo, useState, useCallback, useRef } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { CompetencyRating, SubCompetencyRating, AppraisalStatus } from "@/types";
import { CORE_VALUE_RATING_OPTIONS, CORE_VALUES_POINTS_MAX, getScoreBand } from "../constants/ratingScale";
import { extractApiError } from "@/utils/extract-api-error";

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
  onUpdateSubRating: (crId: string, subCrId: string, field: RatingField, value: number) => Promise<void>;
  onAddSubCompetency: (crId: string, name: string) => Promise<void>;
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

interface SubCompetencyInputProps {
  value: number | null;
  maxScore: number;
  label: string;
  onCommit: (value: number) => void;
}

/**
 * A bounded [0, maxScore] number input, 2dp. Commits on blur/Enter
 * rather than on every keystroke — max_score usually isn't a round
 * number (e.g. 7.5/7 = 1.07), so there's no fixed-step dropdown to use
 * instead, and firing a save request per digit typed would be wasteful.
 */
function SubCompetencyInput({ value, maxScore, label, onCommit }: SubCompetencyInputProps) {
  const [draft, setDraft] = useState(value != null ? String(value) : "");

  const commit = useCallback(() => {
    if (draft === "") return;
    const n = Number(draft);
    if (Number.isNaN(n) || n < 0 || n > maxScore) {
      setDraft(value != null ? String(value) : "");
      return;
    }
    onCommit(n);
  }, [draft, maxScore, value, onCommit]);

  return (
    <Input
      type="number"
      min={0}
      max={maxScore}
      step={0.01}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
      aria-label={label}
      className="h-7 w-16 px-1 text-xs text-center"
    />
  );
}

interface SubCompetencyRatingCellProps {
  crId: string;
  crName: string;
  field: RatingField;
  subRatings: SubCompetencyRating[];
  total: number | string | null;
  canRate: boolean;
  cellStatus: Map<CellKey, "saving" | "saved">;
  onCommit: (subCrId: string, value: number) => void;
}

function SubCompetencyRatingCell({
  crId, crName, field, subRatings, total, canRate, cellStatus, onCommit,
}: SubCompetencyRatingCellProps) {
  const sideLabel = field === "self_rating" ? "Self" : "Appraisor";

  return (
    <div className="space-y-1 text-left">
      {subRatings.map((scr) => {
        const value = field === "self_rating" ? scr.self_rating : scr.manager_rating;
        return (
          <div key={scr.id} className="flex items-center justify-between gap-2">
            <span className="text-xs text-gray-600 truncate" title={scr.name}>
              {scr.name}
            </span>
            {canRate ? (
              <span className="inline-flex items-center flex-shrink-0">
                <SubCompetencyInput
                  value={value}
                  maxScore={Number(scr.max_score)}
                  label={`${sideLabel} rating for ${crName} / ${scr.name}`}
                  onCommit={(n) => onCommit(scr.id, n)}
                />
                <SaveIndicator status={cellStatus.get(`${crId}:${scr.id}:${field}` as CellKey)} />
              </span>
            ) : (
              <span className="text-xs tabular-nums text-gray-700 flex-shrink-0">
                {value != null ? Number(value).toFixed(2) : "—"}
                <span className="text-gray-400">/{Number(scr.max_score).toFixed(2)}</span>
              </span>
            )}
          </div>
        );
      })}
      <div className="pt-1 mt-1 border-t border-gray-200 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500">Total</span>
        <ScoreCell score={total} />
      </div>
    </div>
  );
}

interface AddSubCompetencyControlProps {
  crName: string;
  onAdd: (name: string) => Promise<void>;
}

/**
 * Collapsed "+ Add sub-competency" link that expands into a small
 * inline name field. Only ever shown to the appraisee during their own
 * SELF_ASSESSMENT (canSelfRate) — the backend gate is identical, this
 * is just the matching UI-side restriction.
 */
function AddSubCompetencyControl({ crName, onAdd }: AddSubCompetencyControlProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reset = useCallback(() => {
    setIsOpen(false);
    setName("");
    setError(null);
  }, []);

  const submit = useCallback(async () => {
    const trimmed = name.trim();
    if (trimmed === "") {
      setError("Enter a name.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await onAdd(trimmed);
      reset();
    } catch (err: unknown) {
      setError(extractApiError(err));
    } finally {
      setIsSubmitting(false);
    }
  }, [name, onAdd, reset]);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="mt-1.5 text-xs text-secondary hover:underline"
      >
        + Add sub-competency
      </button>
    );
  }

  return (
    <div className="mt-1.5 space-y-1 text-left">
      <div className="flex items-center gap-1">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
            if (e.key === "Escape") reset();
          }}
          placeholder="New item name"
          aria-label={`New sub-competency name for ${crName}`}
          className="h-7 text-xs px-2 flex-1 min-w-0"
          disabled={isSubmitting}
          autoFocus
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={isSubmitting}
          className="text-xs text-secondary font-medium disabled:opacity-50 flex-shrink-0"
        >
          {isSubmitting ? "Adding…" : "Add"}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={isSubmitting}
          className="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function CompetenciesTab({
  competencies,
  selfRatingEnabled,
  canMgrRate,
  canSelfRate,
  bcAverage,
  bcDescriptor,
  onUpdateRating,
  onUpdateSubRating,
  onAddSubCompetency,
}: CompetenciesTabProps) {
  const colCount = useMemo(
    () => 1 + (selfRatingEnabled ? 1 : 0) + 1,
    [selfRatingEnabled],
  );

  // Track per-cell save status: "saving" | "saved"
  const [cellStatus, setCellStatus] = useState<Map<CellKey, "saving" | "saved">>(new Map());
  const savedTimers = useRef<Map<CellKey, ReturnType<typeof setTimeout>>>(new Map());

  const markSaving = useCallback((key: CellKey) => {
    const existing = savedTimers.current.get(key);
    if (existing) clearTimeout(existing);
    setCellStatus((prev) => new Map(prev).set(key, "saving"));
  }, []);

  const markSettled = useCallback((key: CellKey, saved: boolean) => {
    if (!saved) {
      setCellStatus((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
      return;
    }
    setCellStatus((prev) => new Map(prev).set(key, "saved"));
    const timer = setTimeout(() => {
      setCellStatus((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    }, 1500);
    savedTimers.current.set(key, timer);
  }, []);

  const handleRating = useCallback(
    (crId: string, field: RatingField, value: number) => {
      const key: CellKey = `${crId}:${field}`;
      markSaving(key);
      onUpdateRating(crId, field, value)
        .then(() => markSettled(key, true))
        .catch(() => markSettled(key, false));
    },
    [onUpdateRating, markSaving, markSettled],
  );

  const handleSubRating = useCallback(
    (crId: string, subCrId: string, field: RatingField, value: number) => {
      const key: CellKey = `${crId}:${subCrId}:${field}` as CellKey;
      markSaving(key);
      onUpdateSubRating(crId, subCrId, field, value)
        .then(() => markSettled(key, true))
        .catch(() => markSettled(key, false));
    },
    [onUpdateSubRating, markSaving, markSettled],
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
            {competencies.map((cr) => {
              const subRatings = cr.sub_competency_ratings ?? [];
              const hasSubRatings = subRatings.length > 0;

              return (
                <tr
                  key={cr.id}
                  className="bg-white hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-2 text-gray-900 align-top">
                    <div>{cr.competency_name}</div>
                  </td>
                  {selfRatingEnabled && (
                    <td className="px-4 py-2 text-center align-top">
                      {hasSubRatings ? (
                        <SubCompetencyRatingCell
                          crId={cr.id}
                          crName={cr.competency_name}
                          field="self_rating"
                          subRatings={subRatings}
                          total={cr.self_rating}
                          canRate={canSelfRate}
                          cellStatus={cellStatus}
                          onCommit={(subCrId, n) => handleSubRating(cr.id, subCrId, "self_rating", n)}
                        />
                      ) : canSelfRate ? (
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
                      {canSelfRate && (
                        <AddSubCompetencyControl
                          crName={cr.competency_name}
                          onAdd={(name) => onAddSubCompetency(cr.id, name)}
                        />
                      )}
                    </td>
                  )}
                  <td className="px-4 py-2 text-center align-top">
                    {hasSubRatings ? (
                      <SubCompetencyRatingCell
                        crId={cr.id}
                        crName={cr.competency_name}
                        field="manager_rating"
                        subRatings={subRatings}
                        total={cr.manager_rating}
                        canRate={canMgrRate}
                        cellStatus={cellStatus}
                        onCommit={(subCrId, n) => handleSubRating(cr.id, subCrId, "manager_rating", n)}
                      />
                    ) : canMgrRate ? (
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
              );
            })}
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
