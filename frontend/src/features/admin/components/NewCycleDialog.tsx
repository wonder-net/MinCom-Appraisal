/**
 * NewCycleDialog — Modal form for creating a new appraisal cycle.
 *
 * Validates all fields before submission and shows inline errors.
 * On success, closes the dialog and calls onSuccess to refetch data.
 */

import { useState, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpIcon } from "@/components/HelpIcon";
import { createCycle } from "@/api/appraisals";
import { extractApiError } from "@/utils/extract-api-error";
import {
  type CycleFormValues,
  type CycleFormErrors,
  INITIAL_CYCLE_FORM,
  INITIAL_CYCLE_ERRORS,
  validateCycleForm,
  hasErrors,
} from "../utils/validate-cycle-form";

interface NewCycleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function NewCycleDialog({ isOpen, onClose, onSuccess }: NewCycleDialogProps) {
  const [form, setForm] = useState<CycleFormValues>(INITIAL_CYCLE_FORM);
  const [errors, setErrors] = useState<CycleFormErrors>(INITIAL_CYCLE_ERRORS);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = useCallback(() => {
    setForm(INITIAL_CYCLE_FORM);
    setErrors(INITIAL_CYCLE_ERRORS);
    setIsSubmitting(false);
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validateCycleForm(form);
    setErrors(validationErrors);
    if (hasErrors(validationErrors)) return;

    setIsSubmitting(true);
    setErrors(INITIAL_CYCLE_ERRORS);

    try {
      await createCycle({
        period_name: form.period_name.trim(),
        start_date: form.start_date,
        end_date: form.end_date,
        self_rating_enabled: form.self_rating_enabled,
      });
      resetForm();
      onSuccess();
    } catch (err: unknown) {
      setErrors((prev) => ({ ...prev, form: extractApiError(err) }));
    } finally {
      setIsSubmitting(false);
    }
  }, [form, resetForm, onSuccess]);

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
        aria-labelledby="new-cycle-title"
      >
        <DialogHeader className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <DialogTitle
              id="new-cycle-title"
              className="text-sm font-semibold text-gray-900"
            >
              New Appraisal Cycle
            </DialogTitle>
            <HelpIcon
              to="/help/hr-admin-guide/managing-cycles"
              label="managing cycles"
            />
          </div>
        </DialogHeader>

        <form
          className="px-6 py-5 space-y-4"
          onSubmit={handleSubmit}
          aria-label="New cycle form"
        >
          <div className="space-y-1">
            <Label htmlFor="new-cycle-period-name">
              Period Name <span className="text-red-600">*</span>
            </Label>
            <Input
              id="new-cycle-period-name"
              placeholder="e.g. 2026 Annual Appraisal"
              value={form.period_name}
              onChange={(e) => updateField("period_name", e.target.value)}
              className={`h-10 border-gray-300 focus-visible:ring-2 focus-visible:ring-secondary ${errors.period_name ? "border-red-300" : ""}`}
              aria-required="true"
              aria-describedby={errors.period_name ? "new-cycle-period-name-error" : undefined}
            />
            {errors.period_name && (
              <p id="new-cycle-period-name-error" role="alert" className="text-sm text-red-600 mt-1">
                {errors.period_name}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="new-cycle-start">
                Start Date <span className="text-red-600">*</span>
              </Label>
              <Input
                id="new-cycle-start"
                type="date"
                value={form.start_date}
                onChange={(e) => updateField("start_date", e.target.value)}
                className={`h-10 border-gray-300 focus-visible:ring-2 focus-visible:ring-secondary ${errors.start_date ? "border-red-300" : ""}`}
                aria-required="true"
                aria-describedby={errors.start_date ? "new-cycle-start-error" : undefined}
              />
              {errors.start_date && (
                <p id="new-cycle-start-error" role="alert" className="text-sm text-red-600 mt-1">
                  {errors.start_date}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-cycle-end">
                End Date <span className="text-red-600">*</span>
              </Label>
              <Input
                id="new-cycle-end"
                type="date"
                value={form.end_date}
                onChange={(e) => updateField("end_date", e.target.value)}
                className={`h-10 border-gray-300 focus-visible:ring-2 focus-visible:ring-secondary ${errors.end_date ? "border-red-300" : ""}`}
                aria-required="true"
                aria-describedby={errors.end_date ? "new-cycle-end-error" : undefined}
              />
              {errors.end_date && (
                <p id="new-cycle-end-error" role="alert" className="text-sm text-red-600 mt-1">
                  {errors.end_date}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              id="new-cycle-self-rating"
              type="checkbox"
              checked={form.self_rating_enabled}
              onChange={(e) => updateField("self_rating_enabled", e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-secondary focus:ring-2 focus:ring-secondary"
              aria-describedby="new-cycle-self-rating-desc"
            />
            <Label htmlFor="new-cycle-self-rating" className="cursor-pointer">
              Enable Self Rating
            </Label>
            <span id="new-cycle-self-rating-desc" className="sr-only">
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
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {isSubmitting ? "Creating..." : "Create Cycle"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
