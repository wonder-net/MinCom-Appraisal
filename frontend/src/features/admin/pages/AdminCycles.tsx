/**
 * AdminCycles — HR Admin cycle management page.
 *
 * Displays a table of appraisal cycles with create, edit, activate,
 * and close capabilities. Route: /admin/cycles (HR_ADMIN only).
 */

import { useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useCycles } from "../hooks/useCycles";
import { useToast } from "@/hooks/use-toast";
import { ToastContainer } from "@/components/toast-container";
import { CyclesTableSkeleton } from "../components/CyclesTableSkeleton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { NewCycleDialog } from "../components/NewCycleDialog";
import { EditCycleDialog } from "../components/EditCycleDialog";
import {
  CycleConfirmDialog,
  type ConfirmAction,
} from "../components/CycleConfirmDialog";
import { formatShortDate } from "@/utils/format-date";
import type { AppraisalCycle } from "@/types";

export function AdminCycles() {
  const { cycles, isLoading, error, refetch } = useCycles();
  const toast = useToast();

  const [isNewOpen, setIsNewOpen] = useState(false);
  const [editCycle, setEditCycle] = useState<AppraisalCycle | null>(null);
  const [confirmState, setConfirmState] = useState<{
    action: ConfirmAction;
    cycle: AppraisalCycle;
  } | null>(null);

  const handleNewSuccess = useCallback(() => {
    setIsNewOpen(false);
    toast.success("Cycle created successfully.");
    refetch();
  }, [refetch, toast]);

  const handleEditSuccess = useCallback(() => {
    setEditCycle(null);
    toast.success("Cycle updated successfully.");
    refetch();
  }, [refetch, toast]);

  const handleConfirmSuccess = useCallback(
    (message: string) => {
      setConfirmState(null);
      toast.success(message);
      refetch();
    },
    [refetch, toast],
  );

  const handleConfirmError = useCallback(
    (message: string) => {
      setConfirmState(null);
      toast.error(message);
    },
    [toast],
  );

  return (
    <div aria-label="Cycle management">
      <a
        href="#cycles-table"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded focus:shadow text-sm"
      >
        Skip to cycles table
      </a>

      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />

      {/* Page header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Cycle Management
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Create and manage appraisal cycles for the organisation.
          </p>
        </div>
        <button
          type="button"
          className="h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors"
          onClick={() => setIsNewOpen(true)}
        >
          + New Cycle
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div
          className="mb-6 rounded-md border border-red-200 bg-red-50 px-6 py-4"
          role="alert"
        >
          <p className="text-sm text-red-800">
            Failed to load cycles. Please try again.
          </p>
          <button
            type="button"
            className="mt-3 h-9 px-4 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            onClick={refetch}
          >
            Retry
          </button>
        </div>
      )}

      {/* Cycles table card */}
      <Card id="cycles-table" className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-primary-light to-white">
          <h2 className="text-lg font-semibold text-gray-900">All Cycles</h2>
        </div>
        <CardContent className="p-0">
          {isLoading ? (
            <CyclesTableSkeleton />
          ) : cycles.length === 0 && !error ? (
            <div className="flex flex-col items-center justify-center min-h-[200px] gap-2 text-center py-16">
              <p className="text-base font-medium text-gray-600">
                No cycles found
              </p>
              <p className="text-sm text-gray-400 mt-1">
                Create the first appraisal cycle to get started.
              </p>
              <button
                type="button"
                className="mt-4 h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors"
                onClick={() => setIsNewOpen(true)}
              >
                + New Cycle
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table
                className="w-full text-sm"
                aria-label="Appraisal cycles"
              >
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-2 text-left font-semibold">Period Name</th>
                    <th className="px-4 py-2 text-left font-semibold">Start</th>
                    <th className="px-4 py-2 text-left font-semibold">End</th>
                    <th className="px-4 py-2 text-left font-semibold">Self Rating</th>
                    <th className="px-4 py-2 text-left font-semibold">Status</th>
                    <th className="px-4 py-2 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cycles.map((cycle, i) => (
                    <tr
                      key={cycle.id}
                      className={`${i % 2 === 1 ? "bg-gray-50" : "bg-white"} hover:bg-blue-50 transition-colors`}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {cycle.period_name}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {formatShortDate(cycle.start_date)}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {formatShortDate(cycle.end_date)}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {cycle.self_rating_enabled ? "Enabled" : "Disabled"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={cycle.status} />
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          type="button"
                          className="text-sm text-secondary hover:text-primary font-medium"
                          onClick={() => setEditCycle(cycle)}
                          aria-label={`${cycle.status === "DRAFT" ? "Edit" : "View"} ${cycle.period_name}`}
                        >
                          {cycle.status === "DRAFT" ? "Edit" : "View"}
                        </button>
                        {cycle.status === "DRAFT" && (
                          <button
                            type="button"
                            className="text-sm text-green-700 hover:text-green-800 font-medium"
                            onClick={() =>
                              setConfirmState({
                                action: "activate",
                                cycle,
                              })
                            }
                            aria-label={`Activate ${cycle.period_name}`}
                          >
                            Activate
                          </button>
                        )}
                        {cycle.status === "ACTIVE" && (
                          <>
                            <button
                              type="button"
                              className="text-sm text-red-700 hover:text-red-800 font-medium"
                              onClick={() =>
                                setConfirmState({
                                  action: "close",
                                  cycle,
                                })
                              }
                              aria-label={`Close ${cycle.period_name}`}
                            >
                              Close
                            </button>
                            <button
                              type="button"
                              className="text-sm text-green-700 hover:text-green-800 font-medium"
                              onClick={() =>
                                setConfirmState({
                                  action: "finalise-all",
                                  cycle,
                                })
                              }
                              aria-label={`Finalise all signed off in ${cycle.period_name}`}
                            >
                              Finalise All
                            </button>
                          </>
                        )}
                        {cycle.status === "CLOSED" && (
                          <button
                            type="button"
                            className="text-sm text-secondary hover:text-primary font-medium"
                            onClick={() =>
                              setConfirmState({
                                action: "archive",
                                cycle,
                              })
                            }
                            aria-label={`Archive ${cycle.period_name}`}
                          >
                            Archive
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <NewCycleDialog
        isOpen={isNewOpen}
        onClose={() => setIsNewOpen(false)}
        onSuccess={handleNewSuccess}
      />
      <EditCycleDialog
        cycle={editCycle}
        onClose={() => setEditCycle(null)}
        onSuccess={handleEditSuccess}
      />
      <CycleConfirmDialog
        action={confirmState?.action ?? null}
        cycle={confirmState?.cycle ?? null}
        onClose={() => setConfirmState(null)}
        onSuccess={handleConfirmSuccess}
        onError={handleConfirmError}
      />
    </div>
  );
}
