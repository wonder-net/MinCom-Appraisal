/**
 * usePasswordRequirements — Evaluates a password string against
 * client-side checkable rules derived from AUTH_PASSWORD_VALIDATORS
 * in backend/config/settings/base.py.
 *
 * Rules checked:
 * 1. MinimumLengthValidator (min_length: 12 → 8)
 * 2. NumericPasswordValidator (must not be entirely numeric)
 * 3. SpecialCharacterValidator (at least one special character)
 * 4. UppercaseValidator (at least one uppercase letter)
 *
 * Returns a stable array of PasswordRequirement objects, recomputed
 * only when the password input changes.
 */

import { useMemo } from "react";

export interface PasswordRequirement {
  id: "min-length" | "not-numeric" | "special-char" | "uppercase";
  label: string;
  met: boolean;
}

export function usePasswordRequirements(
  password: string,
): PasswordRequirement[] {
  return useMemo<PasswordRequirement[]>(
    () => [
      {
        id: "min-length",
        label: "At least 8 characters",
        met: password.length >= 8,
      },
      {
        id: "not-numeric",
        label: "Not entirely numeric",
        met: password.length === 0 || /[^0-9]/.test(password),
      },
      {
        id: "special-char",
        label: "At least one special character (e.g., ! @ # $ %)",
        met: password.length === 0 || /[!@#$%^&*()\-_=+[\]{};:'",.<>?/\\|`~]/.test(password),
      },
      {
        id: "uppercase",
        label: "At least one uppercase letter",
        met: password.length === 0 || /[A-Z]/.test(password),
      },
    ],
    [password],
  );
}
