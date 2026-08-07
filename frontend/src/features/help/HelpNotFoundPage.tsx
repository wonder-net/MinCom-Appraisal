/**
 * HelpNotFoundPage — Shown when a `/help/:section/:slug` route does not
 * resolve to a known page. Provides a path back to the Help Center index.
 */

import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";

export function HelpNotFoundPage() {
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Help", href: "/help" }, { label: "Not Found" }]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs]);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-md border border-gray-200 bg-white p-8 text-center">
        <h1 className="text-xl font-semibold text-gray-900">
          Help article not found
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          The page you were looking for does not exist or has been moved.
        </p>
        <Link
          to="/help"
          className="mt-6 inline-flex items-center rounded-md bg-secondary px-4 py-2 text-sm font-medium text-white hover:bg-secondary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
        >
          Back to Help Center
        </Link>
      </div>
    </div>
  );
}
