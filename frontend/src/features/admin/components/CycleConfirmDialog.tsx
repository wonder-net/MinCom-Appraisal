/**
 * CycleConfirmDialog — AlertDialog for Activate / Close / Archive
 * lifecycle actions.
 *
 * Uses the shadcn AlertDialog pattern with role="alertdialog".
 * Displays appropriate copy and button styling for each action.
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
import { activateCycle, archiveCycle, closeCycle, finaliseAllInCycle } from "@/api/appraisals";
import { extractApiError } from "@/utils/extract-api-error";
import type { AppraisalCycle } from "@/types";

export type ConfirmAction = "activate" | "close" | "finalise-all" | "archive";

interface CycleConfirmDialogProps {
  action: ConfirmAction | null;
  cycle: AppraisalCycle | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

const COPY: Record<
  ConfirmAction,
  { title: string; description: string; confirmLabel: string }
> = {
  activate: {
    title: "Activate Cycle",
    description:
      "Activating this cycle will create appraisals for all active employees and cannot be undone. Continue?",
    confirmLabel: "Activate",
  },
  close: {
    title: "Close Cycle",
    description:
      "Closing this cycle will prevent any further changes. This cannot be undone. Continue?",
    confirmLabel: "Close Cycle",
  },
  "finalise-all": {
    title: "Finalise All Signed Off",
    description:
      "This will finalise all appraisals in SIGNED OFF status for this cycle. This action cannot be undone. Continue?",
    confirmLabel: "Finalise All",
  },
  archive: {
    title: "Archive Cycle",
    description:
      "Archiving marks this cycle as part of the permanent appraisal record. Once archived, the cycle and its appraisals can no longer be deleted from the admin panel. Continue?",
    confirmLabel: "Archive",
  },
};

export function CycleConfirmDialog({
  action,
  cycle,
  onClose,
  onSuccess,
  onError,
}: CycleConfirmDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isOpen = action !== null && cycle !== null;

  const handleConfirm = useCallback(async () => {
    if (!action || !cycle) return;

    setIsSubmitting(true);
    try {
      if (action === "activate") {
        await activateCycle(cycle.id);
        onSuccess("Cycle activated.");
      } else if (action === "close") {
        await closeCycle(cycle.id);
        onSuccess("Cycle closed.");
      } else if (action === "finalise-all") {
        const result = await finaliseAllInCycle(cycle.id);
        onSuccess(`${result.finalised} appraisal${result.finalised !== 1 ? "s" : ""} finalised.`);
      } else if (action === "archive") {
        await archiveCycle(cycle.id);
        onSuccess("Cycle archived.");
      }
    } catch (err: unknown) {
      onError(extractApiError(err));
    } finally {
      setIsSubmitting(false);
    }
  }, [action, cycle, onSuccess, onError]);

  const handleCancel = useCallback(() => {
    if (!isSubmitting) {
      onClose();
    }
  }, [isSubmitting, onClose]);

  if (!action) return null;

  const copy = COPY[action];
  const isDestructive = action === "close";

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <AlertDialogContent aria-labelledby="confirm-action-title">
        <AlertDialogHeader>
          <AlertDialogTitle id="confirm-action-title">
            {copy.title}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {copy.description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={handleCancel}
            disabled={isSubmitting}
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isSubmitting}
            className={
              isDestructive
                ? "bg-red-700 text-white hover:bg-red-800"
                : "bg-primary text-white hover:bg-primary-dark"
            }
          >
            {isSubmitting ? "Processing..." : copy.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
