/**
 * HelpIcon — Inline `?` icon link that deep-links into the in-app Help Center.
 *
 * Use adjacent to section headings, dialog titles, or form labels to give
 * the user a one-click path to the relevant manual page. Renders a
 * react-router `<Link>` so navigation stays within the SPA.
 */

import { Link } from "react-router-dom";
import { HelpCircle } from "lucide-react";

interface HelpIconProps {
  /** Absolute help path, e.g. "/help/employee-guide/completing-self-assessment". */
  to: string;
  /** Human-readable label used to compose the aria-label. */
  label?: string;
  /** Optional extra Tailwind classes applied to the wrapping `<Link>`. */
  className?: string;
}

export function HelpIcon({ to, label, className }: HelpIconProps) {
  const ariaLabel = label ? `Open help for ${label}` : "Open help";
  const composedClassName = [
    "inline-flex items-center justify-center text-gray-400 hover:text-secondary",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary",
    "rounded-full transition-colors",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Link
      to={to}
      aria-label={ariaLabel}
      className={composedClassName}
    >
      <HelpCircle className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}
