/**
 * AuditLogPage — Cursor-paginated audit log viewer with resource
 * filtering and expandable diff viewer.
 * Route: /audit/logs (HR_ADMIN only)
 */

import { useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ClipboardList } from "lucide-react";
import { useAuditLogs } from "../hooks/useAuditLogs";
import { AuditLogFilter } from "../components/AuditLogFilter";
import { AuditLogDiffCell } from "../components/AuditLogDiffCell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { AuditLogEntry } from "@/api/audit";

function AuditTableSkeleton() {
  return (
    <div className="animate-pulse p-6 space-y-3" aria-busy="true" aria-label="Loading audit log">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-10 rounded bg-gray-200" />
      ))}
    </div>
  );
}

function TruncatedId({ value }: { value: string }) {
  return (
    <span
      title={value}
      className="font-mono text-xs text-gray-500 cursor-default"
      aria-label={value}
    >
      {value.slice(0, 8)}...
    </span>
  );
}

function formatTimestamp(ts: string): string {
  return `${new Date(ts).toLocaleString("en-GB", { timeZone: "UTC" })} UTC`;
}

interface AuditTableRowProps {
  entry: AuditLogEntry;
  index: number;
  isExpanded: boolean;
  onToggle: (id: string) => void;
}

function AuditTableRow({ entry, index, isExpanded, onToggle }: AuditTableRowProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onToggle(entry.id);
      }
    },
    [entry.id, onToggle],
  );

  return (
    <>
      <tr
        className={`${index % 2 === 1 ? "bg-gray-50" : "bg-white"} hover:bg-blue-50 transition-colors cursor-pointer`}
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-label={`Expand diff for ${entry.action} on ${entry.resource_type}`}
        onClick={() => onToggle(entry.id)}
        onKeyDown={handleKeyDown}
      >
        <td className="px-4 py-3 whitespace-nowrap text-gray-500 font-mono text-xs">
          {formatTimestamp(entry.timestamp)}
        </td>
        <td className="px-4 py-3 text-gray-900">{entry.user_email ?? "System"}</td>
        <td className="px-4 py-3">
          <StatusBadge status={entry.action} />
        </td>
        <td className="px-4 py-3 text-gray-600">{entry.resource_type}</td>
        <td className="px-4 py-3">
          <TruncatedId value={entry.resource_id} />
        </td>
        <td className="px-4 py-3 text-gray-500 text-xs">
          {entry.ip_address ?? "\u2014"}
        </td>
        <td className="px-4 py-3">
          <AuditLogDiffCell value={entry.metadata} />
        </td>
      </tr>

      {isExpanded && (
        <tr className="bg-gray-50">
          <td colSpan={7} className="px-6 py-4">
            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              Metadata
            </p>
            {entry.metadata ? (
              <pre
                className="max-h-48 overflow-auto rounded-md border border-gray-200 bg-white p-3 text-xs font-mono text-gray-900 leading-relaxed"
                aria-label="Metadata details"
              >
                {JSON.stringify(entry.metadata, null, 2)}
              </pre>
            ) : (
              <p className="text-xs text-gray-400 italic">No metadata recorded.</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export function AuditLogPage() {
  const {
    entries,
    isLoading,
    isFetching: _isFetching,
    error,
    nextCursor,
    cursorHistory,
    isFiltered,
    filter,
    goToNext,
    goToPrevious,
    applyFilter,
    clearFilter,
    retry,
  } = useAuditLogs();

  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const handleToggleRow = useCallback((id: string) => {
    setExpandedRow((prev) => (prev === id ? null : id));
  }, []);

  const isEmpty = !isLoading && entries.length === 0;
  const hasPreviousPage = cursorHistory.length > 0;
  const hasNextPage = nextCursor !== null;

  return (
    <div aria-label="Audit log viewer">
      <a
        href="#audit-table"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded focus:shadow text-sm"
      >
        Skip to audit log table
      </a>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Audit Log</h1>
        <p className="text-sm text-gray-500 mt-1">
          Immutable record of all system actions. All times displayed in UTC.
        </p>
      </div>

      {/* Resource filter */}
      <AuditLogFilter
        onFilter={applyFilter}
        onClear={clearFilter}
        isFiltered={isFiltered}
      />

      {/* Filter banner */}
      {isFiltered && (
        <div
          className="mb-4 rounded-md border border-blue-300 bg-primary-light px-4 py-3 text-sm text-blue-700"
          role="status"
        >
          Filters active:
          {filter.resource_type && ` Resource Type = ${filter.resource_type}`}
          {filter.action && ` Action = ${filter.action}`}
          {filter.from_date && ` From = ${filter.from_date}`}
          {filter.to_date && ` To = ${filter.to_date}`}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-6 py-4" role="alert">
          <p className="text-sm text-red-800">{error}</p>
          <button type="button" className="mt-3 h-9 px-4 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition-colors" onClick={retry}>
            Retry
          </button>
        </div>
      )}

      <Card id="audit-table" className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-primary-light to-white">
          <h2 className="text-lg font-semibold text-gray-900">Log Entries</h2>
          <p className="text-sm text-gray-600 mt-0.5">
            Click any row to expand the change diff.
          </p>
        </div>
        <CardContent className="p-0">
          {isLoading ? (
            <AuditTableSkeleton />
          ) : isEmpty ? (
            <div
              className="flex flex-col items-center justify-center py-16 text-center min-h-[200px]"
              aria-live="polite"
            >
              <ClipboardList className="h-12 w-12 text-gray-400 mb-3" aria-hidden="true" />
              <p className="text-base font-medium text-gray-600">No audit log entries found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Audit log entries">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-2 text-left font-semibold whitespace-nowrap">Timestamp (UTC)</th>
                    <th className="px-4 py-2 text-left font-semibold">User</th>
                    <th className="px-4 py-2 text-left font-semibold">Action</th>
                    <th className="px-4 py-2 text-left font-semibold">Resource Type</th>
                    <th className="px-4 py-2 text-left font-semibold">Resource ID</th>
                    <th className="px-4 py-2 text-left font-semibold">IP Address</th>
                    <th className="px-4 py-2 text-left font-semibold">Metadata</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {entries.map((entry, i) => (
                    <AuditTableRow
                      key={entry.id}
                      entry={entry}
                      index={i}
                      isExpanded={expandedRow === entry.id}
                      onToggle={handleToggleRow}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!isLoading && !isEmpty && (
            <div
              className="flex items-center justify-end px-4 py-3 border-t border-gray-200 bg-gray-50 flex-wrap gap-2"
              aria-label="Pagination"
            >
              <div className="flex gap-2">
                <button
                  type="button"
                  className="h-8 px-3 rounded border border-gray-300 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!hasPreviousPage}
                  aria-label="Previous page"
                  aria-disabled={!hasPreviousPage}
                  onClick={goToPrevious}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="h-8 px-3 rounded border border-gray-300 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!hasNextPage}
                  aria-label="Next page"
                  aria-disabled={!hasNextPage}
                  onClick={goToNext}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
