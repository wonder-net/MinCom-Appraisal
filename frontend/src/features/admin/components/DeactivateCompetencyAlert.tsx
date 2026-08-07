/**
 * DeactivateCompetencyAlert — AlertDialog confirmation for deactivating a competency.
 *
 * Warns the user that deactivating will hide the competency from future appraisals.
 */

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

interface DeactivateCompetencyAlertProps {
  open: boolean;
  competencyName: string;
  isSubmitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeactivateCompetencyAlert({
  open,
  competencyName,
  isSubmitting,
  onConfirm,
  onCancel,
}: DeactivateCompetencyAlertProps) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o && !isSubmitting) onCancel(); }}>
      <AlertDialogContent
        aria-labelledby="deactivate-comp-title"
        aria-describedby="deactivate-comp-desc"
      >
        <AlertDialogHeader>
          <AlertDialogTitle id="deactivate-comp-title">
            Deactivate &ldquo;{competencyName}&rdquo;?
          </AlertDialogTitle>
          <AlertDialogDescription id="deactivate-comp-desc">
            Deactivating will hide this competency from future appraisals.
            Existing appraisals that already use it will not be affected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-700 text-white hover:bg-red-800"
            onClick={onConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Deactivating\u2026" : "Deactivate"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
