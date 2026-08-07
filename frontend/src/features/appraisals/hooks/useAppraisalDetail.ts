/**
 * Hook for fetching an appraisal with its deliverables and
 * competency ratings in parallel.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  getAppraisal,
  listDeliverables,
  listCompetencies,
} from "@/api/appraisals";
import type {
  Appraisal,
  KeyDeliverable,
  CompetencyRating,
} from "@/types";

interface UseAppraisalDetailResult {
  appraisal: Appraisal | null;
  deliverables: KeyDeliverable[];
  competencies: CompetencyRating[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  setDeliverables: React.Dispatch<React.SetStateAction<KeyDeliverable[]>>;
  setAppraisal: React.Dispatch<React.SetStateAction<Appraisal | null>>;
}

export function useAppraisalDetail(
  id: string | undefined,
): UseAppraisalDetailResult {
  const [appraisal, setAppraisal] = useState<Appraisal | null>(null);
  const [deliverables, setDeliverables] = useState<KeyDeliverable[]>([]);
  const [competencies, setCompetencies] = useState<CompetencyRating[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const initialLoadDone = useRef(false);

  const fetchDetail = useCallback(async () => {
    if (!id) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Only show loading skeleton on the initial load, not on refetches
    if (!initialLoadDone.current) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const [appraisalData, deliverablesData, competenciesData] =
        await Promise.all([
          getAppraisal(id),
          listDeliverables(id),
          listCompetencies(id),
        ]);

      if (controller.signal.aborted) return;

      setAppraisal(appraisalData);
      setDeliverables(deliverablesData);
      setCompetencies(competenciesData);
      initialLoadDone.current = true;
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      const message =
        err instanceof Error
          ? err.message
          : "Failed to load appraisal details";
      setError(message);
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [id]);

  useEffect(() => {
    void fetchDetail();

    return () => {
      abortRef.current?.abort();
    };
  }, [fetchDetail]);

  return {
    appraisal,
    deliverables,
    competencies,
    isLoading,
    error,
    refetch: fetchDetail,
    setDeliverables,
    setAppraisal,
  };
}
