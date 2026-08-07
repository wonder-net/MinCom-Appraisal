/**
 * EditCompetencyDialog — Modal form for editing an existing competency.
 *
 * The `name` field is rendered disabled because historical appraisal
 * ratings reference it. The form sends a PATCH containing only the
 * mutable fields (`applicable_to`, `is_core`, `sort_order`).
 */

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { patchCompetency } from "@/api/competencies";
import type {
  Competency,
  CompetencyCategory,
  PatchCompetencyPayload,
} from "@/api/competencies";
import { useToast } from "@/hooks/use-toast";
import { ToastContainer } from "@/components/toast-container";
import { extractApiError } from "@/utils/extract-api-error";

interface EditCompetencyDialogProps {
  open: boolean;
  competency: Competency;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormState {
  applicableTo: CompetencyCategory | "";
  isCore: boolean;
  sortOrder: string;
}

interface FormErrors {
  applicableTo: string;
  sortOrder: string;
  form: string;
}

const INITIAL_ERRORS: FormErrors = {
  applicableTo: "",
  sortOrder: "",
  form: "",
};

const NAME_DISABLED_TITLE =
  "Name cannot be changed because historical appraisal ratings reference it.";

function buildInitialState(competency: Competency): FormState {
  return {
    applicableTo: competency.applicable_to,
    isCore: competency.is_core,
    sortOrder: String(competency.sort_order),
  };
}

function validate(form: FormState): FormErrors {
  const errors: FormErrors = { ...INITIAL_ERRORS };
  if (!form.applicableTo) {
    errors.applicableTo = "Applicable to is required.";
  }
  const trimmed = form.sortOrder.trim();
  if (trimmed === "") {
    errors.sortOrder = "Sort order is required.";
  } else if (!/^\d+$/.test(trimmed)) {
    errors.sortOrder = "Sort order must be a non-negative integer.";
  } else if (parseInt(trimmed, 10) < 0) {
    errors.sortOrder = "Sort order must be 0 or greater.";
  }
  return errors;
}

function hasErrors(errors: FormErrors): boolean {
  return Boolean(errors.applicableTo || errors.sortOrder || errors.form);
}

function buildPayload(
  form: FormState,
  original: Competency,
): PatchCompetencyPayload {
  const payload: PatchCompetencyPayload = {};
  if (form.applicableTo && form.applicableTo !== original.applicable_to) {
    payload.applicable_to = form.applicableTo;
  }
  if (form.isCore !== original.is_core) {
    payload.is_core = form.isCore;
  }
  const parsed = parseInt(form.sortOrder.trim(), 10);
  if (!Number.isNaN(parsed) && parsed !== original.sort_order) {
    payload.sort_order = parsed;
  }
  return payload;
}

export function EditCompetencyDialog({
  open,
  competency,
  onClose,
  onSuccess,
}: EditCompetencyDialogProps) {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(() =>
    buildInitialState(competency),
  );
  const [errors, setErrors] = useState<FormErrors>(INITIAL_ERRORS);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(buildInitialState(competency));
      setErrors(INITIAL_ERRORS);
      setIsSubmitting(false);
    }
  }, [competency, open]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const v = validate(form);
      setErrors(v);
      if (hasErrors(v)) return;

      const payload = buildPayload(form, competency);
      if (Object.keys(payload).length === 0) {
        onClose();
        return;
      }

      setIsSubmitting(true);
      setErrors(INITIAL_ERRORS);
      try {
        await patchCompetency(competency.id, payload);
        onSuccess();
        onClose();
      } catch (err: unknown) {
        const message = extractApiError(err);
        setErrors((prev) => ({ ...prev, form: message }));
        toast.error(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [form, competency, onSuccess, onClose, toast],
  );

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
        <DialogContent
          className="max-w-md"
          role="dialog"
          aria-labelledby="edit-competency-title"
          aria-modal="true"
        >
          <DialogHeader className="border-b pb-4">
            <DialogTitle
              id="edit-competency-title"
              className="text-lg font-semibold text-gray-900"
            >
              Edit Competency
            </DialogTitle>
          </DialogHeader>

          <form
            className="py-5 space-y-4 px-1"
            onSubmit={handleSubmit}
            aria-label="Edit competency form"
          >
            <div className="space-y-1">
              <Label
                htmlFor="edit-comp-name"
                className="text-sm font-medium text-gray-900"
              >
                Name
              </Label>
              <Input
                id="edit-comp-name"
                value={competency.name}
                disabled
                aria-readonly="true"
                title={NAME_DISABLED_TITLE}
                className="h-10 bg-gray-50 text-gray-500 cursor-not-allowed"
              />
              <p className="text-xs text-gray-500 mt-1">
                Name cannot be changed because historical appraisal ratings
                reference it.
              </p>
            </div>

            <div className="space-y-1">
              <Label
                htmlFor="edit-comp-applicable-to"
                className="text-sm font-medium text-gray-900"
              >
                Applicable to{" "}
                <span className="text-red-700" aria-hidden="true">
                  *
                </span>
              </Label>
              <select
                id="edit-comp-applicable-to"
                aria-required="true"
                aria-describedby={
                  errors.applicableTo
                    ? "edit-comp-applicable-to-error"
                    : undefined
                }
                className={`h-10 w-full rounded-md border px-3 text-sm text-gray-900 focus:ring-2 focus:ring-secondary focus:outline-none ${
                  errors.applicableTo ? "border-red-300" : "border-gray-200"
                }`}
                value={form.applicableTo}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    applicableTo: e.target.value as CompetencyCategory | "",
                  }))
                }
              >
                <option value="">Select…</option>
                <option value="ALL">All Staff</option>
                <option value="MANAGERIAL">Managerial</option>
                <option value="NON_MANAGERIAL">Non-Managerial</option>
              </select>
              {errors.applicableTo && (
                <p
                  id="edit-comp-applicable-to-error"
                  role="alert"
                  className="text-sm text-red-700 mt-1"
                >
                  {errors.applicableTo}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="edit-comp-is-core"
                checked={form.isCore}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, isCore: checked === true }))
                }
              />
              <Label
                htmlFor="edit-comp-is-core"
                className="text-sm font-medium text-gray-900 cursor-pointer"
              >
                Core competency
              </Label>
            </div>

            <div className="space-y-1">
              <Label
                htmlFor="edit-comp-sort-order"
                className="text-sm font-medium text-gray-900"
              >
                Sort order{" "}
                <span className="text-red-700" aria-hidden="true">
                  *
                </span>
              </Label>
              <Input
                id="edit-comp-sort-order"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                aria-required="true"
                aria-describedby={
                  errors.sortOrder ? "edit-comp-sort-order-error" : undefined
                }
                className={`h-10 ${
                  errors.sortOrder ? "border-red-300" : "border-gray-200"
                }`}
                value={form.sortOrder}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, sortOrder: e.target.value }))
                }
              />
              {errors.sortOrder && (
                <p
                  id="edit-comp-sort-order-error"
                  role="alert"
                  className="text-sm text-red-700 mt-1"
                >
                  {errors.sortOrder}
                </p>
              )}
            </div>

            {errors.form && (
              <div
                role="alert"
                className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {errors.form}
              </div>
            )}

            <DialogFooter className="border-t pt-4 gap-3">
              <Button
                type="button"
                variant="outline"
                className="border-gray-200"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-primary text-white hover:bg-primary-dark"
              >
                {isSubmitting ? "Saving…" : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
    </>
  );
}
