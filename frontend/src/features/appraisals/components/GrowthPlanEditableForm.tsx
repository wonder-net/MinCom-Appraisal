/**
 * GrowthPlanEditableForm — The editable growth plan form with all five sections.
 *
 * Manages local form state for overall assessment, strengths/weaknesses,
 * training needs, career plans, and development needs.
 */

import { useState, useMemo, useCallback, useRef, useEffect, type FormEvent } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { GrowthPlan, GrowthPlanPayload } from "@/types";
import { SwSection } from "./SwSection";
import { TnSection } from "./TnSection";
import { CpSection } from "./CpSection";
import { DnSection } from "./DnSection";
import {
  emptyStrengthWeakness,
  emptyTrainingNeed,
  emptyCareerPlan,
  emptyDevelopmentNeed,
  toPayload,
  fromGrowthPlan,
} from "@/utils/growth-plan-helpers";
import type {
  StrengthWeakness,
  TrainingNeed,
  CareerPlan,
  DevelopmentNeed,
  StrengthWeaknessType,
  TrainingNeedPriority,
  TrainingNeedType,
  CareerPlanPriority,
  DevelopmentNeedPriority,
} from "@/types";

interface GrowthPlanEditableFormProps {
  initialData: GrowthPlan | null;
  isSaving: boolean;
  saveError: string | null;
  onSave: (payload: GrowthPlanPayload) => Promise<boolean>;
}

export function GrowthPlanEditableForm({
  initialData,
  isSaving,
  saveError,
  onSave,
}: GrowthPlanEditableFormProps) {
  const initial = useMemo(
    () =>
      initialData
        ? fromGrowthPlan(initialData)
        : {
            overallAssessment: "",
            promotionRecommendation: "",
            strengthsWeaknesses: [emptyStrengthWeakness()],
            trainingNeeds: [emptyTrainingNeed()],
            careerPlans: [emptyCareerPlan()],
            developmentNeeds: [emptyDevelopmentNeed()],
          },
    [initialData],
  );

  const [overallAssessment, setOverallAssessment] = useState(initial.overallAssessment);
  const [promotionRecommendation, setPromotionRecommendation] = useState(initial.promotionRecommendation);
  const [sw, setSw] = useState<StrengthWeakness[]>(initial.strengthsWeaknesses);
  const [tn, setTn] = useState<TrainingNeed[]>(initial.trainingNeeds);
  const [cp, setCp] = useState<CareerPlan[]>(initial.careerPlans);
  const [dn, setDn] = useState<DevelopmentNeed[]>(initial.developmentNeeds);

  const handleAddSw = useCallback((type: StrengthWeaknessType) => setSw((prev) => [...prev, { ...emptyStrengthWeakness(), type }]), []);
  const handleRemoveSw = useCallback((id: string) => setSw((prev) => prev.filter((e) => e.id !== id)), []);
  const handleUpdateSwType = useCallback((id: string, type: StrengthWeaknessType) =>
    setSw((prev) => prev.map((e) => (e.id === id ? { ...e, type } : e))), []);
  const handleUpdateSwDesc = useCallback((id: string, description: string) =>
    setSw((prev) => prev.map((e) => (e.id === id ? { ...e, description } : e))), []);

  const OTJ_PRIORITIES: TrainingNeedPriority[] = ["FIRST", "SECOND", "THIRD", "FOURTH"];
  const REC_PRIORITIES: TrainingNeedPriority[] = ["FIRST", "SECOND", "THIRD"];
  const handleAddTn = useCallback((type: TrainingNeedType) => setTn((prev) => {
    const sameType = prev.filter((e) => e.type === type);
    const priorities = type === "ON_THE_JOB" ? OTJ_PRIORITIES : REC_PRIORITIES;
    const used = new Set(sameType.map((e) => e.priority));
    const next = priorities.find((p) => !used.has(p)) ?? "FIRST";
    return [...prev, { ...emptyTrainingNeed(type), priority: next }];
  }), []);
  const handleRemoveTn = useCallback((id: string) => setTn((prev) => prev.filter((e) => e.id !== id)), []);
  const handleUpdateTnField = useCallback((id: string, field: keyof TrainingNeed, value: string) =>
    setTn((prev) => prev.map((e) => (e.id === id ? { ...e, [field]: value } : e))), []);

  const CP_PRIORITIES: CareerPlanPriority[] = ["FIRST", "SECOND", "THIRD"];
  const handleAddCp = useCallback(() => setCp((prev) => {
    const used = new Set(prev.map((e) => e.priority));
    const next = CP_PRIORITIES.find((p) => !used.has(p)) ?? "FIRST";
    return [...prev, { ...emptyCareerPlan(), priority: next }];
  }), []);
  const handleRemoveCp = useCallback((id: string) => setCp((prev) => prev.filter((e) => e.id !== id)), []);
  const handleUpdateCpField = useCallback(
    (id: string, field: keyof CareerPlan, value: string) =>
      setCp((prev) => prev.map((e) => (e.id === id ? { ...e, [field]: value } : e))),
    [],
  );

  const DN_PRIORITIES: DevelopmentNeedPriority[] = ["FIRST", "SECOND", "THIRD"];
  const handleAddDn = useCallback(() => setDn((prev) => {
    const used = new Set(prev.map((e) => e.priority));
    const next = DN_PRIORITIES.find((p) => !used.has(p)) ?? "FIRST";
    return [...prev, { ...emptyDevelopmentNeed(), priority: next }];
  }), []);
  const handleRemoveDn = useCallback((id: string) => setDn((prev) => prev.filter((e) => e.id !== id)), []);
  const handleUpdateDnField = useCallback((id: string, field: keyof DevelopmentNeed, value: string) =>
    setDn((prev) => prev.map((e) => (e.id === id ? { ...e, [field]: value } : e))), []);

  const [showSaved, setShowSaved] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      setShowSaved(false);
      onSave(toPayload(overallAssessment, sw, tn, cp, dn, promotionRecommendation)).then((success) => {
        if (success) {
          if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
          setShowSaved(true);
          savedTimerRef.current = setTimeout(() => setShowSaved(false), 3000);
        }
      });
    },
    [onSave, overallAssessment, sw, tn, cp, dn, promotionRecommendation],
  );

  return (
    <form aria-label="Growth plan form" onSubmit={handleSubmit}>
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs">Appraisor Editing</Badge>
          <span className="text-sm text-gray-500">Growth Planning stage — complete all sections then save.</span>
        </div>

        <Card className="shadow-sm">
          <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200 px-6 py-4">
            <CardTitle className="text-lg font-semibold text-gray-900">Overall Assessment</CardTitle>
          </CardHeader>
          <CardContent className="px-6 py-6">
            <label htmlFor="overall-assessment" className="text-sm font-medium text-gray-900 block mb-1">
              Assessment narrative <span className="text-red-700">*</span>
            </label>
            <Textarea
              id="overall-assessment"
              rows={5}
              placeholder="Provide an overall assessment of the employee's performance and development..."
              className="resize-none focus-visible:ring-2 focus-visible:ring-secondary"
              value={overallAssessment}
              onChange={(e) => setOverallAssessment(e.target.value)}
              required
            />
          </CardContent>
        </Card>

        <SwSection entries={sw} onAdd={handleAddSw} onRemove={handleRemoveSw} onUpdateType={handleUpdateSwType} onUpdateDesc={handleUpdateSwDesc} />
        <TnSection entries={tn} onAdd={handleAddTn} onRemove={handleRemoveTn} onUpdateField={handleUpdateTnField} />
        <CpSection entries={cp} onAdd={handleAddCp} onRemove={handleRemoveCp} onUpdateField={handleUpdateCpField} />
        <DnSection entries={dn} onAdd={handleAddDn} onRemove={handleRemoveDn} onUpdateField={handleUpdateDnField} />

        <Card className="shadow-sm">
          <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200 px-6 py-4">
            <CardTitle className="text-lg font-semibold text-gray-900">Promotion Recommendation</CardTitle>
          </CardHeader>
          <CardContent className="px-6 py-6">
            <label htmlFor="promotion-recommendation" className="text-sm font-medium text-gray-900 block mb-1">
              Recommendation
            </label>
            <Textarea
              id="promotion-recommendation"
              rows={3}
              placeholder="Optional — recommend the employee for promotion, and to what role, if applicable..."
              className="resize-none focus-visible:ring-2 focus-visible:ring-secondary"
              value={promotionRecommendation}
              onChange={(e) => setPromotionRecommendation(e.target.value)}
            />
          </CardContent>
        </Card>

        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          {saveError && (
            <p role="alert" className="text-sm text-red-700">{saveError}</p>
          )}
          <div className="flex items-center gap-3 ml-auto">
            <span className="text-sm text-emerald-600 font-medium" role="status" aria-live="polite">
              {showSaved ? "Saved" : ""}
            </span>
            <Button type="submit" disabled={isSaving} className="bg-primary text-white hover:bg-primary-dark">
              {isSaving ? "Saving..." : "Save Growth Plan"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
