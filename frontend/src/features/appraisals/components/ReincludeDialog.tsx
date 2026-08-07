/**
 * ReincludeDialog — AlertDialog for re-including an excluded appraisal.
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

interface ReincludeDialogProps {
  open: boolean;
  isSubmitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ReincludeDialog({
  open,
  isSubmitting,
  onConfirm,
  onCancel,
}: ReincludeDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent aria-labelledby="reinclude-title">
        <AlertDialogHeader>
          <AlertDialogTitle id="reinclude-title">
            Re-include Appraisal
          </AlertDialogTitle>
          <AlertDialogDescription>
            This appraisal will be re-included in the current cycle.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isSubmitting}
            className="bg-primary text-white hover:bg-primary-dark"
          >
            {isSubmitting ? "Re-including\u2026" : "Re-include"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
