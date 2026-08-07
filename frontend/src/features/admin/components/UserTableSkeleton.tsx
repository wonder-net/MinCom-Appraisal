/**
 * UserTableSkeleton — Loading placeholder for the admin user table.
 *
 * Renders a card with 5 skeleton rows while the user list is loading.
 */

import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function UserTableSkeleton() {
  return (
    <Card className="shadow-sm" aria-busy="true">
      <CardHeader className="border-b border-gray-200 px-6 py-4">
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent className="p-0">
        {[1, 2, 3, 4, 5].map((n) => (
          <div
            key={n}
            className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 last:border-0"
          >
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-48 flex-1" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
