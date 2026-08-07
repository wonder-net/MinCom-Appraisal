/**
 * Hook for fetching the paginated appraisal list with filters.
 *
 * Manages loading, error, and pagination state. Refetches when
 * params change.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { listAppraisals } from "@/api/appraisals";
import type {
  Appraisal,
  AppraisalListParams,
  PaginationMeta,
} from "@/types";

interface UseAppraisalsResult {
  data: Appraisal[];
  isLoading: boolean;
  isFetching: boolean;
  error: string | null;
  pagination: PaginationMeta;
  refetch: () => void;
}

const EMPTY_PAGINATION: PaginationMeta = {
  count: 0,
  next: null,
  previous: null,
};

export function useAppraisals(
  params?: AppraisalListParams,
): UseAppraisalsResult {
  const [data, setData] = useState<Appraisal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationMeta>(EMPTY_PAGINATION);
  const abortRef = useRef<AbortController | null>(null);
  const hasFetchedRef = useRef(false);

  const fetchAppraisals = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!hasFetchedRef.current) {
      setIsLoading(true);
    }
    setIsFetching(true);
    setError(null);

    try {
      const response = await listAppraisals(params);
      if (controller.signal.aborted) return;

      // StandardResponseRenderer: { status, data: [...], meta: { pagination } }
      const items = Array.isArray(response.data) ? response.data : [];
      const pag = response.meta?.pagination;
      setData(items);
      setPagination({
        count: pag?.count ?? 0,
        next: pag?.next ?? null,
        previous: pag?.previous ?? null,
      });
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      const message =
        err instanceof Error ? err.message : "Failed to load appraisals";
      setError(message);
    } finally {
      if (!controller.signal.aborted) {
        hasFetchedRef.current = true;
        setIsLoading(false);
        setIsFetching(false);
      }
    }
  }, [params]);

  useEffect(() => {
    void fetchAppraisals();

    return () => {
      abortRef.current?.abort();
    };
  }, [fetchAppraisals]);

  return { data, isLoading, isFetching, error, pagination, refetch: fetchAppraisals };
}
