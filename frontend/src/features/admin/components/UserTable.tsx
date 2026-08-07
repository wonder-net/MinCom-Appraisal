/**
 * UserTable — Desktop table and mobile card list for admin user records.
 *
 * Renders both layouts simultaneously (CSS controls visibility).
 */

import { Link } from "react-router-dom";
import { RoleBadge } from "./RoleBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { AdminUser } from "@/types";

interface UserTableProps {
  users: AdminUser[];
  onSelectUser: (user: AdminUser) => void;
  onResendInvitation: (user: AdminUser) => void;
}

export function UserTable({
  users,
  onSelectUser,
  onResendInvitation,
}: UserTableProps) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm" aria-label="Users table">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100 bg-gray-50">
              <th scope="col" className="px-4 py-2 text-left font-semibold">Name</th>
              <th scope="col" className="px-4 py-2 text-left font-semibold">Email</th>
              <th scope="col" className="px-4 py-2 text-left font-semibold">Employee</th>
              <th scope="col" className="px-4 py-2 text-left font-semibold">Roles</th>
              <th scope="col" className="px-4 py-2 text-left font-semibold">Status</th>
              <th scope="col" className="px-4 py-2 text-left font-semibold hidden lg:table-cell">Last Login</th>
              <th scope="col" className="px-4 py-2 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u, i) => (
              <tr
                key={u.id}
                className={`${i % 2 === 1 ? "bg-gray-50" : "bg-white"} hover:bg-blue-50 transition-colors cursor-pointer`}
                onClick={() => onSelectUser(u)}
                aria-label={`Edit user ${u.full_name}`}
              >
                <td className="px-4 py-3 font-medium text-gray-900">{u.full_name}</td>
                <td className="px-4 py-3 text-gray-600">{u.email}</td>
                <td className="px-4 py-3">
                  <EmployeeLink employeeId={u.employee_id} employeeName={u.employee_name} />
                </td>
                <td className="px-4 py-3">
                  {u.roles.map((r) => <RoleBadge key={r} role={r} />)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={u.is_active ? "Active" : "Inactive"} />
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs hidden lg:table-cell">
                  {u.last_login ?? "Never"}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    className="text-sm text-secondary hover:text-primary font-medium"
                    onClick={(e) => { e.stopPropagation(); onSelectUser(u); }}
                    aria-label={`Edit ${u.full_name}`}
                  >
                    Edit
                  </button>
                  {u.must_change_password && (
                    <button
                      type="button"
                      className="text-xs text-amber-600 hover:text-amber-800 font-medium ml-2"
                      onClick={(e) => { e.stopPropagation(); onResendInvitation(u); }}
                      aria-label={`Resend invitation to ${u.full_name}`}
                    >
                      Resend Invitation
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="sm:hidden divide-y divide-gray-100">
        {users.map((u) => (
          <div
            key={u.id}
            className="px-4 py-4 space-y-1 cursor-pointer"
            onClick={() => onSelectUser(u)}
            role="button"
            tabIndex={0}
            aria-label={`Edit user ${u.full_name}`}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectUser(u);
              }
            }}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">{u.full_name}</p>
              <StatusBadge status={u.is_active ? "Active" : "Inactive"} />
            </div>
            <p className="text-xs text-gray-500">{u.email}</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {u.roles.map((r) => <RoleBadge key={r} role={r} />)}
            </div>
            <div className="mt-1">
              <EmployeeLink employeeId={u.employee_id} employeeName={u.employee_name} />
            </div>
            {u.must_change_password && (
              <button
                type="button"
                className="text-xs text-amber-600 hover:text-amber-800 font-medium mt-2"
                onClick={(e) => { e.stopPropagation(); onResendInvitation(u); }}
                aria-label={`Resend invitation to ${u.full_name}`}
              >
                Resend Invitation
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

interface EmployeeLinkProps {
  employeeId: string | null;
  employeeName: string | null;
}

function EmployeeLink({ employeeId, employeeName }: EmployeeLinkProps) {
  if (!employeeId) {
    return <span className="text-xs text-gray-400">No profile</span>;
  }

  return (
    <Link
      to={`/employees/${employeeId}`}
      className="text-sm font-medium text-secondary hover:underline"
      onClick={(e) => e.stopPropagation()}
      aria-label={`View employee profile for ${employeeName ?? "employee"}`}
    >
      {employeeName || "View profile"}
    </Link>
  );
}
