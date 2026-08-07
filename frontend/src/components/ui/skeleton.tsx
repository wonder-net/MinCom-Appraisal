/**
 * Skeleton — Placeholder loading indicator component.
 *
 * Based on shadcn/ui Skeleton pattern with MINCOM design tokens.
 */

import { cn } from "@/utils/cn";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-gray-200", className)}
      {...props}
    />
  );
}

export { Skeleton };
export type { SkeletonProps };
