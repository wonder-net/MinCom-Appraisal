/**
 * ActionBadge — Colour-coded badge for signature actions.
 */

import { Badge } from "@/components/ui/badge";
import type { SignatureAction } from "@/types";

interface ActionBadgeProps {
  action: SignatureAction;
}

export function ActionBadge({ action }: ActionBadgeProps) {
  if (action === "ACCEPT") {
    return (
      <Badge className="bg-green-50 text-green-700 border-green-300 text-xs">
        Accepted
      </Badge>
    );
  }
  if (action === "REJECT") {
    return (
      <Badge className="bg-red-50 text-red-700 border-red-300 text-xs">
        Rejected
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs">
      Comments Attached
    </Badge>
  );
}
