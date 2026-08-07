/**
 * AppraisalListPage — Paginated table of role-scoped appraisals
 * with cycle, status, and search filters.
 *
 * HR Admin can select SIGNED_OFF appraisals and bulk-finalise them.
 *
 * Route: /appraisals
 */

import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAppraisals } from "../hooks/useAppraisals";
import { useCycles } from "../hooks/useCycles";
import { AppraisalFilterBar } from "../components/AppraisalFilterBar";
import { AppraisalTable } from "../components/AppraisalTable";
import { AppraisalPagination } from "../components/AppraisalPagination";
import { useDebounce } from "@/hooks/useDebounce";
import { useAuth } from "@/auth/useAuth";
import { bulkFinalise } from "@/api/appraisals";
import type { AppraisalListParams, AppraisalStatus } from "@/types";

export function AppraisalListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isHrAdmin = useMemo(
    () => user?.roles.some((r) => r === "HR_ADMIN") ?? false,
    [user],
  );

  const [cycleId, setCycleId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);

  const debouncedSearch = useDebounce(searchInput, 300);

  const params = useMemo<AppraisalListParams>(() => {
    const p: AppraisalListParams = { page, page_size: pageSize };
    if (cycleId) p.cycle_id = cycleId;
    if (statusFilter) p.status = statusFilter as AppraisalStatus;
    if (debouncedSearch) p.search = debouncedSearch;
    return p;
  }, [cycleId, statusFilter, debouncedSearch, page, pageSize]);

  const { data, isLoading, isFetching, error, pagination, refetch } = useAppraisals(params);
  const { cycles } = useCycles();

  const selectedCycleName = useMemo(() => {
    if (!cycleId) return null;
    const cycle = cycles.find((c) => c.id === cycleId);
    return cycle?.period_name ?? null;
  }, [cycleId, cycles]);

  const hasActiveFilters = cycleId !== "" || statusFilter !== "" || searchInput !== "";

  // Selection state for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isFinalising, setIsFinalising] = useState(false);
  const [showFinaliseConfirm, setShowFinaliseConfirm] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  // Only show checkboxes when HR Admin has filtered to SIGNED_OFF
  const selectable = isHrAdmin && statusFilter === "SIGNED_OFF";

  // Clear selection when filters change
  const clearFilters = useCallback(() => {
    setCycleId("");
    setStatusFilter("");
    setSearchInput("");
    setPage(1);
    setSelectedIds(new Set());
  }, []);

  const handleCycleChange = useCallback((value: string) => {
    setCycleId(value);
    setPage(1);
    setSelectedIds(new Set());
  }, []);

  const handleStatusChange = useCallback((value: string) => {
    setStatusFilter(value);
    setPage(1);
    setSelectedIds(new Set());
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    setPage(1);
    setSelectedIds(new Set());
  }, []);

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setPage(1);
    setSelectedIds(new Set());
  }, []);

  const handleView = useCallback(
    (id: string) => void navigate(`/appraisals/${id}`),
    [navigate],
  );

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === data.length) return new Set();
      return new Set(data.map((a) => a.id));
    });
  }, [data]);

  const handleBulkFinalise = useCallback(async () => {
    setIsFinalising(true);
    setBulkResult(null);
    try {
      const result = await bulkFinalise(Array.from(selectedIds));
      setBulkResult(`${result.finalised} appraisal${result.finalised !== 1 ? "s" : ""} finalised.`);
      setSelectedIds(new Set());
      void refetch();
    } catch {
      setBulkResult("Failed to finalise appraisals. Please try again.");
    } finally {
      setIsFinalising(false);
      setShowFinaliseConfirm(false);
    }
  }, [selectedIds, refetch]);

  return (
    <div aria-label="Appraisals page">
      <a
        href="#appraisals-table"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded focus:shadow text-sm"
      >
        Skip to appraisals table
      </a>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Appraisals</h1>
          <p className="mt-1 text-sm text-gray-500">
            {selectedCycleName
              ? `${selectedCycleName} \u2014 ${pagination.count} appraisal${pagination.count !== 1 ? "s" : ""}`
              : `${pagination.count} appraisal${pagination.count !== 1 ? "s" : ""}`}
          </p>
        </div>
        {/* "Import Appraisals" bulk import button hidden per TASK-288. Dialog
            and results page kept for any in-flight notifications. */}
      </div>

      {error && (
        <Alert variant="error" className="mb-4">
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              className="h-9 px-4 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              onClick={() => void refetch()}
            >
              Retry
            </button>
          </AlertDescription>
        </Alert>
      )}

      {bulkResult && (
        <Alert variant="default" className="mb-4">
          <AlertDescription>{bulkResult}</AlertDescription>
        </Alert>
      )}

      <Card className="bg-white rounded-lg border border-gray-200 shadow-sm">
        {/* Card header band */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-primary-light to-white flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Appraisals</h2>
          {selectable && selectedIds.size > 0 && (
            <Button
              size="sm"
              className="bg-primary text-white hover:bg-primary-dark"
              disabled={isFinalising}
              onClick={() => setShowFinaliseConfirm(true)}
            >
              Finalise Selected ({selectedIds.size})
            </Button>
          )}
        </div>
        <AppraisalFilterBar
          cycleId={cycleId}
          statusFilter={statusFilter}
          searchInput={searchInput}
          cycles={cycles}
          isLoading={isLoading}
          isFetching={isFetching}
          onCycleChange={handleCycleChange}
          onStatusChange={handleStatusChange}
          onSearchChange={handleSearchChange}
        />
        <CardContent className="p-0">
          <AppraisalTable
            data={data}
            isLoading={isLoading}
            totalCount={pagination.count}
            hasActiveFilters={hasActiveFilters}
            onClearFilters={clearFilters}
            onView={handleView}
            selectable={selectable}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onToggleAll={handleToggleAll}
            currentUserId={user?.id}
          />
          {!isLoading && data.length > 0 && (
            <AppraisalPagination
              page={page}
              pageSize={pageSize}
              totalCount={pagination.count}
              onPageChange={(p) => { setPage(p); setSelectedIds(new Set()); }}
              onPageSizeChange={handlePageSizeChange}
            />
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={showFinaliseConfirm}
        title="Finalise Selected Appraisals"
        description={`Finalise ${selectedIds.size} selected appraisal${selectedIds.size !== 1 ? "s" : ""}? This action cannot be undone.`}
        confirmLabel="Finalise"
        variant="default"
        isLoading={isFinalising}
        onConfirm={() => void handleBulkFinalise()}
        onCancel={() => setShowFinaliseConfirm(false)}
      />
    </div>
  );
}
