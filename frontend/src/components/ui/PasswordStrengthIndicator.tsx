/**
 * PasswordStrengthIndicator — Renders a live checklist of password
 * requirements. Each row shows a green check when met and a gray
 * circle when not yet satisfied.
 *
 * Returns null when the password is empty so no layout noise appears
 * before the user starts typing.
 */

import { CheckCircle2, Circle } from "lucide-react";
import { usePasswordRequirements } from "@/hooks/usePasswordRequirements";

interface PasswordStrengthIndicatorProps {
  password: string;
  className?: string;
}

export function PasswordStrengthIndicator({
  password,
  className,
}: PasswordStrengthIndicatorProps): JSX.Element | null {
  const requirements = usePasswordRequirements(password);

  if (password.length === 0) {
    return null;
  }

  return (
    <div aria-live="polite" className={className}>
      <ul aria-label="Password requirements">
        {requirements.map((req) => (
          <li
            key={req.id}
            className={`flex items-center gap-1.5 text-sm ${
              req.met ? "text-green-700" : "text-gray-500"
            }`}
          >
            {req.met ? (
              <CheckCircle2
                className="h-4 w-4 shrink-0"
                aria-hidden="true"
              />
            ) : (
              <Circle
                className="h-4 w-4 shrink-0"
                aria-hidden="true"
              />
            )}
            <span>
              {req.label}
              <span className="sr-only">
                {req.met ? " — met" : " — not met"}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
