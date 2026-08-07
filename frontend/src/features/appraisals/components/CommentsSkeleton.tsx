/**
 * CommentsSkeleton — Loading skeleton for the CommentsSection.
 */

import { Card, CardHeader, CardContent } from "@/components/ui/card";

export function CommentsSkeleton() {
  return (
    <Card className="shadow-sm" aria-busy="true" aria-label="Loading comments">
      <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200">
        <div className="h-5 w-32 bg-gray-200 rounded animate-pulse" />
      </CardHeader>
      <CardContent className="px-6 py-4 space-y-4">
        {[1, 2].map((n) => (
          <div
            key={n}
            className="space-y-2 py-4 border-b border-gray-200"
          >
            <div className="flex items-center gap-2">
              <div className="h-4 w-28 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-16 bg-gray-200 rounded-full animate-pulse" />
            </div>
            <div className="h-3 w-full bg-gray-200 rounded animate-pulse" />
            <div className="h-3 w-3/4 bg-gray-200 rounded animate-pulse" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
