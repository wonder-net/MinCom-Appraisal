/**
 * AccountSettings — Main settings page for all authenticated users.
 *
 * Renders two sections:
 * 1. Change Password — form to update the user's password
 * 2. Two-Factor Authentication (MFA) — manage MFA status
 *
 * Route: /settings/account (no role restriction)
 */

import { Card, CardContent } from "@/components/ui/card";
import { ChangePasswordForm } from "../components/ChangePasswordForm";
import { MFASection } from "../components/MFASection";

function AccountSettings() {
  return (
    <div aria-label="Account settings">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">
          Account Settings
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your password and security preferences.
        </p>
      </div>

      <div className="max-w-2xl space-y-6">
        <Card className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-primary-light to-white">
            <h2 className="text-lg font-semibold text-gray-900">
              Change Password
            </h2>
            <p className="text-sm text-gray-600 mt-0.5">
              Choose a strong password you do not use anywhere else.
            </p>
          </div>
          <CardContent className="px-6 py-6">
            <ChangePasswordForm />
          </CardContent>
        </Card>

        <Card className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-primary-light to-white">
            <h2 className="text-lg font-semibold text-gray-900">
              Two-Factor Authentication (MFA)
            </h2>
            <p className="text-sm text-gray-600 mt-0.5">
              Add a second layer of security to your account.
            </p>
          </div>
          <CardContent className="px-6 py-6">
            <MFASection />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export { AccountSettings };
