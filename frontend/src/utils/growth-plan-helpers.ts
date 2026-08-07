/**
 * Pure helper functions for growth plan form state transformations.
 */

import type {
  GrowthPlan,
  GrowthPlanPayload,
  StrengthWeakness,
  TrainingNeed,
  CareerPlan,
  DevelopmentNeed,
  StrengthWeaknessType,
  TrainingNeedPriority,
  TrainingNeedType,
} from "@/types";

/** Generates a temporary client-side ID for new list entries. */
export const makeTempId = (): string => `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

/** Creates a blank StrengthWeakness entry. */
export const emptyStrengthWeakness = (): StrengthWeakness => ({
  id: makeTempId(),
  type: "STRENGTH",
  description: "",
});

/** Creates a blank TrainingNeed entry of the given type. */
export const emptyTrainingNeed = (type: TrainingNeedType = "ON_THE_JOB"): TrainingNeed => ({
  id: makeTempId(),
  type,
  priority: "FIRST",
  description: "",
  institution: "",
});

/** Creates a blank CareerPlan entry. */
export const emptyCareerPlan = (): CareerPlan => ({
  id: makeTempId(),
  aspired_role: "",
  priority: "FIRST",
});

/** Creates a blank DevelopmentNeed entry. */
export const emptyDevelopmentNeed = (): DevelopmentNeed => ({
  id: makeTempId(),
  description: "",
  priority: "FIRST",
});

/** Maps a StrengthWeaknessType value to a display label. */
export const swTypeLabel = (type: StrengthWeaknessType): string =>
  type === "STRENGTH" ? "Strength" : "Weakness";

/** Maps a TrainingNeedPriority value to a display label. */
export const priorityLabel = (priority: TrainingNeedPriority): string => {
  const labels: Record<TrainingNeedPriority, string> = {
    FIRST: "1st",
    SECOND: "2nd",
    THIRD: "3rd",
    FOURTH: "4th",
  };
  return labels[priority];
};

/** Sort order for priority values. */
const PRIORITY_ORDER: Record<string, number> = {
  FIRST: 1,
  SECOND: 2,
  THIRD: 3,
  FOURTH: 4,
};

/** Sorts an array of items by their priority field. */
export const sortByPriority = <T extends { priority: string }>(items: T[]): T[] =>
  [...items].sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99));

/** Extracts the write payload from form state, stripping client-side IDs. */
export const toPayload = (
  overallAssessment: string,
  strengthsWeaknesses: StrengthWeakness[],
  trainingNeeds: TrainingNeed[],
  careerPlans: CareerPlan[],
  developmentNeeds: DevelopmentNeed[],
  promotionRecommendation: string = "",
): GrowthPlanPayload => ({
  overall_assessment: overallAssessment,
  promotion_recommendation: promotionRecommendation,
  strengths_weaknesses: strengthsWeaknesses.map(({ type, description }) => ({
    type,
    description,
  })),
  training_needs: trainingNeeds.map(({ type, priority, description, institution }) => ({
    type,
    priority,
    description,
    ...(type === "RECOMMENDED_COURSE" && institution ? { institution } : {}),
  })),
  career_plans: careerPlans.map(({ aspired_role, priority }) => ({
    aspired_role,
    priority,
  })),
  development_needs: developmentNeeds.map(({ description, priority }) => ({
    description,
    priority,
  })),
});

/** Extracts initial form state from an existing GrowthPlan. */
export const fromGrowthPlan = (
  plan: GrowthPlan,
): {
  overallAssessment: string;
  promotionRecommendation: string;
  strengthsWeaknesses: StrengthWeakness[];
  trainingNeeds: TrainingNeed[];
  careerPlans: CareerPlan[];
  developmentNeeds: DevelopmentNeed[];
} => ({
  overallAssessment: plan.overall_assessment,
  promotionRecommendation: plan.promotion_recommendation ?? "",
  strengthsWeaknesses: plan.strengths_weaknesses,
  trainingNeeds: plan.training_needs,
  careerPlans: plan.career_plans,
  developmentNeeds: plan.development_needs,
});
