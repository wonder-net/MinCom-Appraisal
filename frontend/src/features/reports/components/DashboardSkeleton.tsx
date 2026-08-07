/**
 * DashboardSkeleton — loading placeholder for the reports dashboard.
 * Shows three stat card skeletons and a five-row table skeleton.
 */

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div
      className="space-y-8"
      aria-busy="true"
      aria-label="Loading dashboard data"
    >
      {/* Stat cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((n) => (
          <Card key={n} className="shadow-sm">
            <CardContent className="px-6 py-5 space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-9 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
      {/* Table skeleton */}
      <Card className="shadow-sm">
        <CardHeader className="border-b border-gray-200">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="px-6 py-4 space-y-3">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="flex gap-4">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
