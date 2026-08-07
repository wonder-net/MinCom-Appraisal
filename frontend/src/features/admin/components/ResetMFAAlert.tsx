/**
 * ResetMFAAlert — AlertDialog confirmation for resetting a user's MFA.
 *
 * Mirrors the structural pattern of DeactivateAlert. Adds:
 *   - explanatory warning copy,
 *   - admin's own password input (controlled local state),
 *   - inline error display (e.g. "Incorrect password"),
 *   - loading state on the confirm button.
 *
 * The parent owns dialog open/close — on success we DO NOT close the
 * dialog ourselves. The parent's onConfirm handler resolves only after
 * the API call completes; the parent then sets `open=false`.
 */

import { useEffect, useState } from "react";
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
import { isResetMFAError } from "@/api/admin-users";
import type { AdminUser } from "@/types";

interface ResetMFAAlertProps {
  open: boolean;
  user: AdminUser | null;
  onConfirm: (password: string) => Promise<void>;
  onCancel: () => void;
}

export function ResetMFAAlert({
  open,
  user,
  onConfirm,
  onCancel,
}: ResetMFAAlertProps) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset internal state every time the dialog opens for a fresh user.
  useEffect(() => {
    if (open) {
      setPassword("");
      setError(null);
      setLoading(false);
    }
  }, [open, user?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      await onConfirm(password);
      // Parent controls closing on success — we don't reset state here.
    } catch (err: unknown) {
      if (isResetMFAError(err) && err.code === "INVALID_PASSWORD") {
        setError("Incorrect password");
        setLoading(false);
        return;
      }
      // For other errors, the parent shows a toast and closes the dialog.
      // We just clear the loading state in case it stays open.
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (loading) return;
    onCancel();
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) handleCancel();
      }}
    >
      <AlertDialogContent
        aria-labelledby="reset-mfa-title"
        aria-describedby="reset-mfa-desc"
      >
        <AlertDialogHeader>
          <AlertDialogTitle id="reset-mfa-title">Reset MFA?</AlertDialogTitle>
          <AlertDialogDescription id="reset-mfa-desc">
            This will remove MFA for{" "}
            <span className="font-medium text-gray-900">
              {user?.full_name ?? "this user"}
            </span>
            . They will be required to set up MFA again on their next sign-in.
            Confirm by entering your own password.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <form onSubmit={handleSubmit} noValidate>
          <div className="mt-2 space-y-2">
            <Label
              htmlFor="reset-mfa-password"
              className="text-sm font-medium text-gray-700"
            >
              Your password
            </Label>
            <Input
              id="reset-mfa-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              disabled={loading}
              aria-invalid={error !== null}
              aria-describedby={error ? "reset-mfa-error" : undefined}
              autoFocus
            />
            {error && (
              <p
                id="reset-mfa-error"
                role="alert"
                className="text-sm text-red-700"
              >
                {error}
              </p>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel
              type="button"
              onClick={handleCancel}
              disabled={loading}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              type="submit"
              className="bg-red-700 text-white hover:bg-red-800"
              disabled={!password.trim() || loading}
            >
              {loading ? "Resetting..." : "Reset MFA"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
