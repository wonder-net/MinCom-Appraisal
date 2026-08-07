/**
 * AuditLogFilter — Filter form for the audit log table.
 * Supports resource type, action, and date range filtering.
 */

import { useState, useCallback, useMemo } from "react";
import { type DateRange } from "react-day-picker";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import type { AuditFilterState } from "../hooks/useAuditLogs";

const AUDIT_ACTIONS = [
  "admin.user.created",
  "admin.user.updated",
  "admin.user.bulk_created",
  "appraisal.comment.created",
  "appraisal.created",
  "appraisal.signed",
  "appraisal.transition",
  "competency_rating.manager_rated",
  "competency_rating.self_rated",
  "cycle.activated",
  "department.auto_created",
  "growth_plan.created",
  "growth_plan.updated",
  "kd.created",
  "kd.deleted",
  "kd.updated",
  "score.compute",
  "user.login",
  "user.login_failed",
  "user.account_locked",
  "user.password_changed",
  "user.bootstrap_admin_created",
  "user.mfa_enrolled",
  "user.mfa_disabled",
  "user.mfa_enroll_failed",
  "user.mfa_verify_failed",
  "user.recovery_code_used",
  "user.recovery_codes_generated",
  "user.token_refreshed",
  "user.token_refresh_failed",
  "user.tokens_revoked",
  "PASSWORD_RESET",
  "PASSWORD_RESET_REQUESTED",
] as const;

interface AuditLogFilterProps {
  onFilter: (filterState: AuditFilterState) => void;
  onClear: () => void;
  isFiltered: boolean;
}

/** Convert a Date to a YYYY-MM-DD string for the filter state. */
function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Convert a YYYY-MM-DD string back to a Date, or undefined. */
function fromDateString(value: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function AuditLogFilter({
  onFilter,
  onClear,
  isFiltered,
}: AuditLogFilterProps) {
  const [resourceType, setResourceType] = useState("");
  const [action, setAction] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const dateRange: DateRange | undefined = useMemo(() => {
    const from = fromDateString(fromDate);
    const to = fromDateString(toDate);
    if (!from && !to) return undefined;
    return { from, to };
  }, [fromDate, toDate]);

  const handleDateRangeChange = useCallback(
    (range: DateRange | undefined) => {
      const newFrom = range?.from ? toDateString(range.from) : "";
      const newTo = range?.to ? toDateString(range.to) : "";
      setFromDate(newFrom);
      setToDate(newTo);
    },
    [],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      onFilter({
        resource_type: resourceType.trim(),
        action,
        from_date: fromDate,
        to_date: toDate,
      });
    },
    [resourceType, action, fromDate, toDate, onFilter],
  );

  const handleClear = useCallback(() => {
    setResourceType("");
    setAction("");
    setFromDate("");
    setToDate("");
    onClear();
  }, [onClear]);

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 mb-6"
      aria-label="Filter audit log entries"
    >
      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor="resource-type"
          className="text-sm font-medium text-gray-900"
        >
          Resource Type
        </Label>
        <Input
          id="resource-type"
          type="text"
          placeholder="e.g. Appraisal"
          value={resourceType}
          onChange={(e) => setResourceType(e.target.value)}
          className="h-10 w-40 border-gray-200"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor="action-filter"
          className="text-sm font-medium text-gray-900"
        >
          Action
        </Label>
        <select
          id="action-filter"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="flex h-10 w-56 rounded-md border border-gray-200 bg-white px-3 py-1 text-sm text-gray-900 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:border-transparent"
          aria-label="Filter by action type"
        >
          <option value="">All actions</option>
          {AUDIT_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-sm font-medium text-gray-900">
          Date Range
        </Label>
        <DateRangePicker
          value={dateRange}
          onChange={handleDateRangeChange}
          align="start"
        />
      </div>

      <Button type="submit" className="h-10">
        Filter
      </Button>

      {isFiltered && (
        <Button
          type="button"
          variant="outline"
          className="h-10"
          onClick={handleClear}
        >
          Clear
        </Button>
      )}
    </form>
  );
}
