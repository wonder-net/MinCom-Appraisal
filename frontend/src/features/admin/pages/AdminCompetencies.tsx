/**
 * AdminCompetencies — HR Admin competency management page.
 * Route: /admin/competencies (guarded to HR_ADMIN role).
 */

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { listAdminCompetencies, patchCompetency } from "@/api/competencies";
import type { Competency, CompetencyCategory } from "@/api/competencies";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AddCompetencyDialog } from "../components/AddCompetencyDialog";
import { DeactivateCompetencyAlert } from "../components/DeactivateCompetencyAlert";
import { EditCompetencyDialog } from "../components/EditCompetencyDialog";
import { extractApiError } from "@/utils/extract-api-error";
import { useToast } from "@/hooks/use-toast";
import { ToastContainer } from "@/components/toast-container";

const CATEGORY_LABELS: Record<CompetencyCategory, string> = {
  ALL: "All Staff",
  MANAGERIAL: "Managerial",
  NON_MANAGERIAL: "Non-Managerial",
};

const formatCategory = (category: CompetencyCategory): string =>
  CATEGORY_LABELS[category] ?? category;

function TableSkeleton() {
  return (
    <div className="animate-pulse p-6 space-y-3" aria-busy="true" aria-label="Loading competencies">
      {Array.from({ length: 5 }, (_, i) => <div key={i} className="h-10 rounded bg-gray-200" />)}
    </div>
  );
}

export function AdminCompetencies() {
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<Competency | null>(null);
  const [editTarget, setEditTarget] = useState<Competency | null>(null);
  const [isToggling, setIsToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const toast = useToast();

  const fetchCompetencies = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try { setCompetencies(await listAdminCompetencies()); }
    catch (err: unknown) { setError(extractApiError(err)); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { void fetchCompetencies(); }, [fetchCompetencies]);

  const handleAddSuccess = useCallback(() => {
    setIsAddOpen(false);
    void fetchCompetencies();
  }, [fetchCompetencies]);

  const handleDeactivateConfirm = useCallback(async () => {
    if (!deactivateTarget) return;
    setIsToggling(true);
    setToggleError(null);
    try {
      await patchCompetency(deactivateTarget.id, { is_active: false });
      setDeactivateTarget(null);
      void fetchCompetencies();
    } catch (err: unknown) {
      setToggleError(extractApiError(err));
    } finally {
      setIsToggling(false);
    }
  }, [deactivateTarget, fetchCompetencies]);

  const handleReactivate = useCallback(async (competency: Competency) => {
    setIsToggling(true);
    setToggleError(null);
    try {
      await patchCompetency(competency.id, { is_active: true });
      void fetchCompetencies();
    } catch (err: unknown) {
      setToggleError(extractApiError(err));
    } finally {
      setIsToggling(false);
    }
  }, [fetchCompetencies]);

  if (error && !isLoading && competencies.length === 0) {
    return (
      <div aria-label="Competency administration">
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-6 py-4" role="alert">
          <p className="text-sm text-red-800">Failed to load competencies. Please try again.</p>
          <button type="button" className="mt-3 h-9 px-4 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition-colors" onClick={() => void fetchCompetencies()}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div aria-label="Competency administration">
      <a href="#competencies-table" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded focus:shadow text-sm">
        Skip to competencies table
      </a>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Competencies</h1>
          <p className="text-sm text-gray-500 mt-1">Define the competencies evaluated in employee appraisals.</p>
        </div>
        <button type="button" className="h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors" onClick={() => setIsAddOpen(true)}>+ Add Competency</button>
      </div>

      {toggleError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-6 py-3" role="alert">
          <p className="text-sm text-red-800">{toggleError}</p>
        </div>
      )}

      <Card id="competencies-table" className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-primary-light to-white">
          <h2 className="text-lg font-semibold text-gray-900">All Competencies</h2>
        </div>
        <CardContent className="p-0">
          {isLoading ? <TableSkeleton /> : competencies.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[200px] gap-2 text-center py-16">
              <p className="text-base font-medium text-gray-600">No competencies defined</p>
              <p className="text-sm text-gray-400 mt-1">Add the first competency to get started.</p>
              <button type="button" className="mt-4 h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors" onClick={() => setIsAddOpen(true)}>+ Add Competency</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Competencies list">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-2 text-left font-semibold">Name</th>
                    <th className="px-4 py-2 text-left font-semibold">Category</th>
                    <th className="px-4 py-2 text-left font-semibold">Status</th>
                    <th className="px-4 py-2 text-left font-semibold">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {competencies.map((c, i) => (
                    <tr key={c.id} className={`${i % 2 === 1 ? "bg-gray-50" : "bg-white"} hover:bg-blue-50 transition-colors`}>
                      <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                      <td className="px-4 py-3 text-gray-600">{formatCategory(c.applicable_to)}</td>
                      <td className="px-4 py-3"><StatusBadge status={c.is_active ? "Active" : "Inactive"} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="h-9 px-4 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                            onClick={() => setEditTarget(c)}
                            aria-label={`Edit ${c.name}`}
                          >
                            Edit
                          </button>
                          {c.is_active ? (
                            <button
                              type="button"
                              className="h-9 px-4 rounded-md border border-red-300 text-sm text-red-700 hover:bg-red-50 transition-colors"
                              disabled={isToggling}
                              onClick={() => setDeactivateTarget(c)}
                              aria-label={`Deactivate ${c.name}`}
                            >
                              Deactivate
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="h-9 px-4 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                              disabled={isToggling}
                              onClick={() => void handleReactivate(c)}
                              aria-label={`Reactivate ${c.name}`}
                            >
                              Reactivate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AddCompetencyDialog isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} onSuccess={handleAddSuccess} />

      <DeactivateCompetencyAlert open={deactivateTarget !== null} competencyName={deactivateTarget?.name ?? ""}
        isSubmitting={isToggling} onConfirm={() => void handleDeactivateConfirm()} onCancel={() => setDeactivateTarget(null)} />

      {editTarget !== null && (
        <EditCompetencyDialog
          open
          competency={editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={() => {
            setEditTarget(null);
            toast.success("Competency updated.");
            void fetchCompetencies();
          }}
        />
      )}

      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
    </div>
  );
}
