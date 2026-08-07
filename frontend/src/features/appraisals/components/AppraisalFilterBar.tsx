/**
 * AppraisalFilterBar — Cycle, status, and search filters for the
 * appraisal list page.
 */

import { Input } from "@/components/ui/input";
import type { AppraisalCycle, AppraisalStatus } from "@/types";

interface AppraisalFilterBarProps {
  cycleId: string;
  statusFilter: string;
  searchInput: string;
  cycles: AppraisalCycle[];
  isLoading: boolean;
  isFetching?: boolean;
  onCycleChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onSearchChange: (value: string) => void;
}

const ALL_STATUSES: ReadonlyArray<{ value: AppraisalStatus; label: string }> = [
  { value: "SELF_ASSESSMENT", label: "Self Assessment" },
  { value: "MANAGER_REVIEW", label: "Manager Review" },
  { value: "DISCUSSION", label: "Discussion" },
  { value: "GROWTH_PLANNING", label: "Growth Planning" },
  { value: "PENDING_SIGNOFF", label: "Pending Signoff" },
  { value: "SIGNED_OFF", label: "Signed Off" },
  { value: "FINALISED", label: "Finalised" },
  { value: "DISPUTED", label: "Disputed" },
  { value: "EXCLUDED", label: "Excluded" },
  { value: "INCOMPLETE", label: "Incomplete" },
];

export function AppraisalFilterBar({
  cycleId,
  statusFilter,
  searchInput,
  cycles,
  isLoading,
  isFetching: _isFetching,
  onCycleChange,
  onStatusChange,
  onSearchChange,
}: AppraisalFilterBarProps) {
  return (
    <div className="px-4 sm:px-6 py-4 border-b border-gray-200 flex flex-wrap items-center gap-3">
      <select
        aria-label="Filter by cycle"
        value={cycleId}
        onChange={(e) => onCycleChange(e.target.value)}
        disabled={isLoading}
        className="h-9 rounded-md border border-gray-300 px-3 text-sm bg-white focus-visible:ring-2 focus-visible:ring-secondary"
      >
        <option value="">All cycles</option>
        {cycles.map((c) => (
          <option key={c.id} value={c.id}>
            {c.period_name}
          </option>
        ))}
      </select>

      <select
        aria-label="Filter by status"
        value={statusFilter}
        onChange={(e) => onStatusChange(e.target.value)}
        disabled={isLoading}
        className="h-9 rounded-md border border-gray-300 px-3 text-sm bg-white focus-visible:ring-2 focus-visible:ring-secondary"
      >
        <option value="">All statuses</option>
        {ALL_STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      <Input
        aria-label="Search appraisals"
        placeholder="Search by employee number or email..."
        value={searchInput}
        onChange={(e) => onSearchChange(e.target.value)}
        className="h-9 text-sm flex-1 min-w-[220px]"
      />
    </div>
  );
}
