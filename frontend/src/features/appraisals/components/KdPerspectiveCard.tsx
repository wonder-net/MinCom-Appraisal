/**
 * KdPerspectiveCard — KD table for a single BSC perspective
 * with coloured left border, inline editing, and appraisor rating inputs.
 *
 * Editing uses explicit Save/Cancel buttons (not onBlur) to avoid
 * race conditions with Delete.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { KeyDeliverable, BscPerspective, UpdateKeyDeliverableRequest } from "@/types";

interface KdPerspectiveCardProps {
  perspective: BscPerspective;
  deliverables: KeyDeliverable[];
  selfRatingEnabled: boolean;
  canEditKd: boolean;
  canMgrRate: boolean;
  weightCap: number | null;
  maxKdCount: number | null;
  totalWeight: number;
  onUpdateKd: (kdId: string, updates: UpdateKeyDeliverableRequest) => void;
  onDeleteKd: (kdId: string) => void;
  onAddKd: (perspective: BscPerspective, description: string, weight: number, selfRating?: number, managerRating?: number) => void;
  onWeightError?: (message: string) => void;
}

interface AddFormState {
  description: string;
  weight: string;
  self_rating: string;
  manager_rating: string;
}

const PERSPECTIVE_CONFIG: Record<
  BscPerspective,
  { label: string; borderColor: string; bgGradient: string }
> = {
  FINANCIAL: {
    label: "Financial",
    borderColor: "border-l-blue-500",
    bgGradient: "from-blue-50 to-white",
  },
  CUSTOMER: {
    label: "Customer",
    borderColor: "border-l-teal-500",
    bgGradient: "from-teal-50 to-white",
  },
  INTERNAL_BUSINESS_PROCESSES: {
    label: "Internal Business Processes",
    borderColor: "border-l-purple-500",
    bgGradient: "from-purple-50 to-white",
  },
  LEARNING_AND_GROWTH: {
    label: "Learning and Growth",
    borderColor: "border-l-amber-500",
    bgGradient: "from-amber-50 to-white",
  },
};

const RATING_OPTIONS = [1, 2, 3, 4, 5] as const;

const EMPTY_ADD_FORM: AddFormState = { description: "", weight: "", self_rating: "", manager_rating: "" };

function ScoreCell({ score }: { score: string | number | null }) {
  if (score === null || score === undefined) return <span className="text-gray-400">&mdash;</span>;
  const n = Number(score);
  const colour =
    n >= 4 ? "text-emerald-700" : n >= 3 ? "text-amber-600" : "text-red-700";
  return <span className={`font-semibold tabular-nums ${colour}`}>{n.toFixed(2)}</span>;
}

export function KdPerspectiveCard({
  perspective,
  deliverables,
  selfRatingEnabled,
  canEditKd,
  canMgrRate,
  weightCap,
  maxKdCount,
  totalWeight,
  onUpdateKd,
  onDeleteKd,
  onAddKd,
  onWeightError,
}: KdPerspectiveCardProps) {
  const config = PERSPECTIVE_CONFIG[perspective];
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<AddFormState>(EMPTY_ADD_FORM);
  const [deleteTarget, setDeleteTarget] = useState<KeyDeliverable | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<AddFormState>(EMPTY_ADD_FORM);
  const editInputRef = useRef<HTMLInputElement>(null);
  const addDescRef = useRef<HTMLInputElement>(null);

  // Base: Description, Weight, Appraisor Rating, Weighted Score = 4
  const colCount =
    4 + (selfRatingEnabled ? 1 : 0) + (canEditKd ? 1 : 0);

  const currentWeight = deliverables.reduce((sum, kd) => sum + Number(kd.weight), 0);
  // Use Math.round on percentages to avoid floating-point comparison issues
  // (e.g. 0.10 + 0.10 + 0.05 may not exactly equal 0.25 in floating point)
  const remainingPct = weightCap !== null
    ? Math.round((weightCap - currentWeight) * 100)
    : Math.round((1.0 - totalWeight) * 100);
  const weightCapReached = remainingPct <= 0;
  const atMaxKd = maxKdCount !== null && deliverables.length >= maxKdCount;

  const handleStartEdit = useCallback((kd: KeyDeliverable) => {
    setEditingId(kd.id);
    setEditForm({
      description: kd.description,
      weight: String(Math.round(Number(kd.weight) * 100)),
      self_rating: kd.self_rating != null ? String(Math.round(Number(kd.self_rating))) : "",
      manager_rating: kd.manager_rating != null ? String(Math.round(Number(kd.manager_rating))) : "",
    });
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingId) return;
    const desc = editForm.description.trim();
    const w = parseFloat(editForm.weight);
    if (!desc || isNaN(w) || w <= 0 || w > 100) return;
    const original = deliverables.find((kd) => kd.id === editingId);
    if (!original) return;
    // Enforce weight cap: remaining cap + this KD's own weight is the max allowed
    const otherWeight = currentWeight - Number(original.weight);
    if (weightCap !== null) {
      const maxPct = Math.max(0, Math.round((weightCap - otherWeight) * 100));
      if (w > maxPct) {
        onWeightError?.(`Weight ${w}% exceeds the allowed maximum (${maxPct}%). Reduce the weight or adjust existing KDs.`);
        return;
      }
    } else {
      const otherTotal = totalWeight - Number(original.weight);
      const totalRemainingPct = Math.max(0, Math.round((1.0 - otherTotal) * 100));
      if (w > totalRemainingPct) {
        onWeightError?.(`Total weight cannot exceed 100%. Current total (excluding this KD): ${Math.round(otherTotal * 100)}%, new weight: ${w}%.`);
        return;
      }
    }
    // Collect only changed fields into a single update
    const changes: UpdateKeyDeliverableRequest = {};
    if (desc !== original.description) changes.description = desc;
    const newWeight = Math.round(w) / 100;
    if (Math.abs(newWeight - Number(original.weight)) > 1e-9) changes.weight = newWeight;
    const newSr = editForm.self_rating ? Number(editForm.self_rating) : null;
    if (newSr !== original.self_rating) changes.self_rating = newSr;
    const newMr = editForm.manager_rating ? Number(editForm.manager_rating) : null;
    if (newMr !== original.manager_rating) changes.manager_rating = newMr;
    if (Object.keys(changes).length > 0) {
      onUpdateKd(editingId, changes);
    }
    setEditingId(null);
    setEditForm(EMPTY_ADD_FORM);
  }, [editingId, editForm, onUpdateKd, deliverables, weightCap, currentWeight, totalWeight, onWeightError]);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditForm(EMPTY_ADD_FORM);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (deleteTarget) {
      onDeleteKd(deleteTarget.id);
      setDeleteTarget(null);
    }
  }, [deleteTarget, onDeleteKd]);

  const handleShowAddForm = useCallback(() => {
    setShowAddForm(true);
    setAddForm(EMPTY_ADD_FORM);
  }, []);

  const handleCancelAdd = useCallback(() => {
    setShowAddForm(false);
    setAddForm(EMPTY_ADD_FORM);
  }, []);

  const handleSaveAdd = useCallback(() => {
    const desc = addForm.description.trim();
    const w = parseFloat(addForm.weight);
    if (!desc || isNaN(w) || w <= 0 || w > 100) return;
    const newWeightDecimal = Math.round(w) / 100;
    // Enforce per-perspective weight cap (Form B) or total 100% cap (Form A)
    if (weightCap !== null) {
      const maxPct = Math.max(0, Math.round((weightCap - currentWeight) * 100));
      if (w > maxPct) {
        onWeightError?.(`Weight ${w}% exceeds the remaining capacity (${maxPct}% available). Reduce the weight or adjust existing KDs.`);
        return;
      }
    } else {
      const totalRemainingPct = Math.max(0, Math.round((1.0 - totalWeight) * 100));
      if (w > totalRemainingPct) {
        onWeightError?.(`Total weight cannot exceed 100%. Current total: ${Math.round(totalWeight * 100)}%, attempting to add: ${w}%.`);
        return;
      }
    }
    const sr = addForm.self_rating ? Number(addForm.self_rating) : undefined;
    const mr = addForm.manager_rating ? Number(addForm.manager_rating) : undefined;
    onAddKd(perspective, desc, newWeightDecimal, sr, mr);
    setShowAddForm(false);
    setAddForm(EMPTY_ADD_FORM);
  }, [addForm, perspective, onAddKd, weightCap, currentWeight, totalWeight, onWeightError]);

  useEffect(() => {
    if (editingId) {
      editInputRef.current?.focus();
    }
  }, [editingId]);

  useEffect(() => {
    if (showAddForm) {
      addDescRef.current?.focus();
    }
  }, [showAddForm]);

  return (
    <div className={`border-l-4 ${config.borderColor} rounded-r-lg bg-white border border-gray-200 shadow-sm overflow-hidden`}>
      <div className={`px-4 py-3 bg-gradient-to-r ${config.bgGradient} border-b border-gray-200 flex items-center justify-between`}>
        <h3 className="text-sm font-semibold text-gray-800">{config.label}</h3>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {weightCap !== null && (
            <span className={weightCapReached ? "text-amber-600 font-semibold" : ""}>
              Weight: {Math.round(currentWeight * 100)}% / {Math.round(weightCap * 100)}%
            </span>
          )}
          {maxKdCount !== null && (
            <span className={atMaxKd ? "text-amber-600 font-semibold" : ""}>
              Items: {deliverables.length} / {maxKdCount}
            </span>
          )}
        </div>
      </div>
      <div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-gray-500 bg-gray-50 border-b">
              <th scope="col" className="px-4 py-2 text-left font-semibold w-[40%]">Description</th>
              <th scope="col" className="px-4 py-2 text-center font-semibold">Weight (%)</th>
              {selfRatingEnabled && (
                <th scope="col" className="px-4 py-2 text-center font-semibold">Self Rating</th>
              )}
              <th scope="col" className="px-4 py-2 text-center font-semibold">Appraisor Rating</th>
              <th scope="col" className="px-4 py-2 text-center font-semibold">Weighted Score</th>
              {canEditKd && (
                <th scope="col" className="px-4 py-2 text-right font-semibold w-24">Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {deliverables.length === 0 && !canEditKd && (
              <tr>
                <td colSpan={colCount} className="px-4 py-6 text-center text-gray-400 text-sm">
                  No key performance indicators in this perspective.
                </td>
              </tr>
            )}
            {deliverables.map((kd, kdIndex) => (
              <tr key={kd.id} className={kdIndex % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                <td className="px-4 py-2 text-gray-900">
                  {editingId === kd.id ? (
                    <Input
                      ref={editInputRef}
                      value={editForm.description}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
                      className="h-8 text-sm"
                      aria-label="Edit description"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveEdit();
                        if (e.key === "Escape") handleCancelEdit();
                      }}
                    />
                  ) : (
                    kd.description
                  )}
                </td>
                <td className="px-4 py-2 text-center tabular-nums">
                  {editingId === kd.id ? (
                    <Input
                      value={editForm.weight}
                      onChange={(e) => {
                        const val = e.target.value;
                        const otherTotal = totalWeight - Number(kd.weight);
                        const editMax = weightCap !== null
                          ? Math.max(0, Math.round((weightCap - currentWeight + Number(kd.weight)) * 100))
                          : Math.max(0, Math.round((1.0 - otherTotal) * 100));
                        if (val === "" || (Number(val) >= 0 && Number(val) <= editMax)) {
                          setEditForm((prev) => ({ ...prev, weight: val }));
                        }
                      }}
                      className="h-8 text-sm w-20 mx-auto text-center"
                      aria-label="Edit weight (%)"
                      type="number"
                      step="1"
                      min="1"
                      max={weightCap !== null
                        ? Math.round(Math.max(0, (weightCap - currentWeight + Number(kd.weight)) * 100)).toString()
                        : Math.round(Math.max(0, (1.0 - totalWeight + Number(kd.weight)) * 100)).toString()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveEdit();
                        if (e.key === "Escape") handleCancelEdit();
                      }}
                    />
                  ) : (
                    <>{Math.round(Number(kd.weight) * 100)}%</>
                  )}
                </td>
                {selfRatingEnabled && (
                  <td className="px-4 py-2 text-center">
                    {editingId === kd.id ? (
                      <select
                        value={editForm.self_rating}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, self_rating: e.target.value }))}
                        aria-label="Edit self rating"
                        className="h-8 w-16 rounded border border-gray-300 px-1 text-sm text-center focus-visible:ring-2 focus-visible:ring-secondary"
                      >
                        <option value="">-</option>
                        {RATING_OPTIONS.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    ) : (
                      <ScoreCell score={kd.self_rating} />
                    )}
                  </td>
                )}
                <td className="px-4 py-2 text-center">
                  {canMgrRate ? (
                    <select
                      value={kd.manager_rating != null ? Math.round(Number(kd.manager_rating)) : ""}
                      onChange={(e) =>
                        onUpdateKd(kd.id, { manager_rating: e.target.value ? Number(e.target.value) : null })
                      }
                      aria-label={`Appraisor rating for ${kd.description}`}
                      className="h-8 w-16 rounded border border-gray-300 px-1 text-sm text-center focus-visible:ring-2 focus-visible:ring-secondary"
                    >
                      <option value="">-</option>
                      {RATING_OPTIONS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  ) : (
                    <ScoreCell score={kd.manager_rating} />
                  )}
                </td>
                <td className="px-4 py-2 text-center">
                  <ScoreCell score={kd.weighted_score} />
                </td>
                {canEditKd && (
                  <td className="px-4 py-2 text-right space-x-1">
                    {editingId === kd.id ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-emerald-700 hover:text-emerald-900"
                          onClick={handleSaveEdit}
                          disabled={!editForm.description.trim() || !editForm.weight || Number(editForm.weight) <= 0}
                          aria-label="Save changes"
                        >
                          Save
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-gray-500 hover:text-gray-700"
                          onClick={handleCancelEdit}
                          aria-label="Cancel editing"
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-gray-500 hover:text-blue-700"
                          aria-label={`Edit ${kd.description}`}
                          onClick={() => handleStartEdit(kd)}
                        >
                          &#9998;
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-gray-500 hover:text-red-700"
                          aria-label={`Delete ${kd.description}`}
                          onClick={() => setDeleteTarget(kd)}
                        >
                          &#10005;
                        </Button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {/* Inline add form row */}
            {canEditKd && showAddForm && (
              <tr className="bg-blue-50/30">
                <td className="px-4 py-2">
                  <Input
                    ref={addDescRef}
                    value={addForm.description}
                    onChange={(e) =>
                      setAddForm((prev) => ({ ...prev, description: e.target.value }))
                    }
                    placeholder="KD description"
                    className="h-8 text-sm"
                    aria-label="New key performance indicator description"
                    onKeyDown={(e) => {
                      if (e.key === "Escape") handleCancelAdd();
                    }}
                  />
                </td>
                <td className="px-4 py-2 text-center">
                  <Input
                    value={addForm.weight}
                    onChange={(e) => {
                      const val = e.target.value;
                      // Allow empty or partial input, but reject values > remaining cap (in %)
                      // Use Math.round to avoid floating-point truncation (e.g. 0.30 - 0.25 = 0.04999... * 100 = 4.999...)
                      const maxAllowed = weightCap !== null
                        ? Math.max(0, Math.round((weightCap - currentWeight) * 100))
                        : Math.max(0, Math.round((1.0 - totalWeight) * 100));
                      if (val === "" || (Number(val) >= 0 && Number(val) <= maxAllowed)) {
                        setAddForm((prev) => ({ ...prev, weight: val }));
                      }
                    }}
                    placeholder="0"
                    className="h-8 text-sm w-20 mx-auto text-center"
                    aria-label="New key performance indicator weight (%)"
                    type="number"
                    step="1"
                    min="0"
                    max={weightCap !== null
                      ? Math.round(Math.max(0, (weightCap - currentWeight) * 100)).toString()
                      : Math.round(Math.max(0, (1.0 - totalWeight) * 100)).toString()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveAdd();
                      if (e.key === "Escape") handleCancelAdd();
                    }}
                  />
                </td>
                {selfRatingEnabled && (
                  <td className="px-4 py-2 text-center">
                    <select
                      value={addForm.self_rating}
                      onChange={(e) =>
                        setAddForm((prev) => ({ ...prev, self_rating: e.target.value }))
                      }
                      aria-label="New key performance indicator self rating"
                      className="h-8 w-16 rounded border border-gray-300 px-1 text-sm text-center focus-visible:ring-2 focus-visible:ring-secondary"
                    >
                      <option value="">-</option>
                      {RATING_OPTIONS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </td>
                )}
                <td className="px-4 py-2 text-center">
                  {canMgrRate ? (
                    <select
                      value={addForm.manager_rating}
                      onChange={(e) =>
                        setAddForm((prev) => ({ ...prev, manager_rating: e.target.value }))
                      }
                      aria-label="New key performance indicator appraisor rating"
                      className="h-8 w-16 rounded border border-gray-300 px-1 text-sm text-center focus-visible:ring-2 focus-visible:ring-secondary"
                    >
                      <option value="">-</option>
                      {RATING_OPTIONS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-gray-400">&mdash;</span>
                  )}
                </td>
                <td className="px-4 py-2 text-center text-gray-400">&mdash;</td>
                <td className="px-4 py-2 text-right space-x-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-emerald-700 hover:text-emerald-900"
                    onClick={handleSaveAdd}
                    aria-label="Save new key performance indicator"
                    disabled={!addForm.description.trim() || !addForm.weight}
                  >
                    Save
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-gray-500 hover:text-gray-700"
                    onClick={handleCancelAdd}
                    aria-label="Cancel adding key performance indicator"
                  >
                    Cancel
                  </Button>
                </td>
              </tr>
            )}
            {canEditKd && !showAddForm && (
              <tr className="border-t-2 border-dashed border-gray-200 bg-gray-50/40">
                <td colSpan={colCount} className="px-4 py-2">
                  {atMaxKd ? (
                    <span className="text-xs text-amber-600 px-2">
                      Maximum of {maxKdCount} key performance indicators reached for this perspective.
                    </span>
                  ) : weightCapReached ? (
                    <span className="text-xs text-amber-600 px-2">
                      {weightCap != null
                        ? `Weight cap (${Math.round(weightCap * 100)}%) reached for this perspective.`
                        : "Total weight of 100% reached. Remove or reduce existing KDs to add more."}
                    </span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-blue-700 hover:text-blue-900 w-full justify-start"
                      onClick={handleShowAddForm}
                    >
                      + Add key performance indicator
                    </Button>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Key Performance Indicator"
        description={
          deleteTarget
            ? `Are you sure you want to delete "${deleteTarget.description}"? This action cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
