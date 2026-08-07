/**
 * useCycles — Hook for fetching the list of appraisal cycles.
 *
 * Returns loading, error, and data states with a refetch function
 * for refreshing after create/update/lifecycle operations.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { listCycles } from "@/api/appraisals";
import type { AppraisalCycle } from "@/types";

interface UseCyclesResult {
  cycles: AppraisalCycle[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useCycles(): UseCyclesResult {
  const [cycles, setCycles] = useState<AppraisalCycle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchCycles = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const data = await listCycles();
      if (controller.signal.aborted) return;
      setCycles(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      const message =
        err instanceof Error ? err.message : "Failed to load cycles";
      setError(message);
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchCycles();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchCycles]);

  const refetch = useCallback(() => {
    void fetchCycles();
  }, [fetchCycles]);

  return { cycles, isLoading, error, refetch };
}
