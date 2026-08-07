/**
 * KdSection — Groups key performance indicators by BSC perspective and
 * renders a KdPerspectiveCard for each. Shows weight validation
 * total at the bottom.
 */

import { useMemo } from "react";
import { KdPerspectiveCard } from "./KdPerspectiveCard";
import { HelpIcon } from "@/components/HelpIcon";
import type { KeyDeliverable, BscPerspective, FormType, UpdateKeyDeliverableRequest } from "@/types";

interface KdSectionProps {
  deliverables: KeyDeliverable[];
  selfRatingEnabled: boolean;
  canEditKd: boolean;
  canMgrRate: boolean;
  formType: FormType;
  onUpdateKd: (kdId: string, updates: UpdateKeyDeliverableRequest) => void;
  onDeleteKd: (kdId: string) => void;
  onAddKd: (perspective: BscPerspective, description: string, weight: number, selfRating?: number, managerRating?: number) => void;
  onWeightError?: (message: string) => void;
}

const PERSPECTIVE_ORDER: readonly BscPerspective[] = [
  "FINANCIAL",
  "CUSTOMER",
  "INTERNAL_BUSINESS_PROCESSES",
  "LEARNING_AND_GROWTH",
];

/** Default caps when no KD data is available — keyed by form type. */
const DEFAULT_CAPS_FORM_B: Record<BscPerspective, { weightCap: number | null; maxKdCount: number | null }> = {
  FINANCIAL: { weightCap: 0.30, maxKdCount: 4 },
  CUSTOMER: { weightCap: 0.30, maxKdCount: 4 },
  INTERNAL_BUSINESS_PROCESSES: { weightCap: 0.20, maxKdCount: 4 },
  LEARNING_AND_GROWTH: { weightCap: 0.20, maxKdCount: 4 },
};

const DEFAULT_CAPS_FORM_A: Record<BscPerspective, { weightCap: number | null; maxKdCount: number | null }> = {
  FINANCIAL: { weightCap: null, maxKdCount: 6 },
  CUSTOMER: { weightCap: null, maxKdCount: 6 },
  INTERNAL_BUSINESS_PROCESSES: { weightCap: null, maxKdCount: 6 },
  LEARNING_AND_GROWTH: { weightCap: null, maxKdCount: 6 },
};

export function KdSection({
  deliverables,
  selfRatingEnabled,
  canEditKd,
  canMgrRate,
  formType,
  onUpdateKd,
  onDeleteKd,
  onAddKd,
  onWeightError,
}: KdSectionProps) {
  const defaultCaps = formType === "FORM_A" ? DEFAULT_CAPS_FORM_A : DEFAULT_CAPS_FORM_B;
  const grouped = useMemo(() => {
    const map = new Map<BscPerspective, KeyDeliverable[]>();
    for (const perspective of PERSPECTIVE_ORDER) {
      map.set(perspective, []);
    }
    for (const kd of deliverables) {
      const list = map.get(kd.perspective);
      if (list) {
        map.set(kd.perspective, [...list, kd]);
      }
    }
    // Sort within each perspective by sort_order then created_at for stable ordering
    for (const [perspective, kds] of map) {
      map.set(perspective, [...kds].sort((a, b) =>
        a.sort_order !== b.sort_order
          ? a.sort_order - b.sort_order
          : a.created_at.localeCompare(b.created_at),
      ));
    }
    return map;
  }, [deliverables]);

  /** Extract caps from KD data (first KD in each perspective). */
  const capsMap = useMemo(() => {
    const map = new Map<BscPerspective, { weightCap: number | null; maxKdCount: number | null }>();
    for (const perspective of PERSPECTIVE_ORDER) {
      const kds = grouped.get(perspective) ?? [];
      const firstKd = kds[0];
      if (firstKd && (firstKd.perspective_weight_cap != null || firstKd.perspective_max_kd_count != null)) {
        map.set(perspective, {
          weightCap: firstKd.perspective_weight_cap != null ? Number(firstKd.perspective_weight_cap) : null,
          maxKdCount: firstKd.perspective_max_kd_count,
        });
      } else {
        map.set(perspective, defaultCaps[perspective]);
      }
    }
    return map;
  }, [grouped, defaultCaps]);

  const totalWeight = useMemo(
    () => deliverables.reduce((sum, kd) => sum + Number(kd.weight), 0),
    [deliverables],
  );

  const weightIsValid = Math.abs(totalWeight - 1.0) < 0.001;

  const hasNoDeliverables = deliverables.length === 0 && !canEditKd;

  // Pick a context-appropriate help deep-link. Three branches:
  //   1. canMgrRate=true  → manager rating guide (manager actively scoring KDs)
  //   2. canEditKd=true   → employee self-assessment guide (employee editing/rating)
  //   3. read-only        → neutral workflow-stages reference (signed-off, finalised,
  //                          HR Admin viewing past appraisal — pointing at the
  //                          self-assessment guide here would be misleading)
  const helpTarget = canMgrRate
    ? {
        to: "/help/manager-guide/rating-key-deliverables",
        label: "rating key performance indicators",
      }
    : canEditKd
      ? {
          to: "/help/employee-guide/completing-self-assessment",
          label: "self assessment",
        }
      : {
          to: "/help/reference/workflow-stages",
          label: "workflow stages",
        };

  if (hasNoDeliverables) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-base font-semibold text-gray-900">
            Key Performance Indicators
          </h2>
          <HelpIcon to={helpTarget.to} label={helpTarget.label} />
        </div>
        <div className="text-center py-16">
          <p className="text-base font-medium text-gray-700">
            No key performance indicators added yet.
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Key performance indicators will appear here once added.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-900">
          Key Performance Indicators
        </h2>
        <HelpIcon to={helpTarget.to} label={helpTarget.label} />
      </div>
      {PERSPECTIVE_ORDER.map((perspective) => {
        const caps = capsMap.get(perspective) ?? defaultCaps[perspective];
        return (
          <KdPerspectiveCard
            key={perspective}
            perspective={perspective}
            deliverables={grouped.get(perspective) ?? []}
            selfRatingEnabled={selfRatingEnabled}
            canEditKd={canEditKd}
            canMgrRate={canMgrRate}
            weightCap={caps.weightCap}
            maxKdCount={caps.maxKdCount}
            totalWeight={totalWeight}
            onUpdateKd={onUpdateKd}
            onDeleteKd={onDeleteKd}
            onAddKd={onAddKd}
            onWeightError={onWeightError}
          />
        );
      })}

      {/* Weight validation */}
      {deliverables.length > 0 && (
        <div className="flex justify-end gap-2 text-sm pt-2">
          <span className="text-gray-600">Total weight:</span>
          <span
            className={`font-semibold ${
              weightIsValid ? "text-emerald-700" : "text-red-700"
            }`}
            aria-live="polite"
          >
            {!weightIsValid && (
              <span aria-hidden="true" className="mr-1">
                &#9888;
              </span>
            )}
            {(totalWeight * 100).toFixed(0)}% / 100%
          </span>
        </div>
      )}
    </div>
  );
}
