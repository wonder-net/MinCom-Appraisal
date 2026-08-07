/**
 * AccountCard — Displays linked user account information on the
 * employee profile page. Visible only to HR_ADMIN users.
 */

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield } from "lucide-react";
import type { EmployeeUserDetail } from "@/api/employees";
import { ROLE_DISPLAY_LABELS } from "@/types";
import type { AdminRole } from "@/types";

interface AccountCardProps {
  userDetail: EmployeeUserDetail;
}

function AccountStatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <Badge className="bg-green-50 text-green-700 border-green-300 text-xs">
      Active
    </Badge>
  ) : (
    <Badge className="bg-red-50 text-red-700 border-red-300 text-xs">
      Inactive
    </Badge>
  );
}

function MfaBadge({ enabled }: { enabled: boolean }) {
  return enabled ? (
    <Badge className="bg-green-50 text-green-700 border-green-300 text-xs">
      Enabled
    </Badge>
  ) : (
    <Badge className="bg-yellow-50 text-yellow-700 border-yellow-300 text-xs">
      Disabled
    </Badge>
  );
}

function RoleBadge({ role }: { role: string }) {
  const label = ROLE_DISPLAY_LABELS[role as AdminRole] ?? role.replace(/_/g, " ");
  return (
    <Badge
      variant="outline"
      className="text-xs text-primary border-secondary bg-primary-light"
    >
      {label}
    </Badge>
  );
}

interface FieldProps {
  label: string;
  children: React.ReactNode;
}

function Field({ label, children }: FieldProps) {
  return (
    <div>
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{children}</dd>
    </div>
  );
}

export function AccountCard({ userDetail }: AccountCardProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200 px-6 py-4">
        <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Shield
            className="h-5 w-5 text-secondary"
            aria-hidden="true"
          />
          Linked Account
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <Field label="Email">{userDetail.email}</Field>
          <Field label="Account Status">
            <AccountStatusBadge isActive={userDetail.is_active} />
          </Field>
          <Field label="Roles">
            <div className="flex flex-wrap gap-1 mt-0.5">
              {userDetail.roles.length > 0 ? (
                userDetail.roles.map((role) => (
                  <RoleBadge key={role} role={role} />
                ))
              ) : (
                <span className="text-xs text-gray-400">No roles</span>
              )}
            </div>
          </Field>
          <Field label="MFA Status">
            <MfaBadge enabled={userDetail.is_mfa_enabled} />
          </Field>
        </dl>
      </CardContent>
    </Card>
  );
}
