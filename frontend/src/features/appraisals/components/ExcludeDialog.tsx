/**
 * ExcludeDialog — AlertDialog for excluding an appraisal.
 *
 * Requires a non-empty reason field before submission.
 */

import { useState, useCallback } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ExcludeDialogProps {
  open: boolean;
  isSubmitting: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export function ExcludeDialog({
  open,
  isSubmitting,
  onConfirm,
  onCancel,
}: ExcludeDialogProps) {
  const [reason, setReason] = useState("");

  const handleCancel = useCallback(() => {
    setReason("");
    onCancel();
  }, [onCancel]);

  const handleConfirm = useCallback(() => {
    if (!reason.trim()) return;
    onConfirm(reason.trim());
    setReason("");
  }, [reason, onConfirm]);

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && handleCancel()}>
      <AlertDialogContent aria-labelledby="exclude-title">
        <AlertDialogHeader>
          <AlertDialogTitle id="exclude-title">
            Exclude Appraisal
          </AlertDialogTitle>
          <AlertDialogDescription>
            This appraisal will be excluded from the current cycle. Provide
            a reason.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="mt-4 space-y-1">
          <Label
            htmlFor="exclude-reason"
            className="text-sm font-medium text-gray-900"
          >
            Reason <span className="text-red-700">*</span>
          </Label>
          <Input
            id="exclude-reason"
            placeholder="Reason for exclusion"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-required="true"
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel} disabled={isSubmitting}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!reason.trim() || isSubmitting}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {isSubmitting ? "Excluding\u2026" : "Exclude"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
