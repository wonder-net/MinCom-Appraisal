/**
 * AuditLogDiffCell — Collapsible JSON diff/metadata viewer for
 * audit log table cells.
 */

import { useMemo } from "react";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";

interface AuditLogDiffCellProps {
  value: Record<string, unknown> | null;
}

export function AuditLogDiffCell({ value }: AuditLogDiffCellProps) {
  const fieldCount = useMemo(
    () => (value ? Object.keys(value).length : 0),
    [value],
  );

  if (value === null) {
    return <span className="text-gray-400">&mdash;</span>;
  }

  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-auto px-1 py-0.5 text-xs text-secondary hover:underline"
        >
          {fieldCount} field(s) changed
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto max-h-48 mt-1 border border-gray-200">
          {JSON.stringify(value, null, 2)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}
