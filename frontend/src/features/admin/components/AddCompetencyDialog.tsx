/**
 * AddCompetencyDialog — Modal form for creating a new competency.
 * Collects name and category. Shows inline 409 conflict error.
 */

import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCompetency } from "@/api/competencies";
import { extractApiError } from "@/utils/extract-api-error";
import { isAxiosError } from "axios";

interface AddCompetencyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormState { name: string; category: string }
interface FormErrors { name: string; category: string; form: string; conflict: boolean }

const INITIAL_FORM: FormState = { name: "", category: "" };
const INITIAL_ERRORS: FormErrors = { name: "", category: "", form: "", conflict: false };

function validate(form: FormState): FormErrors {
  const errors = { ...INITIAL_ERRORS };
  if (!form.name.trim()) errors.name = "Name is required.";
  if (!form.category.trim()) errors.category = "Category is required.";
  return errors;
}

function hasErrors(e: FormErrors): boolean {
  return Boolean(e.name || e.category || e.form);
}

export function AddCompetencyDialog({ isOpen, onClose, onSuccess }: AddCompetencyDialogProps) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<FormErrors>(INITIAL_ERRORS);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = useCallback(() => { setForm(INITIAL_FORM); setErrors(INITIAL_ERRORS); setIsSubmitting(false); }, []);
  const handleClose = useCallback(() => { resetForm(); onClose(); }, [resetForm, onClose]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate(form);
    setErrors(v);
    if (hasErrors(v)) return;
    setIsSubmitting(true);
    setErrors(INITIAL_ERRORS);
    try {
      await createCompetency({ name: form.name.trim(), category: form.category.trim() });
      resetForm();
      onSuccess();
    } catch (err: unknown) {
      if (isAxiosError(err) && err.response?.status === 409) {
        setErrors((prev) => ({ ...prev, conflict: true }));
      } else {
        setErrors((prev) => ({ ...prev, form: extractApiError(err) }));
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [form, resetForm, onSuccess]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-md" role="dialog" aria-labelledby="add-competency-title" aria-modal="true">
        <DialogHeader className="border-b pb-4">
          <DialogTitle id="add-competency-title" className="text-lg font-semibold text-gray-900">Add Competency</DialogTitle>
        </DialogHeader>

        <form className="py-5 space-y-4 px-1" onSubmit={handleSubmit} aria-label="Add competency form">
          <div className="space-y-1">
            <Label htmlFor="comp-name" className="text-sm font-medium text-gray-900">
              Name <span className="text-red-700">*</span>
            </Label>
            <Input id="comp-name" placeholder="e.g. Customer Focus" aria-required="true"
              className={`h-10 border-gray-200 focus-visible:ring-2 focus-visible:ring-secondary ${errors.name ? "border-red-300" : ""}`}
              aria-describedby={errors.name ? "comp-name-error" : undefined}
              value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            {errors.name && <p id="comp-name-error" role="alert" className="text-sm text-red-700 mt-1">{errors.name}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="comp-category" className="text-sm font-medium text-gray-900">
              Category <span className="text-red-700">*</span>
            </Label>
            <select
              id="comp-category"
              aria-required="true"
              aria-describedby={errors.category ? "comp-category-error" : undefined}
              className={`h-10 w-full rounded-md border px-3 text-sm text-gray-900 focus:ring-2 focus:ring-secondary focus:outline-none ${errors.category ? "border-red-300" : "border-gray-200"}`}
              value={form.category}
              onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
            >
              <option value="">Select category…</option>
              <option value="ALL">All Staff</option>
              <option value="MANAGERIAL">Managerial</option>
              <option value="NON_MANAGERIAL">Non-Managerial</option>
            </select>
            {errors.category && <p role="alert" className="text-sm text-red-700 mt-1">{errors.category}</p>}
          </div>

          {errors.conflict && (
            <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3" role="alert" aria-live="polite">
              <p className="text-sm text-red-700">A competency with this name already exists in the selected category.</p>
            </div>
          )}
          {errors.form && <p role="alert" className="text-sm text-red-700">{errors.form}</p>}

          <DialogFooter className="border-t pt-4 gap-3">
            <Button type="button" variant="outline" className="border-gray-200" onClick={handleClose} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting} className="bg-primary text-white hover:bg-primary-dark">
              {isSubmitting ? "Adding\u2026" : "Add Competency"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
