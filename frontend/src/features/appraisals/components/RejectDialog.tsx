/**
 * RejectDialog — Modal dialog for capturing a rejection reason.
 *
 * Uses the Dialog component (native HTML dialog), NOT browser prompt().
 * Submit button disabled until reason is non-empty (trimmed).
 */

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { extractApiError } from "@/utils/extract-api-error";

interface RejectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}

export function RejectDialog({ isOpen, onClose, onSubmit }: RejectDialogProps) {
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const trimmedReason = reason.trim();
  const canSubmit = trimmedReason.length > 0 && !isSubmitting;

  const handleClose = useCallback(() => {
    if (isSubmitting) return;
    setReason("");
    setSubmitError(null);
    onClose();
  }, [isSubmitting, onClose]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      await onSubmit(trimmedReason);
      setReason("");
      setSubmitError(null);
      onClose();
    } catch (err: unknown) {
      setSubmitError(extractApiError(err));
    } finally {
      setIsSubmitting(false);
    }
  }, [canSubmit, trimmedReason, onSubmit, onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        className="max-w-md"
        role="dialog"
        aria-labelledby="reject-dialog-title"
        aria-modal="true"
      >
        <DialogHeader>
          <DialogTitle
            id="reject-dialog-title"
            className="text-lg font-semibold text-gray-900"
          >
            Reject Appraisal
          </DialogTitle>
        </DialogHeader>

        <div className="py-2">
          <p className="text-sm text-gray-500 mb-4">
            Please provide a reason for rejection. This will be visible to both
            parties.
          </p>
          <label
            htmlFor="reject-reason"
            className="block text-sm font-medium text-gray-900 mb-1"
          >
            Rejection reason <span className="text-red-700">*</span>
          </label>
          <Textarea
            id="reject-reason"
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Describe why this appraisal is being rejected..."
            aria-describedby={submitError ? "reject-error" : "reject-hint"}
            className="resize-none focus-visible:ring-2 focus-visible:ring-secondary"
          />
          <p id="reject-hint" className="text-xs text-gray-500 mt-1">
            Required. Submit is enabled once a reason is entered.
          </p>
          {submitError && (
            <p
              id="reject-error"
              role="alert"
              className="text-sm text-red-700 mt-1"
            >
              {submitError}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!canSubmit}
            aria-disabled={!canSubmit}
            className="bg-red-700 hover:bg-red-800"
            onClick={() => void handleSubmit()}
          >
            {isSubmitting ? "Submitting..." : "Confirm Rejection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
