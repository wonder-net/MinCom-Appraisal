/**
 * RoleSelect — Single-select dropdown for user role.
 *
 * Replaces the previous multi-select RolesCheckboxGroup. Users at the
 * UI layer have exactly one role. The backend API still accepts an
 * array of roles (the calling form wraps the single value in an
 * array on submit) — this is a UI-only restriction.
 */

import { useCallback } from "react";
import { Select } from "@/components/ui/select";
import { ALL_ROLES, ROLE_DISPLAY_LABELS } from "@/types";
import type { AdminRole } from "@/types";

interface RoleSelectProps {
  selectedRole: AdminRole | null;
  onChange: (role: AdminRole | null) => void;
  disabled?: boolean;
  /** Optional id for the underlying select element (defaults to "role-select") */
  id?: string;
  /** Error message; when present, the field is marked invalid */
  error?: string;
}

function isAdminRole(value: string): value is AdminRole {
  return (ALL_ROLES as readonly string[]).includes(value);
}

export function RoleSelect({
  selectedRole,
  onChange,
  disabled = false,
  id = "role-select",
  error,
}: RoleSelectProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      if (value === "") {
        onChange(null);
      } else if (isAdminRole(value)) {
        onChange(value);
      }
    },
    [onChange],
  );

  const errorId = `${id}-error`;

  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-gray-900 mb-1"
      >
        Role{" "}
        <span className="text-red-700" aria-hidden="true">
          *
        </span>
      </label>
      <Select
        id={id}
        value={selectedRole ?? ""}
        onChange={handleChange}
        disabled={disabled}
        aria-required="true"
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? errorId : undefined}
        className={error ? "border-red-300" : ""}
      >
        <option value="">— Select a role —</option>
        {ALL_ROLES.map((role) => (
          <option key={role} value={role}>
            {ROLE_DISPLAY_LABELS[role] ?? role}
          </option>
        ))}
      </Select>
      {error && (
        <p
          id={errorId}
          role="alert"
          className="text-sm text-red-700 mt-1"
        >
          {error}
        </p>
      )}
    </div>
  );
}
