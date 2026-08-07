/**
 * ScoreDescriptorConfigSection — Displays snapshot and live descriptor
 * bands side by side with a warning banner when they differ.
 */

import { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Info } from "lucide-react";
import { useScoreDescriptorConfig } from "../hooks/useScoreDescriptorConfig";
import type { DescriptorBand } from "@/api/reports";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Compare two band arrays to determine if any field differs for the same
 * sort_order. Returns true when there is at least one mismatch.
 */
function bandsDiffer(
  snapshot: readonly DescriptorBand[],
  live: readonly DescriptorBand[],
): boolean {
  if (snapshot.length !== live.length) return true;

  const liveMap = new Map(live.map((b) => [b.sort_order, b]));

  return snapshot.some((sb) => {
    const lb = liveMap.get(sb.sort_order);
    if (!lb) return true;
    return (
      sb.min_score !== lb.min_score ||
      sb.max_score !== lb.max_score ||
      sb.kd_label !== lb.kd_label ||
      sb.competency_label !== lb.competency_label
    );
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ConfigSkeleton() {
  return (
    <div
      className="animate-pulse space-y-3 p-6"
      aria-busy="true"
      aria-label="Loading descriptor configuration"
    >
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

interface BandTableProps {
  title: string;
  bands: readonly DescriptorBand[];
  tableLabel: string;
}

function BandTable({ title, bands, tableLabel }: BandTableProps) {
  return (
    <Card className="shadow-sm flex-1 min-w-0">
      <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200 px-6 py-3">
        <CardTitle className="text-base font-semibold text-gray-900">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label={tableLabel}>
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left">
                <th
                  scope="col"
                  className="px-4 py-3 font-semibold text-gray-900"
                >
                  Sort Order
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 font-semibold text-gray-900"
                >
                  Min Score
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 font-semibold text-gray-900"
                >
                  Max Score
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 font-semibold text-gray-900"
                >
                  KD Label
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 font-semibold text-gray-900"
                >
                  Competency Label
                </th>
              </tr>
            </thead>
            <tbody>
              {bands.map((band, i) => (
                <tr
                  key={band.sort_order}
                  className={`border-b border-gray-200 last:border-0 ${
                    i % 2 === 1 ? "bg-gray-50" : "bg-white"
                  }`}
                >
                  <td className="px-4 py-3 text-gray-900 font-medium">
                    {band.sort_order}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {band.min_score}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {band.max_score}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {band.kd_label}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {band.competency_label}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ScoreDescriptorConfigSectionProps {
  cycleId?: string;
}

export function ScoreDescriptorConfigSection({
  cycleId,
}: ScoreDescriptorConfigSectionProps) {
  const { data, isLoading, error, retry } =
    useScoreDescriptorConfig(cycleId);

  const hasDifferences = useMemo(() => {
    if (!data) return false;
    if (data.config_snapshot_bands.length === 0) return false;
    return bandsDiffer(data.config_snapshot_bands, data.live_bands);
  }, [data]);

  const emptySnapshot =
    data !== null && data.config_snapshot_bands.length === 0;

  // No cycle selected — show placeholder
  if (!cycleId) {
    return (
      <section aria-label="Score descriptor configuration">
        <Card className="shadow-sm">
          <CardContent className="py-16">
            <div className="flex flex-col items-center justify-center text-center">
              <Info
                className="h-12 w-12 text-gray-400 mb-3"
                aria-hidden="true"
              />
              <p className="text-base font-medium text-gray-500">
                Select a cycle to view descriptor configuration.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section aria-label="Score descriptor configuration">
      {/* Error state */}
      {error && (
        <div
          className="mb-4 rounded-md border border-red-200 bg-red-50 px-6 py-4"
          role="alert"
        >
          <p className="text-sm text-red-800">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={retry}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Loading state */}
      {isLoading && <ConfigSkeleton />}

      {/* Warning banner when bands differ */}
      {!isLoading && !error && hasDifferences && (
        <div
          className="mb-4 flex items-center gap-2 rounded-md border border-orange-300 bg-orange-50 px-4 py-3"
          role="alert"
        >
          <AlertTriangle
            className="h-5 w-5 shrink-0 text-orange-600"
            aria-hidden="true"
          />
          <p className="text-sm font-medium text-orange-800">
            Live bands have been modified since cycle activation.
          </p>
        </div>
      )}

      {/* Empty snapshot message */}
      {!isLoading && !error && emptySnapshot && (
        <div
          className="mb-4 flex items-center gap-2 rounded-md border border-blue-300 bg-primary-light px-4 py-3"
          role="status"
        >
          <Info
            className="h-5 w-5 shrink-0 text-blue-600"
            aria-hidden="true"
          />
          <p className="text-sm text-blue-700">
            No snapshot recorded for this cycle.
          </p>
        </div>
      )}

      {/* Side-by-side tables */}
      {!isLoading && !error && data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {!emptySnapshot && (
            <BandTable
              title="Snapshot Bands (at cycle activation)"
              bands={data.config_snapshot_bands}
              tableLabel="Snapshot descriptor bands table"
            />
          )}
          <BandTable
            title="Live Bands (current)"
            bands={data.live_bands}
            tableLabel="Live descriptor bands table"
          />
        </div>
      )}
    </section>
  );
}
