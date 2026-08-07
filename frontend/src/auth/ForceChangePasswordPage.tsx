/**
 * ForceChangePasswordPage — Security gate that blocks system access
 * until the user sets a new password.
 *
 * Rendered when `user.must_change_password` is `true`. Uses the existing
 * ChangePasswordForm component. On success, clears the flag in auth
 * context and redirects to /appraisals.
 *
 * Visual pattern mirrors MFASetupPage: centred card, logo header,
 * no Layout shell, no navigation elements.
 */

import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/auth/useAuth";
import { ChangePasswordForm } from "@/features/settings/components/ChangePasswordForm";

function ForceChangePasswordPage() {
  const { updateUser } = useAuth();
  const navigate = useNavigate();

  const handlePasswordChanged = useCallback(() => {
    updateUser({ must_change_password: false });
    void navigate("/appraisals", { replace: true });
  }, [updateUser, navigate]);

  return (
    <main
      className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12"
      aria-label="Change your password"
    >
      <div className="mb-8 text-center" aria-hidden="true">
        <span className="text-2xl font-bold tracking-tight text-primary">
          MINCOM
        </span>
        <span className="block text-xs font-medium text-gray-500 mt-1 tracking-widest uppercase">
          Performance Appraisal
        </span>
      </div>

      <Card className="w-full max-w-md shadow-md border-gray-200">
        <CardContent className="px-8 py-8">
          <h1 className="text-lg font-semibold text-gray-900 mb-2">
            Change Your Password
          </h1>

          <p
            className="text-sm text-amber-700 bg-amber-50 border border-amber-300 rounded-md px-4 py-3 mb-6"
            role="alert"
          >
            You must set a new password before continuing.
          </p>

          <ChangePasswordForm onSuccess={handlePasswordChanged} />
        </CardContent>
      </Card>
    </main>
  );
}

export default ForceChangePasswordPage;
