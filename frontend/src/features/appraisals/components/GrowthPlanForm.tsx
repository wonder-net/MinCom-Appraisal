/**
 * GrowthPlanForm — Renders the growth plan form with five sections.
 *
 * Editable only when status === "GROWTH_PLANNING" AND userRelation === "APPRAISER".
 * All other combinations render a read-only view.
 *
 * Render variants:
 *   1. isLoading                                                       -> GrowthPlanSkeleton
 *   2. fetchError                                                      -> Error alert
 *   3. status not in GROWTH_PLAN_VISIBLE statuses AND signing_round === 0  -> GrowthPlanNotAvailable
 *   4. not editable                                                    -> GrowthPlanReadOnly
 *   5. editable                                                        -> GrowthPlanEditableForm
 *
 * Visibility note: the growth plan stays visible after escalation
 * (DISPUTED -> DISCUSSION) whenever `signingRound >= 1`, because reaching
 * PENDING_SIGNOFF at least once means GROWTH_PLANNING was completed.
 */

import { Alert, AlertDescription } from "@/components/ui/alert";
import type { AppraisalStatus } from "@/types";
import { GROWTH_PLAN_VISIBLE_STATUSES } from "@/types";
import { useGrowthPlan } from "../hooks/useGrowthPlan";
import { GrowthPlanSkeleton } from "./GrowthPlanSkeleton";
import { GrowthPlanNotAvailable } from "./GrowthPlanNotAvailable";
import { GrowthPlanReadOnly } from "./GrowthPlanReadOnly";
import { GrowthPlanEditableForm } from "./GrowthPlanEditableForm";

type UserRelation = "APPRAISER" | "APPRAISEE" | "HR_ADMIN" | "NONE";

interface GrowthPlanFormProps {
  appraisalId: string;
  status: AppraisalStatus;
  userRelation: UserRelation;
  signingRound: number;
  onRefresh: () => void;
}

export function GrowthPlanForm({
  appraisalId,
  status,
  userRelation,
  signingRound,
  onRefresh,
}: GrowthPlanFormProps) {
  const isAvailable =
    GROWTH_PLAN_VISIBLE_STATUSES.has(status) || signingRound >= 1;

  const {
    growthPlan,
    isLoading,
    fetchError,
    saveError,
    isSaving,
    saveGrowthPlan,
  } = useGrowthPlan(appraisalId, onRefresh, isAvailable);
  const isEditable =
    status === "GROWTH_PLANNING" && userRelation === "APPRAISER";

  // Show "not available" before loading/error if the workflow hasn't reached this stage
  if (!isAvailable) return <GrowthPlanNotAvailable />;

  if (isLoading) return <GrowthPlanSkeleton />;

  if (fetchError) {
    return (
      <Alert variant="error">
        <AlertDescription>{fetchError}</AlertDescription>
      </Alert>
    );
  }

  if (!isEditable) return <GrowthPlanReadOnly growthPlan={growthPlan} />;

  return (
    <GrowthPlanEditableForm
      initialData={growthPlan}
      isSaving={isSaving}
      saveError={saveError}
      onSave={saveGrowthPlan}
    />
  );
}
