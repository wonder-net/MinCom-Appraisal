/**
 * DeactivateAlert — AlertDialog confirmation for deactivating a user.
 *
 * Uses shadcn AlertDialog (not window.confirm) per AC2.
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

interface DeactivateAlertProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeactivateAlert({ open, onConfirm, onCancel }: DeactivateAlertProps) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AlertDialogContent aria-labelledby="deactivate-title" aria-describedby="deactivate-desc">
        <AlertDialogHeader>
          <AlertDialogTitle id="deactivate-title">Deactivate account?</AlertDialogTitle>
          <AlertDialogDescription id="deactivate-desc">
            Deactivating this user will immediately log them out of all active sessions. Continue?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction className="bg-red-700 text-white hover:bg-red-800" onClick={onConfirm}>
            Deactivate
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
