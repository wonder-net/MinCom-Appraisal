/**
 * MFADisableDialog — Confirmation dialog that requires password to disable MFA.
 *
 * Prompts for the user's current password, then calls disableMFA.
 * On success, closes and notifies the parent to refetch MFA status.
 */

import { useCallback, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/auth/useAuth";
import { disableMfaApi } from "@/api";
import { extractErrorMessage } from "@/auth/auth-utils";

interface MFADisableDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function MFADisableDialog({
  isOpen,
  onClose,
  onSuccess,
}: MFADisableDialogProps) {
  const { accessToken } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = useCallback(() => {
    setPassword("");
    setError(null);
    setIsSubmitting(false);
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!password.trim() || !accessToken) return;

      setIsSubmitting(true);
      setError(null);

      try {
        await disableMfaApi(password, accessToken);
        setPassword("");
        onSuccess();
        onClose();
      } catch (err: unknown) {
        setError(extractErrorMessage(err));
      } finally {
        setIsSubmitting(false);
      }
    },
    [password, accessToken, onSuccess, onClose],
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        role="dialog"
        aria-labelledby="mfa-disable-title"
        aria-modal="true"
      >
        <DialogHeader>
          <DialogTitle id="mfa-disable-title">
            Disable Two-Factor Authentication
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-gray-500">
          Enter your password to confirm disabling MFA. This will reduce your
          account security.
        </p>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="space-y-4"
          noValidate
        >
          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <div className="space-y-1">
            <Label
              htmlFor="disable-mfa-password"
              className="text-sm font-medium text-gray-900"
            >
              Password <span className="text-red-700">*</span>
            </Label>
            <Input
              id="disable-mfa-password"
              type="password"
              autoComplete="current-password"
              className="h-10 border-gray-200 focus-visible:ring-2 focus-visible:ring-secondary"
              aria-required="true"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              disabled={isSubmitting}
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="outline"
              className="border-red-300 text-red-700 hover:bg-red-50"
              disabled={isSubmitting || !password.trim()}
              aria-busy={isSubmitting}
            >
              {isSubmitting && (
                <Loader2
                  className="mr-2 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              )}
              {isSubmitting ? "Disabling\u2026" : "Disable MFA"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { MFADisableDialog };
