/**
 * AppraisalTable — Desktop table and mobile card list for the
 * appraisal list view. Handles loading, empty, and populated states.
 * Supports optional row selection for bulk actions (HR Admin).
 */

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ExecutiveEscalatedBadge } from "./ExecutiveEscalatedBadge";
import type { Appraisal } from "@/types";

interface AppraisalTableProps {
  data: Appraisal[];
  isLoading: boolean;
  totalCount: number;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  onView: (id: string) => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleAll?: () => void;
  /**
   * UUID of the currently-signed-in user. Used to decide whether
   * to render the "Escalated" badge on rows where the current user
   * is the assigned `escalated_executive`. Optional — when absent,
   * the badge never renders.
   */
  currentUserId?: string;
}

const SKELETON_ROWS = 5;

export function AppraisalTable({
  data,
  isLoading,
  totalCount,
  hasActiveFilters,
  onClearFilters,
  onView,
  selectable = false,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  currentUserId,
}: AppraisalTableProps) {
  const allSelected = selectable && data.length > 0 && selectedIds?.size === data.length;
  const colCount = selectable ? 8 : 7;

  return (
    <>
      {/* Desktop table */}
      <div className="overflow-x-auto hidden sm:block">
        <table
          id="appraisals-table"
          className="w-full text-sm"
          aria-label="Appraisals list"
          aria-busy={isLoading}
        >
          <caption className="sr-only">
            Appraisals list, {totalCount} results
          </caption>
          <thead>
            <tr className="text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100 bg-gray-50">
              {selectable && (
                <th scope="col" className="px-4 py-2 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={onToggleAll}
                    aria-label="Select all appraisals"
                    className="rounded border-gray-300"
                  />
                </th>
              )}
              <th scope="col" className="px-4 py-2 text-left font-semibold">Employee</th>
              <th scope="col" className="px-4 py-2 text-left font-semibold hidden md:table-cell">Job Title</th>
              <th scope="col" className="px-4 py-2 text-left font-semibold hidden md:table-cell">Department</th>
              <th scope="col" className="px-4 py-2 text-left font-semibold">Cycle</th>
              <th scope="col" className="px-4 py-2 text-left font-semibold">Form</th>
              <th scope="col" className="px-4 py-2 text-left font-semibold">Status</th>
              <th scope="col" className="px-4 py-2 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading
              ? Array.from({ length: SKELETON_ROWS }, (_, i) => (
                  <tr key={`skel-${i}`} aria-hidden="true">
                    {Array.from({ length: colCount }, (__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 rounded bg-gray-200 animate-pulse" style={{ width: j === 0 ? 20 : 100 }} />
                      </td>
                    ))}
                  </tr>
                ))
              : data.length === 0
                ? <EmptyRow colSpan={colCount} hasActiveFilters={hasActiveFilters} onClearFilters={onClearFilters} />
                : data.map((a, i) => (
                    <tr key={a.id} className={`${i % 2 === 1 ? "bg-gray-50" : "bg-white"} hover:bg-blue-50 transition-colors`}>
                      {selectable && (
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIds?.has(a.id) ?? false}
                            onChange={() => onToggleSelect?.(a.id)}
                            aria-label={`Select ${a.employee_name}`}
                            className="rounded border-gray-300"
                          />
                        </td>
                      )}
                      <td className="px-4 py-3 font-medium text-gray-900">{a.employee_name}</td>
                      <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{a.employee_job_title}</td>
                      <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{a.department}</td>
                      <td className="px-4 py-3 text-gray-600">{a.cycle_period_name}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs">{a.form_type === "FORM_A" ? "Managerial" : "Non-Managerial"}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={a.status} />
                        <ExecutiveEscalatedBadge
                          isEscalated={
                            currentUserId !== undefined &&
                            a.escalated_executive !== null &&
                            a.escalated_executive === currentUserId
                          }
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          className="text-sm text-blue-700 hover:text-blue-900 font-medium"
                          aria-label={`View appraisal for ${a.employee_name}`}
                          onClick={() => onView(a.id)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="sm:hidden divide-y divide-gray-100">
        {isLoading
          ? Array.from({ length: SKELETON_ROWS }, (_, i) => (
              <div key={`mskel-${i}`} className="p-4 space-y-2" aria-hidden="true">
                <div className="h-4 w-32 bg-gray-200 animate-pulse rounded" />
                <div className="h-3 w-24 bg-gray-200 animate-pulse rounded" />
              </div>
            ))
          : data.length === 0
            ? (
                <div className="px-4 py-16 text-center">
                  <p className="text-base font-medium text-gray-600">
                    {hasActiveFilters ? "No results match your filters" : "No appraisals found"}
                  </p>
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" className="mt-3" onClick={onClearFilters}>Clear filters</Button>
                  )}
                </div>
              )
            : data.map((a) => (
                <div key={a.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {selectable && (
                      <input
                        type="checkbox"
                        checked={selectedIds?.has(a.id) ?? false}
                        onChange={() => onToggleSelect?.(a.id)}
                        aria-label={`Select ${a.employee_name}`}
                        className="rounded border-gray-300"
                      />
                    )}
                    <div className="space-y-1">
                      <p className="font-medium text-gray-900 text-sm">{a.employee_name}</p>
                      <p className="text-xs text-gray-500">{a.cycle_period_name}</p>
                      <div className="flex flex-wrap items-center gap-1">
                        <StatusBadge status={a.status} />
                        <ExecutiveEscalatedBadge
                          isEscalated={
                            currentUserId !== undefined &&
                            a.escalated_executive !== null &&
                            a.escalated_executive === currentUserId
                          }
                        />
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-sm text-blue-700 hover:text-blue-900 font-medium"
                    aria-label={`View appraisal for ${a.employee_name}`}
                    onClick={() => onView(a.id)}
                  >
                    View
                  </button>
                </div>
              ))}
      </div>
    </>
  );
}

function EmptyRow({ colSpan, hasActiveFilters, onClearFilters }: { colSpan: number; hasActiveFilters: boolean; onClearFilters: () => void }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-16 text-center">
        <p className="text-base font-medium text-gray-600">
          {hasActiveFilters ? "No results match your filters" : "No appraisals found"}
        </p>
        <p className="mt-1 text-sm text-gray-500">
          {hasActiveFilters ? "Try adjusting your filters." : "Check back once a cycle is active."}
        </p>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="mt-3" onClick={onClearFilters}>Clear filters</Button>
        )}
      </td>
    </tr>
  );
}
