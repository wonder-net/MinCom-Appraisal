/**
 * BulkImportResultsPage — Shows results of a completed bulk import job.
 *
 * Displays failed rows with error reasons. If no failures, shows a
 * success message. Linked from bulk_import.complete notifications.
 *
 * Route: /admin/users/import/:importId/results
 */

import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getBulkImportResults, type BulkImportResult } from "@/api/admin-users";
import { extractApiError } from "@/utils/extract-api-error";

export function BulkImportResultsPage() {
  const { importId } = useParams<{ importId: string }>();
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!importId) return;
    let cancelled = false;

    async function fetchResults() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await getBulkImportResults(importId!);
        if (!cancelled) setResult(data);
      } catch (err) {
        if (!cancelled) setError(extractApiError(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void fetchResults();
    return () => { cancelled = true; };
  }, [importId]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-gray-200 animate-pulse rounded" />
        <div className="h-40 bg-gray-100 animate-pulse rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Link to="/admin/users" className="text-sm text-secondary hover:underline mb-4 block">
          &larr; Back to User Management
        </Link>
        <Alert variant="error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!result) return null;

  const hasFailed = result.failed_count > 0;

  return (
    <div>
      <Link to="/admin/users" className="text-sm text-secondary hover:underline mb-4 block">
        &larr; Back to User Management
      </Link>

      <h1 className="text-2xl font-semibold text-gray-900 mb-2">Bulk Import Results</h1>
      <p className="text-sm text-gray-500 mb-6">
        {result.status === "COMPLETED" ? "Import completed" : result.status === "FAILED" ? "Import failed" : "Import " + result.status.toLowerCase()}
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="text-center py-4">
          <p className="text-3xl font-bold text-gray-900">{result.total_rows}</p>
          <p className="text-sm text-gray-500">Total Rows</p>
        </Card>
        <Card className="text-center py-4 border-emerald-200 bg-emerald-50">
          <p className="text-3xl font-bold text-emerald-700">{result.created_count}</p>
          <p className="text-sm text-emerald-600">Created</p>
        </Card>
        <Card className="text-center py-4 border-red-200 bg-red-50">
          <p className="text-3xl font-bold text-red-700">{result.failed_count}</p>
          <p className="text-sm text-red-600">Failed</p>
        </Card>
      </div>

      {/* Success or failure detail */}
      {!hasFailed ? (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="py-8 text-center">
            <p className="text-lg font-medium text-emerald-800">
              All {result.created_count} employee{result.created_count !== 1 ? "s" : ""} imported successfully.
            </p>
            <p className="text-sm text-emerald-600 mt-2">
              Welcome emails have been sent to all new accounts.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-sm">
          <CardHeader className="bg-gradient-to-r from-red-50 to-white border-b border-red-200 px-6 py-4">
            <CardTitle className="text-lg font-semibold text-red-800">
              Failed Rows ({result.failed_count})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-gray-500 bg-gray-50 border-b">
                  <th scope="col" className="px-4 py-2 text-left font-semibold w-20">Row</th>
                  <th scope="col" className="px-4 py-2 text-left font-semibold">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {result.failed_rows.map((row) => (
                  <tr key={row.row_number} className="bg-white hover:bg-red-50">
                    <td className="px-4 py-3 text-gray-600 font-mono">{row.row_number}</td>
                    <td className="px-4 py-3 text-red-700">{row.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
