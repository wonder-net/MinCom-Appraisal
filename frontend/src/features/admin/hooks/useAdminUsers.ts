/**
 * Hook for fetching the paginated admin user list.
 *
 * Manages loading, error, and pagination state. Provides a refetch
 * function for refreshing after create/update operations.
 */

import { useState, useEffect, useCallback, useRef } from "react";

import { listUsers } from "@/api/admin-users";
import type { AdminUser, PaginationMeta } from "@/types";

interface UseAdminUsersResult {
  users: AdminUser[];
  isLoading: boolean;
  isFetching: boolean;
  error: string | null;
  pagination: PaginationMeta;
  goToNext: () => void;
  goToPrevious: () => void;
  refetch: () => void;
}

const EMPTY_PAGINATION: PaginationMeta = {
  count: 0,
  next: null,
  previous: null,
};

export function useAdminUsers(search?: string): UseAdminUsersResult {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] =
    useState<PaginationMeta>(EMPTY_PAGINATION);
  const [pageUrl, setPageUrl] = useState<number | string | undefined>(
    undefined,
  );
  const abortRef = useRef<AbortController | null>(null);
  const hasFetchedRef = useRef(false);

  // Reset pagination to page 1 when search term changes
  useEffect(() => {
    setPageUrl(undefined);
  }, [search]);

  const fetchUsers = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!hasFetchedRef.current) {
      setIsLoading(true);
    }
    setIsFetching(true);
    setError(null);

    try {
      const response = await listUsers(pageUrl, search);
      if (controller.signal.aborted) return;

      // StandardResponseRenderer: { status, data: [...], meta: { pagination } }
      const items = Array.isArray(response.data) ? response.data : [];
      const pag = response.meta?.pagination;
      setUsers(items);
      setPagination({
        count: pag?.count ?? 0,
        next: pag?.next ?? null,
        previous: pag?.previous ?? null,
      });
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      const message =
        err instanceof Error ? err.message : "Failed to load users";
      setError(message);
    } finally {
      if (!controller.signal.aborted) {
        hasFetchedRef.current = true;
        setIsLoading(false);
        setIsFetching(false);
      }
    }
  }, [pageUrl, search]);

  useEffect(() => {
    void fetchUsers();

    return () => {
      abortRef.current?.abort();
    };
  }, [fetchUsers]);

  const goToNext = useCallback(() => {
    if (pagination.next) {
      setPageUrl(pagination.next);
    }
  }, [pagination.next]);

  const goToPrevious = useCallback(() => {
    if (pagination.previous) {
      setPageUrl(pagination.previous);
    }
  }, [pagination.previous]);

  const refetch = useCallback(() => {
    void fetchUsers();
  }, [fetchUsers]);

  return {
    users,
    isLoading,
    isFetching,
    error,
    pagination,
    goToNext,
    goToPrevious,
    refetch,
  };
}
