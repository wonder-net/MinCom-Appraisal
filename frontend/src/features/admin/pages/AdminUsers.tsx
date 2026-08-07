/**
 * AdminUsers — HR Admin user management page.
 *
 * Displays a paginated table of all user accounts with add/edit capabilities.
 * Route: /admin/users (guarded to HR_ADMIN role).
 */

import { useState, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Search } from "lucide-react";
import { useAdminUsers } from "../hooks/useAdminUsers";
import { useDebounce } from "@/hooks/useDebounce";
import { UserTableSkeleton } from "../components/UserTableSkeleton";
import { UserTable } from "../components/UserTable";
import { AddUserDialog } from "../components/AddUserDialog";
import { EditUserDialog } from "../components/EditUserDialog";
import { BulkImportDialog } from "../components/BulkImportDialog";
import { useToast } from "@/hooks/use-toast";
import { ToastContainer } from "@/components/toast-container";
import {
  resendInvitation,
  INVITATION_ALREADY_USED,
} from "@/api/admin-users";
import type { ResendInvitationError } from "@/api/admin-users";
import type { AdminUser } from "@/types";

/** Page size used by the backend for pagination display calculations. */
const PAGE_SIZE = 20;

export function AdminUsers() {
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 300);

  const {
    users, isLoading, isFetching: _isFetching, error, pagination, goToNext, goToPrevious, refetch,
  } = useAdminUsers(debouncedSearch);

  const toast = useToast();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  // Latest bulk-import job id seen in this session. When the dialog is
  // closed mid-flight, this drives the "View import status" link so the
  // user can hop back into the running job. Cleared on terminal status.
  const [lastImportJobId, setLastImportJobId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [resendTarget, setResendTarget] = useState<AdminUser | null>(null);
  const [isResending, setIsResending] = useState(false);

  const handleAddSuccess = useCallback(() => {
    setIsAddOpen(false);
    refetch();
  }, [refetch]);

  const handleEditSuccess = useCallback(() => {
    setSelectedUser(null);
    refetch();
  }, [refetch]);

  const handleResendInvitation = useCallback(
    (user: AdminUser) => {
      setResendTarget(user);
    },
    [],
  );

  const handleConfirmResend = useCallback(async () => {
    if (!resendTarget) return;
    setIsResending(true);
    try {
      await resendInvitation(resendTarget.id);
      toast.success(`Invitation email resent to ${resendTarget.email}`);
    } catch (err: unknown) {
      const typed = err as ResendInvitationError | undefined;
      if (typed?.code === INVITATION_ALREADY_USED) {
        toast.error("This user has already set their own password.");
      } else {
        toast.error("Failed to resend invitation. Please try again.");
      }
    } finally {
      setIsResending(false);
      setResendTarget(null);
    }
  }, [resendTarget, toast]);

  const { showingFrom, showingTo } = useMemo(() => {
    if (users.length === 0) return { showingFrom: 0, showingTo: 0 };
    const prevUrl = pagination.previous;
    let currentPage = 1;
    if (prevUrl) {
      try {
        const url = new URL(prevUrl, window.location.origin);
        const prevPage = parseInt(url.searchParams.get("page") ?? "1", 10);
        currentPage = prevPage + 1;
      } catch {
        currentPage = 1;
      }
    }
    const from = (currentPage - 1) * PAGE_SIZE + 1;
    const to = Math.min(from + users.length - 1, pagination.count);
    return { showingFrom: from, showingTo: to };
  }, [users.length, pagination]);

  return (
    <div aria-label="User management">
      <a href="#user-table" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded focus:shadow text-sm">
        Skip to user table
      </a>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">User Management</h1>
          <p className="text-sm text-gray-500 mt-1">Manage employee accounts, roles, and access.</p>
        </div>
        <div className="flex items-center gap-2">
          {lastImportJobId && (
            <button
              type="button"
              className="text-sm text-secondary hover:underline"
              onClick={() => setIsBulkImportOpen(true)}
            >
              View import status
            </button>
          )}
          <button type="button" className="h-9 px-4 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors" onClick={() => setIsBulkImportOpen(true)}>Bulk Import</button>
          <button type="button" className="h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors" onClick={() => setIsAddOpen(true)}>+ Add User</button>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-6 py-4" role="alert">
          <p className="text-sm text-red-800">{error}</p>
          <button type="button" className="mt-3 h-9 px-4 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition-colors" onClick={refetch}>Retry</button>
        </div>
      )}

      <div className="mb-6 flex items-center gap-3 flex-wrap">
        <div className="relative max-w-sm w-full">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder="Search by email or PF number..."
            className="h-10 pl-9 border-gray-300 focus-visible:ring-2 focus-visible:ring-secondary w-full"
            aria-label="Search users"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
      </div>

      <Card id="user-table" className="bg-white rounded-lg border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-primary-light to-white">
          <h2 className="text-lg font-semibold text-gray-900">All Users</h2>
          {!isLoading && pagination.count > 0 && (
            <p className="text-sm text-gray-600 mt-0.5">Showing {showingFrom}&ndash;{showingTo} of {pagination.count}</p>
          )}
        </div>
        <CardContent className="p-0">
          {isLoading ? (
            <UserTableSkeleton />
          ) : users.length === 0 ? (
            debouncedSearch ? (
              <div className="flex flex-col items-center justify-center min-h-[200px] gap-2 text-center py-12">
                <p className="text-base font-medium text-gray-600">
                  No users found matching &ldquo;{debouncedSearch}&rdquo;
                </p>
                <p className="text-sm text-gray-400">Try a different search term.</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[200px] gap-2 text-center py-12">
                <p className="text-base font-medium text-gray-600">No users found</p>
                <p className="text-sm text-gray-400">Add the first user account to get started.</p>
                <button type="button" className="mt-4 h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors" onClick={() => setIsAddOpen(true)}>+ Add User</button>
              </div>
            )
          ) : (
            <UserTable users={users} onSelectUser={setSelectedUser} onResendInvitation={handleResendInvitation} />
          )}

          {!isLoading && users.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50 flex-wrap gap-2">
              <span className="text-sm text-gray-600">Showing {showingFrom}&ndash;{showingTo} of {pagination.count} users</span>
              <div className="flex gap-2">
                <button type="button" className="h-8 px-3 rounded border border-gray-300 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed" disabled={!pagination.previous} onClick={goToPrevious} aria-label="Previous page" aria-disabled={!pagination.previous}>Previous</button>
                <button type="button" className="h-8 px-3 rounded border border-gray-300 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed" disabled={!pagination.next} onClick={goToNext} aria-label="Next page" aria-disabled={!pagination.next}>Next</button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AddUserDialog isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} onSuccess={handleAddSuccess} />
      <EditUserDialog
        user={selectedUser}
        onClose={() => setSelectedUser(null)}
        onSuccess={handleEditSuccess}
        onUserChanged={refetch}
      />
      <BulkImportDialog
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        onSuccess={() => {
          // Job reached SUCCEEDED / PARTIAL_SUCCESS — clear the resume
          // pointer and refresh the user list. Leave the dialog open so
          // the admin can see the outcome.
          setLastImportJobId(null);
          refetch();
        }}
        resumeJobId={lastImportJobId}
        onJobIdChange={setLastImportJobId}
      />
      <ConfirmDialog
        open={resendTarget !== null}
        title="Resend Invitation"
        description={`Resend invitation email to ${resendTarget?.email ?? ""}?`}
        confirmLabel="Resend"
        variant="default"
        isLoading={isResending}
        onConfirm={() => void handleConfirmResend()}
        onCancel={() => setResendTarget(null)}
      />
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
    </div>
  );
}
