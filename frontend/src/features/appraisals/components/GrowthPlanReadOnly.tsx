/**
 * GrowthPlanReadOnly — Renders the growth plan in read-only mode.
 *
 * Displayed when the user is not the APPRAISER or the appraisal is
 * past the GROWTH_PLANNING stage.
 */

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { GrowthPlan } from "@/types";
import { POTENTIAL_RATING_LABELS } from "@/types";
import { ReadOnlyField } from "./ReadOnlyField";
import { swTypeLabel, priorityLabel, sortByPriority } from "@/utils/growth-plan-helpers";

interface GrowthPlanReadOnlyProps {
  growthPlan: GrowthPlan | null;
}

export function GrowthPlanReadOnly({ growthPlan }: GrowthPlanReadOnlyProps) {
  if (!growthPlan) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[200px] gap-2 text-center py-12">
        <p className="text-base font-medium text-gray-500">
          No growth plan has been recorded yet
        </p>
        <p className="text-sm text-gray-400">
          The appraiser will complete this during the Growth Planning stage.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" aria-label="Growth plan (read-only)">
      {/* Overall Assessment */}
      <Card className="shadow-sm">
        <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200 px-6 py-4">
          <CardTitle className="text-lg font-semibold text-gray-900">Overall Assessment</CardTitle>
        </CardHeader>
        <CardContent className="px-6 py-6">
          <dl>
            <ReadOnlyField label="Assessment narrative" value={growthPlan.overall_assessment} />
          </dl>
        </CardContent>
      </Card>

      {/* Strengths & Weaknesses */}
      <Card className="shadow-sm">
        <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200 px-6 py-4">
          <CardTitle className="text-lg font-semibold text-gray-900">Strengths & Weaknesses</CardTitle>
        </CardHeader>
        <CardContent className="px-6 py-6">
          {growthPlan.strengths_weaknesses.length === 0 ? (
            <p className="text-sm text-gray-400">No entries recorded.</p>
          ) : (
            <dl className="space-y-3">
              {growthPlan.strengths_weaknesses.map((entry, index) => (
                <ReadOnlyField
                  key={entry.id}
                  label={`${swTypeLabel(entry.type)} ${index + 1}`}
                  value={entry.description}
                />
              ))}
            </dl>
          )}
        </CardContent>
      </Card>

      {/* Training Needs */}
      <Card className="shadow-sm">
        <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200 px-6 py-4">
          <CardTitle className="text-lg font-semibold text-gray-900">Identified Training Needs</CardTitle>
        </CardHeader>
        <CardContent className="px-6 py-6">
          {growthPlan.training_needs.length === 0 ? (
            <p className="text-sm text-gray-400">No entries recorded.</p>
          ) : (
            <dl className="space-y-3">
              {sortByPriority(growthPlan.training_needs).map((entry, index) => (
                <ReadOnlyField
                  key={entry.id}
                  label={`Training need ${index + 1} (${priorityLabel(entry.priority)} priority)`}
                  value={entry.description}
                />
              ))}
            </dl>
          )}
        </CardContent>
      </Card>

      {/* Career Plans */}
      <Card className="shadow-sm">
        <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200 px-6 py-4">
          <CardTitle className="text-lg font-semibold text-gray-900">Career Plans</CardTitle>
        </CardHeader>
        <CardContent className="px-6 py-6">
          {growthPlan.career_plans.length === 0 ? (
            <p className="text-sm text-gray-400">No entries recorded.</p>
          ) : (
            <dl className="space-y-4">
              {sortByPriority(growthPlan.career_plans).map((entry) => (
                <ReadOnlyField
                  key={entry.id}
                  label={priorityLabel(entry.priority)}
                  value={entry.aspired_role}
                />
              ))}
            </dl>
          )}
        </CardContent>
      </Card>

      {/* Development Needs */}
      <Card className="shadow-sm">
        <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200 px-6 py-4">
          <CardTitle className="text-lg font-semibold text-gray-900">Career Plan Development Needs</CardTitle>
        </CardHeader>
        <CardContent className="px-6 py-6">
          {growthPlan.development_needs.length === 0 ? (
            <p className="text-sm text-gray-400">No entries recorded.</p>
          ) : (
            <dl className="space-y-3">
              {sortByPriority(growthPlan.development_needs).map((entry) => (
                <ReadOnlyField
                  key={entry.id}
                  label={priorityLabel(entry.priority)}
                  value={entry.description}
                />
              ))}
            </dl>
          )}
        </CardContent>
      </Card>

      {/* Promotion Recommendation */}
      <Card className="shadow-sm">
        <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200 px-6 py-4">
          <CardTitle className="text-lg font-semibold text-gray-900">Promotion Recommendation</CardTitle>
        </CardHeader>
        <CardContent className="px-6 py-6">
          <dl>
            <ReadOnlyField
              label="Recommendation"
              value={growthPlan.promotion_recommendation || "—"}
            />
          </dl>
        </CardContent>
      </Card>

      {/* Potential — feeds the 9-box talent grid (Reports) */}
      <Card className="shadow-sm">
        <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200 px-6 py-4">
          <CardTitle className="text-lg font-semibold text-gray-900">Potential</CardTitle>
        </CardHeader>
        <CardContent className="px-6 py-6">
          <dl>
            <ReadOnlyField
              label="Potential rating"
              value={growthPlan.potential_rating ? POTENTIAL_RATING_LABELS[growthPlan.potential_rating] : "Not rated"}
            />
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
