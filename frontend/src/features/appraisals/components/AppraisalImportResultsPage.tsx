/**
 * AppraisalImportResultsPage — Shows results of a bulk appraisal import.
 *
 * Displays failed files with errors. If no failures, shows success.
 * Linked from appraisal_bulk_import.complete notifications.
 *
 * Route: /admin/appraisals/import/:importId/results
 */

import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getAppraisalImportResults, type AppraisalImportResult } from "@/api/appraisals";
import { extractApiError } from "@/utils/extract-api-error";

export function AppraisalImportResultsPage() {
  const { importId } = useParams<{ importId: string }>();
  const [result, setResult] = useState<AppraisalImportResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!importId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    const pollTimerRef: { current: ReturnType<typeof setInterval> | null } = { current: null };

    function stopPolling() {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    }

    async function fetchResults() {
      try {
        const data = await getAppraisalImportResults(importId!);
        if (cancelled) return;
        setResult(data);
        setIsLoading(false);

        // Stop polling once the job is no longer in progress
        if (data.status !== "PENDING" && data.status !== "PROCESSING") {
          stopPolling();
        }
      } catch (err) {
        if (!cancelled) {
          setError(extractApiError(err));
          setIsLoading(false);
          stopPolling();
        }
      }
    }

    // Poll every 3 seconds while job may still be processing
    pollTimerRef.current = setInterval(() => {
      if (!cancelled) void fetchResults();
    }, 3000);

    // Initial fetch
    void fetchResults();

    return () => {
      cancelled = true;
      stopPolling();
    };
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
        <Link to="/appraisals" className="text-sm text-secondary hover:underline mb-4 block">&larr; Back to Appraisals</Link>
        <Alert variant="error"><AlertDescription>{error}</AlertDescription></Alert>
      </div>
    );
  }

  if (!result) return null;

  const isProcessing = result.status === "PENDING" || result.status === "PROCESSING";

  return (
    <div>
      <Link to="/appraisals" className="text-sm text-secondary hover:underline mb-4 block">&larr; Back to Appraisals</Link>

      <h1 className="text-2xl font-semibold text-gray-900 mb-2">Appraisal Bulk Import Results</h1>
      <p className="text-sm text-gray-500 mb-6">
        Target status: <strong>{result.target_status}</strong> &middot;
        {result.status === "COMPLETED" ? " Completed" : result.status === "FAILED" ? " Failed" : ` ${result.status}`}
      </p>

      {isProcessing && (
        <Card className="border-blue-200 bg-blue-50 mb-6">
          <CardContent className="py-8 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-300 border-t-blue-600 mb-3" />
            <p className="text-lg font-medium text-blue-800">
              Import in progress&hellip;
            </p>
            <p className="text-sm text-blue-600 mt-1">
              This page will update automatically when the import completes.
            </p>
          </CardContent>
        </Card>
      )}

      {!isProcessing && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card className="text-center py-4">
            <p className="text-3xl font-bold text-gray-900">{result.total_files}</p>
            <p className="text-sm text-gray-500">Total Files</p>
          </Card>
          <Card className="text-center py-4 border-emerald-200 bg-emerald-50">
            <p className="text-3xl font-bold text-emerald-700">{result.imported_count}</p>
            <p className="text-sm text-emerald-600">Imported</p>
          </Card>
          <Card className="text-center py-4 border-red-200 bg-red-50">
            <p className="text-3xl font-bold text-red-700">{result.failed_count}</p>
            <p className="text-sm text-red-600">Failed</p>
          </Card>
        </div>
      )}

      {isProcessing ? null : result.failed_count === 0 ? (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="py-8 text-center">
            <p className="text-lg font-medium text-emerald-800">
              All {result.imported_count} appraisal{result.imported_count !== 1 ? "s" : ""} imported successfully.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-sm">
          <CardHeader className="bg-gradient-to-r from-red-50 to-white border-b border-red-200 px-6 py-4">
            <CardTitle className="text-lg font-semibold text-red-800">
              Failed Files ({result.failed_count})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase text-gray-500 bg-gray-50 border-b">
                  <th className="px-4 py-2 text-left font-semibold">Filename</th>
                  <th className="px-4 py-2 text-left font-semibold">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {result.failed_files.map((f) => (
                  <tr key={f.filename} className="bg-white hover:bg-red-50">
                    <td className="px-4 py-3 text-gray-900 font-mono text-xs">{f.filename}</td>
                    <td className="px-4 py-3 text-red-700">{f.error}</td>
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
