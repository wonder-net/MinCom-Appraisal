/**
 * useAuditLogs — custom hook for fetching audit log entries
 * with cursor-based pagination and query-param filtering.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { listAuditLogs } from "@/api/audit";
import type { AuditLogEntry, AuditLogParams } from "@/api/audit";

export interface AuditFilterState {
  resource_type: string;
  action: string;
  from_date: string;
  to_date: string;
}

const EMPTY_FILTER: AuditFilterState = {
  resource_type: "",
  action: "",
  from_date: "",
  to_date: "",
};

function isFilterActive(filter: AuditFilterState): boolean {
  return (
    filter.resource_type !== "" ||
    filter.action !== "" ||
    filter.from_date !== "" ||
    filter.to_date !== ""
  );
}

interface UseAuditLogsResult {
  entries: AuditLogEntry[];
  isLoading: boolean;
  isFetching: boolean;
  error: string | null;
  nextCursor: string | null;
  cursorHistory: string[];
  isFiltered: boolean;
  filter: AuditFilterState;
  goToNext: () => void;
  goToPrevious: () => void;
  applyFilter: (filterState: AuditFilterState) => void;
  clearFilter: () => void;
  retry: () => void;
}

export function useAuditLogs(): UseAuditLogsResult {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasFetchedRef = useRef(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [currentCursor, setCurrentCursor] = useState<string | undefined>(
    undefined,
  );
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [filter, setFilter] = useState<AuditFilterState>(EMPTY_FILTER);

  const fetchData = useCallback(async () => {
    if (!hasFetchedRef.current) {
      setIsLoading(true);
    }
    setIsFetching(true);
    setError(null);

    try {
      const params: AuditLogParams = {};

      if (currentCursor) {
        params.cursor = currentCursor;
      }
      if (filter.resource_type) {
        params.resource_type = filter.resource_type;
      }
      if (filter.action) {
        params.action = filter.action;
      }
      if (filter.from_date) {
        params.timestamp__gte = `${filter.from_date}T00:00:00Z`;
      }
      if (filter.to_date) {
        params.timestamp__lte = `${filter.to_date}T23:59:59Z`;
      }

      const result = await listAuditLogs(params);
      setEntries(result.results);
      setNextCursor(result.next);
    } catch (_err: unknown) {
      setError("Failed to load audit log. Please try again.");
    } finally {
      hasFetchedRef.current = true;
      setIsLoading(false);
      setIsFetching(false);
    }
  }, [currentCursor, filter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const goToNext = useCallback(() => {
    if (!nextCursor) return;
    setCursorHistory((prev) => [
      ...prev,
      ...(currentCursor ? [currentCursor] : [""]),
    ]);
    setCurrentCursor(nextCursor);
  }, [nextCursor, currentCursor]);

  const goToPrevious = useCallback(() => {
    setCursorHistory((prev) => {
      const newHistory = [...prev];
      const previousCursor = newHistory.pop();
      setCurrentCursor(
        previousCursor === "" ? undefined : previousCursor,
      );
      return newHistory;
    });
  }, []);

  const applyFilter = useCallback(
    (filterState: AuditFilterState) => {
      setFilter(filterState);
      setCurrentCursor(undefined);
      setCursorHistory([]);
    },
    [],
  );

  const clearFilter = useCallback(() => {
    setFilter(EMPTY_FILTER);
    setCurrentCursor(undefined);
    setCursorHistory([]);
  }, []);

  return {
    entries,
    isLoading,
    isFetching,
    error,
    nextCursor,
    cursorHistory,
    isFiltered: isFilterActive(filter),
    filter,
    goToNext,
    goToPrevious,
    applyFilter,
    clearFilter,
    retry: fetchData,
  };
}
