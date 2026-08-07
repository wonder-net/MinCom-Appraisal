/**
 * DetailSkeleton — Loading skeleton for the appraisal detail page.
 */

export function DetailSkeleton() {
  return (
    <main
      className="min-h-screen bg-gray-50 px-6 md:px-12 py-8"
      aria-busy="true"
    >
      <div className="h-4 w-64 bg-gray-200 animate-pulse rounded mb-6" />
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            className="h-24 bg-gray-200 animate-pulse rounded"
          />
        ))}
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-3">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="h-10 bg-gray-200 animate-pulse rounded"
          />
        ))}
      </div>
    </main>
  );
}
