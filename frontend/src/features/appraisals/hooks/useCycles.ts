/**
 * Hook for fetching available appraisal cycles.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { listCycles } from "@/api/appraisals";
import type { AppraisalCycle } from "@/types";

interface UseCyclesResult {
  cycles: AppraisalCycle[];
  isLoading: boolean;
  isFetching: boolean;
  error: string | null;
  refetch: () => void;
}

export function useCycles(): UseCyclesResult {
  const [cycles, setCycles] = useState<AppraisalCycle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const hasFetchedRef = useRef(false);

  const fetchCycles = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!hasFetchedRef.current) {
      setIsLoading(true);
    }
    setIsFetching(true);
    setError(null);

    try {
      const result = await listCycles();
      if (controller.signal.aborted) return;
      setCycles(result);
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      setError(
        err instanceof Error ? err.message : "Failed to load cycles",
      );
    } finally {
      if (!controller.signal.aborted) {
        hasFetchedRef.current = true;
        setIsLoading(false);
        setIsFetching(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchCycles();

    return () => {
      abortRef.current?.abort();
    };
  }, [fetchCycles]);

  return { cycles, isLoading, isFetching, error, refetch: fetchCycles };
}
