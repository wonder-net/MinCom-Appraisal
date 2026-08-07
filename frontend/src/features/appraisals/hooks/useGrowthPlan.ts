/**
 * useGrowthPlan — Custom hook for fetching and saving growth plan data.
 *
 * Manages loading, error, and saving state for the GrowthPlanForm component.
 */

import { useState, useEffect, useCallback } from "react";
import {
  getGrowthPlan,
  createGrowthPlan,
  updateGrowthPlan,
} from "@/api/growth-plans";
import { extractApiError } from "@/utils/extract-api-error";
import { isAxiosError } from "axios";
import type { GrowthPlan, GrowthPlanPayload } from "@/types";

interface UseGrowthPlanReturn {
  growthPlan: GrowthPlan | null;
  isLoading: boolean;
  fetchError: string | null;
  saveError: string | null;
  isSaving: boolean;
  saveGrowthPlan: (payload: GrowthPlanPayload) => Promise<boolean>;
}

export function useGrowthPlan(
  appraisalId: string,
  onSaveSuccess?: () => void,
  enabled: boolean = true,
): UseGrowthPlanReturn {
  const [growthPlan, setGrowthPlan] = useState<GrowthPlan | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchGrowthPlan() {
      setIsLoading(true);
      setFetchError(null);
      try {
        const data = await getGrowthPlan(appraisalId);
        if (!cancelled) {
          setGrowthPlan(data);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          // 404 means no growth plan exists yet — not an error
          if (isAxiosError(err) && err.response?.status === 404) {
            setGrowthPlan(null);
          } else {
            setFetchError(extractApiError(err));
          }
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchGrowthPlan();

    return () => {
      cancelled = true;
    };
  }, [appraisalId, enabled]);

  const saveGrowthPlan = useCallback(
    async (payload: GrowthPlanPayload): Promise<boolean> => {
      setSaveError(null);
      setIsSaving(true);

      try {
        let result: GrowthPlan;
        if (growthPlan) {
          result = await updateGrowthPlan(appraisalId, payload);
        } else {
          try {
            result = await createGrowthPlan(appraisalId, payload);
          } catch (createErr: unknown) {
            // If create fails with 409 (plan already exists but frontend
            // state is out of sync), fall back to update.
            if (
              isAxiosError(createErr) &&
              createErr.response?.status === 409
            ) {
              result = await updateGrowthPlan(appraisalId, payload);
            } else {
              throw createErr;
            }
          }
        }

        setGrowthPlan(result);
        onSaveSuccess?.();
        return true;
      } catch (err: unknown) {
        setSaveError(extractApiError(err));
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [appraisalId, growthPlan, onSaveSuccess],
  );

  return {
    growthPlan,
    isLoading,
    fetchError,
    saveError,
    isSaving,
    saveGrowthPlan,
  };
}
