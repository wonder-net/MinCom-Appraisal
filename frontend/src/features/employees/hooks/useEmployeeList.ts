/**
 * useEmployeeList — custom hook for fetching paginated employee data
 * with debounced search support.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { listEmployees } from "@/api/employees";
import type { Employee } from "@/api/employees";

const DEFAULT_PAGE_SIZE = 20;
const DEBOUNCE_MS = 300;

interface UseEmployeeListResult {
  employees: Employee[];
  count: number;
  page: number;
  pageSize: number;
  isLoading: boolean;
  isFetching: boolean;
  error: string | null;
  searchInput: string;
  debouncedSearch: string;
  setSearchInput: (value: string) => void;
  setPage: (page: number) => void;
  retry: () => void;
}

export function useEmployeeList(): UseEmployeeListResult {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const hasFetchedRef = useRef(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchData = useCallback(async () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();

    if (!hasFetchedRef.current) {
      setIsLoading(true);
    }
    setIsFetching(true);
    setError(null);

    try {
      const result = await listEmployees({
        search: debouncedSearch.length > 0 ? debouncedSearch : undefined,
        page,
        page_size: DEFAULT_PAGE_SIZE,
      });
      setEmployees(result.data);
      setCount(result.meta?.pagination?.count ?? 0);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Failed to load employees. Please try again.");
    } finally {
      if (!abortRef.current?.signal.aborted) {
        hasFetchedRef.current = true;
        setIsLoading(false);
        setIsFetching(false);
      }
    }
  }, [debouncedSearch, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    employees,
    count,
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    isLoading,
    isFetching,
    error,
    searchInput,
    debouncedSearch,
    setSearchInput,
    setPage,
    retry: fetchData,
  };
}
