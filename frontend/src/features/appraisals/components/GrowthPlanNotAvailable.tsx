/**
 * GrowthPlanNotAvailable — Empty state shown when the appraisal has not
 * yet reached the GROWTH_PLANNING stage.
 */

export function GrowthPlanNotAvailable() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[200px] gap-2 text-center py-12">
      <p className="text-base font-medium text-gray-500">
        Growth plan not yet available
      </p>
      <p className="text-sm text-gray-400">
        The growth plan section is unlocked at the Growth Planning stage.
      </p>
    </div>
  );
}
