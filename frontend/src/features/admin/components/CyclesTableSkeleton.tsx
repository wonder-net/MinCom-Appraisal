/**
 * CyclesTableSkeleton — Loading placeholder for the cycles table.
 *
 * Renders 4 shimmer rows to indicate data is being fetched.
 */

export function CyclesTableSkeleton() {
  return (
    <div
      className="animate-pulse p-6 space-y-3"
      aria-busy="true"
      aria-label="Loading cycles"
      role="status"
    >
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-10 rounded bg-gray-200" />
      ))}
      <span className="sr-only">Loading cycles...</span>
    </div>
  );
}
