/**
 * SignoffSection — Displays signature records and ACCEPT/REJECT
 * buttons for eligible users during PENDING_SIGNOFF status.
 */

import { useState, useMemo, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/auth/useAuth";
import { submitSignature } from "@/api/signatures";
import { extractApiError } from "@/utils/extract-api-error";
import { ActionBadge } from "./ActionBadge";
import { RejectDialog } from "./RejectDialog";
import type { AppraisalStatus, Signature } from "@/types";

type UserRelation = "APPRAISER" | "APPRAISEE" | "HR_ADMIN" | "NONE";

const SIGNER_ROLE_LABELS: Record<string, string> = {
  APPRAISER: "Appraisor",
  APPRAISEE: "Appraisee",
};

interface SignoffSectionProps {
  appraisalId: string;
  status: AppraisalStatus;
  userRelation: UserRelation;
  signatures: Signature[];
  onRefresh: () => void;
}

export function SignoffSection({
  appraisalId,
  status,
  userRelation,
  signatures,
  onRefresh,
}: SignoffSectionProps) {
  const { user } = useAuth();
  const [isAccepting, setIsAccepting] = useState(false);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const alreadySigned = useMemo(
    () => signatures.some((sig) => sig.signer_id === user?.id),
    [signatures, user],
  );

  const showButtons =
    status === "PENDING_SIGNOFF" &&
    (userRelation === "APPRAISER" || userRelation === "APPRAISEE") &&
    !alreadySigned;

  const handleAccept = useCallback(async () => {
    setActionError(null);
    setIsAccepting(true);
    try {
      await submitSignature(appraisalId, "ACCEPT");
      onRefresh();
    } catch (err: unknown) {
      setActionError(extractApiError(err));
    } finally {
      setIsAccepting(false);
    }
  }, [appraisalId, onRefresh]);

  const handleRejectSubmit = useCallback(
    async (reason: string) => {
      setActionError(null);
      await submitSignature(appraisalId, "REJECT", reason);
      onRefresh();
    },
    [appraisalId, onRefresh],
  );

  const handleOpenReject = useCallback(() => {
    setActionError(null);
    setIsRejectOpen(true);
  }, []);

  const handleCloseReject = useCallback(() => {
    setIsRejectOpen(false);
  }, []);

  return (
    <Card className="shadow-sm" aria-label="Appraisal sign-off">
      <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900">
            Sign-off
          </CardTitle>
          {status === "SIGNED_OFF" && (
            <Badge className="bg-green-50 text-green-700 border-green-300">
              Signed Off
            </Badge>
          )}
          {status === "PENDING_SIGNOFF" && (
            <Badge className="bg-amber-50 text-amber-700 border-amber-200">
              Pending Signatures
            </Badge>
          )}
        </div>
        <p className="text-sm text-gray-500 mt-0.5">
          Both the appraiser and appraisee must sign off to finalise this
          appraisal.
        </p>
      </CardHeader>

      <CardContent className="px-6 py-4">
        {signatures.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">
            No signatures recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Signature records">
              <thead>
                <tr className="border-b border-gray-200">
                  <th scope="col" className="text-left font-medium text-gray-500 pb-2 pr-4">
                    Signer
                  </th>
                  <th scope="col" className="text-left font-medium text-gray-500 pb-2 pr-4">
                    Role
                  </th>
                  <th scope="col" className="text-left font-medium text-gray-500 pb-2 pr-4">
                    Action
                  </th>
                  <th scope="col" className="text-left font-medium text-gray-500 pb-2">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {signatures.map((sig) => (
                  <tr
                    key={sig.id}
                    className="border-b border-gray-200 last:border-0"
                  >
                    <td className="py-3 pr-4 font-medium text-gray-900">
                      {sig.signer_name}
                    </td>
                    <td className="py-3 pr-4 text-gray-500">
                      {SIGNER_ROLE_LABELS[sig.signer_role] ?? sig.signer_role}
                    </td>
                    <td className="py-3 pr-4">
                      <ActionBadge action={sig.action} />
                      {sig.action === "REJECT" && sig.reason && (
                        <p className="text-xs text-gray-500 mt-1 max-w-xs">
                          Reason: {sig.reason}
                        </p>
                      )}
                    </td>
                    <td className="py-3 text-gray-500 text-xs">
                      {sig.signed_at}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {status === "PENDING_SIGNOFF" && (
          <div className="mt-3 flex items-center gap-2 text-sm text-gray-500">
            <span
              className="inline-block w-2 h-2 rounded-full bg-amber-400"
              aria-hidden="true"
            />
            Awaiting remaining signature(s)...
          </div>
        )}
      </CardContent>

      {showButtons && (
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <p className="text-sm text-gray-500 mb-3">
            Sign this appraisal to record your acknowledgement.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              type="button"
              disabled={isAccepting}
              aria-label="Accept appraisal sign-off"
              className="bg-accent text-white hover:bg-emerald-800"
              onClick={() => void handleAccept()}
            >
              {isAccepting ? "Processing..." : "Accept"}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isAccepting}
              aria-label="Reject appraisal sign-off"
              className="bg-red-700 hover:bg-red-800"
              onClick={handleOpenReject}
            >
              Reject
            </Button>
          </div>
          {actionError && (
            <p role="alert" className="text-sm text-red-700 mt-2">
              {actionError}
            </p>
          )}
        </div>
      )}

      <RejectDialog
        isOpen={isRejectOpen}
        onClose={handleCloseReject}
        onSubmit={handleRejectSubmit}
      />
    </Card>
  );
}
