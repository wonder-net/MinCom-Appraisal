/**
 * GrowthPlanSkeleton — Loading placeholder for the growth plan form.
 */

import { Card, CardHeader, CardContent } from "@/components/ui/card";

export function GrowthPlanSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading growth plan">
      {[1, 2, 3].map((n) => (
        <Card key={n} className="shadow-sm">
          <CardHeader className="border-b border-gray-200">
            <div className="h-5 w-40 bg-gray-200 rounded animate-pulse" />
          </CardHeader>
          <CardContent className="px-6 py-6 space-y-3">
            <div className="h-20 w-full bg-gray-200 rounded animate-pulse" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
