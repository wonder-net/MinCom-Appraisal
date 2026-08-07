/**
 * EditCycleDialog — Modal form for editing an existing appraisal cycle.
 *
 * Pre-populates fields from the selected cycle. Disabled for CLOSED
 * cycles with an info banner. Only sends changed (dirty) fields on submit.
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateCycle } from "@/api/appraisals";
import { extractApiError } from "@/utils/extract-api-error";
import type { AppraisalCycle, UpdateCyclePayload } from "@/types";
import {
  type CycleFormValues,
  type CycleFormErrors,
  INITIAL_CYCLE_FORM,
  INITIAL_CYCLE_ERRORS,
  validateCycleForm,
  hasErrors,
} from "../utils/validate-cycle-form";

interface EditCycleDialogProps {
  cycle: AppraisalCycle | null;
  onClose: () => void;
  onSuccess: () => void;
}

function cycleToFormValues(cycle: AppraisalCycle): CycleFormValues {
  return {
    period_name: cycle.period_name ?? "",
    start_date: cycle.start_date ?? "",
    end_date: cycle.end_date ?? "",
    self_rating_enabled: cycle.self_rating_enabled ?? true,
  };
}

function computeDirtyFields(
  original: CycleFormValues,
  current: CycleFormValues,
): UpdateCyclePayload {
  const payload: UpdateCyclePayload = {};
  if (current.period_name !== original.period_name) {
    payload.period_name = current.period_name.trim();
  }
  if (current.start_date !== original.start_date) {
    payload.start_date = current.start_date;
  }
  if (current.end_date !== original.end_date) {
    payload.end_date = current.end_date;
  }
  if (current.self_rating_enabled !== original.self_rating_enabled) {
    payload.self_rating_enabled = current.self_rating_enabled;
  }
  return payload;
}

export function EditCycleDialog({ cycle, onClose, onSuccess }: EditCycleDialogProps) {
  const isOpen = cycle !== null;
  const isReadOnly = cycle?.status !== "DRAFT";

  const [form, setForm] = useState<CycleFormValues>(INITIAL_CYCLE_FORM);
  const [originalForm, setOriginalForm] = useState<CycleFormValues>(INITIAL_CYCLE_FORM);
  const [errors, setErrors] = useState<CycleFormErrors>(INITIAL_CYCLE_ERRORS);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (cycle) {
      const values = cycleToFormValues(cycle);
      setForm(values);
      setOriginalForm(values);
      setErrors(INITIAL_CYCLE_ERRORS);
      setIsSubmitting(false);
    }
  }, [cycle]);

  const handleClose = useCallback(() => {
    setForm(INITIAL_CYCLE_FORM);
    setErrors(INITIAL_CYCLE_ERRORS);
    setIsSubmitting(false);
    onClose();
  }, [onClose]);

  const dirtyPayload = useMemo(
    () => computeDirtyFields(originalForm, form),
    [originalForm, form],
  );

  const hasDirtyFields = useMemo(
    () => Object.keys(dirtyPayload).length > 0,
    [dirtyPayload],
  );

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cycle || isReadOnly) return;

    const validationErrors = validateCycleForm(form);
    setErrors(validationErrors);
    if (hasErrors(validationErrors)) return;

    if (!hasDirtyFields) {
      handleClose();
      return;
    }

    setIsSubmitting(true);
    setErrors(INITIAL_CYCLE_ERRORS);

    try {
      await updateCycle(cycle.id, dirtyPayload);
      handleClose();
      onSuccess();
    } catch (err: unknown) {
      setErrors((prev) => ({ ...prev, form: extractApiError(err) }));
    } finally {
      setIsSubmitting(false);
    }
  }, [cycle, isReadOnly, form, hasDirtyFields, dirtyPayload, handleClose, onSuccess]);

  const updateField = useCallback(
    <K extends keyof CycleFormValues>(field: K, value: CycleFormValues[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSubmitting && handleClose()}>
      <DialogContent
        className="max-w-lg"
        role="dialog"
        aria-labelledby="edit-cycle-title"
        aria-modal="true"
      >
        <DialogHeader className="px-6 py-4 border-b border-gray-200">
          <DialogTitle
            id="edit-cycle-title"
            className="text-sm font-semibold text-gray-900"
          >
            {isReadOnly ? "View Appraisal Cycle" : "Edit Appraisal Cycle"}
          </DialogTitle>
        </DialogHeader>

        {isReadOnly && (
          <div
            className="mx-6 mt-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-3"
            role="alert"
          >
            <p className="text-sm text-blue-800">
              Only draft cycles can be edited. This cycle is {cycle?.status?.toLowerCase() ?? "not in draft"} status.
            </p>
          </div>
        )}

        <form
          className="px-6 py-5 space-y-4"
          onSubmit={handleSubmit}
          aria-label="Edit cycle form"
        >
          <div className="space-y-1">
            <Label htmlFor="edit-cycle-period-name">
              Period Name <span className="text-red-600">*</span>
            </Label>
            <Input
              id="edit-cycle-period-name"
              placeholder="e.g. 2026 Annual Appraisal"
              value={form.period_name}
              onChange={(e) => updateField("period_name", e.target.value)}
              disabled={isReadOnly}
              className={`h-10 border-gray-300 focus-visible:ring-2 focus-visible:ring-secondary ${errors.period_name ? "border-red-300" : ""}`}
              aria-required="true"
              aria-describedby={errors.period_name ? "edit-cycle-period-name-error" : undefined}
            />
            {errors.period_name && (
              <p id="edit-cycle-period-name-error" role="alert" className="text-sm text-red-600 mt-1">
                {errors.period_name}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="edit-cycle-start">
                Start Date <span className="text-red-600">*</span>
              </Label>
              <Input
                id="edit-cycle-start"
                type="date"
                value={form.start_date}
                onChange={(e) => updateField("start_date", e.target.value)}
                disabled={isReadOnly}
                className={`h-10 border-gray-300 focus-visible:ring-2 focus-visible:ring-secondary ${errors.start_date ? "border-red-300" : ""}`}
                aria-required="true"
                aria-describedby={errors.start_date ? "edit-cycle-start-error" : undefined}
              />
              {errors.start_date && (
                <p id="edit-cycle-start-error" role="alert" className="text-sm text-red-600 mt-1">
                  {errors.start_date}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-cycle-end">
                End Date <span className="text-red-600">*</span>
              </Label>
              <Input
                id="edit-cycle-end"
                type="date"
                value={form.end_date}
                onChange={(e) => updateField("end_date", e.target.value)}
                disabled={isReadOnly}
                className={`h-10 border-gray-300 focus-visible:ring-2 focus-visible:ring-secondary ${errors.end_date ? "border-red-300" : ""}`}
                aria-required="true"
                aria-describedby={errors.end_date ? "edit-cycle-end-error" : undefined}
              />
              {errors.end_date && (
                <p id="edit-cycle-end-error" role="alert" className="text-sm text-red-600 mt-1">
                  {errors.end_date}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              id="edit-cycle-self-rating"
              type="checkbox"
              checked={form.self_rating_enabled}
              onChange={(e) => updateField("self_rating_enabled", e.target.checked)}
              disabled={isReadOnly}
              className="h-4 w-4 rounded border-gray-300 text-secondary focus:ring-2 focus:ring-secondary disabled:cursor-not-allowed disabled:opacity-50"
              aria-describedby="edit-cycle-self-rating-desc"
            />
            <Label htmlFor="edit-cycle-self-rating" className="cursor-pointer">
              Enable Self Rating
            </Label>
            <span id="edit-cycle-self-rating-desc" className="sr-only">
              When enabled, employees can rate themselves before manager review.
            </span>
          </div>

          {errors.form && (
            <p role="alert" className="text-sm text-red-600 mt-2">{errors.form}</p>
          )}

          <DialogFooter className="px-0 py-4 border-t border-gray-200 gap-3">
            <button
              type="button"
              className="h-9 px-4 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            {!isReadOnly && (
              <button
                type="submit"
                disabled={isSubmitting}
                className="h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
              >
                {isSubmitting ? "Saving..." : "Save Changes"}
              </button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
