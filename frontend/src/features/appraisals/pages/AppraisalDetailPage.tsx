/**
 * AppraisalDetailPage — Full appraisal record with header card,
 * workflow stepper, score summary, and tabbed content.
 *
 * Route: /appraisals/:id
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAppraisalDetail } from "../hooks/useAppraisalDetail";
import { AppraisalDetailHeader } from "../components/AppraisalDetailHeader";
import { DetailSkeleton } from "../components/DetailSkeleton";
import { KdSection } from "../components/KdSection";
import { CompetenciesTab } from "../components/CompetenciesTab";
import { CommentsSection } from "../components/CommentsSection";
import { GrowthPlanForm } from "../components/GrowthPlanForm";
import { SignoffSection } from "../components/SignoffSection";
import { EscalateExecutiveDialog } from "../components/EscalateExecutiveDialog";
import { EscalationBanner } from "../components/EscalationBanner";
import { listExecutiveUsers } from "@/api/admin-users";
import { useAuth } from "@/auth/useAuth";
import { isAdminUser } from "@/auth/role-helpers";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useToast } from "@/hooks/use-toast";
import { ToastContainer } from "@/components/toast-container";
import { extractDetail, extractCorrelationId } from "@/utils/extract-correlation-id";
import {
  transitionAppraisal,
  createDeliverable,
  updateDeliverable,
  deleteDeliverable,
  updateCompetencyRating,
  updateSubCompetencyRating,
  addSubCompetency,
  downloadAppraisalPDF,
} from "@/api/appraisals";
import { submitSignature } from "@/api/signatures";
import type { Appraisal, AppraisalStatus, BscPerspective, CreateKeyDeliverableRequest, UpdateKeyDeliverableRequest } from "@/types";

import { resolveUserRelation, type UserRelation } from "../utils/resolveUserRelation";

type TabId = "kd" | "competencies" | "comments" | "growth-plan" | "sign-off";
type RatingField = "self_rating" | "manager_rating";

const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: "kd", label: "Key Performance Indicators" },
  { id: "competencies", label: "Competencies" },
  { id: "comments", label: "Comments" },
  { id: "growth-plan", label: "Growth Plan" },
  { id: "sign-off", label: "Sign-off" },
];

const EDITABLE_KD_STATUSES: ReadonlySet<AppraisalStatus> = new Set(["SELF_ASSESSMENT"]);
const MGR_RATE_STATUSES: ReadonlySet<AppraisalStatus> = new Set(["MANAGER_REVIEW", "DISCUSSION", "DISPUTED"]);
const PDF_EXPORTABLE_STATUSES: ReadonlySet<AppraisalStatus> = new Set(["SIGNED_OFF", "FINALISED"]);
const SELF_RATE_STATUSES: ReadonlySet<AppraisalStatus> = new Set(["SELF_ASSESSMENT"]);

function buildErrorMessage(err: unknown): string {
  const detail = extractDetail(err);
  const cid = extractCorrelationId(err);
  return cid ? `${detail}. Correlation: ${cid}` : detail;
}

export function AppraisalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toasts, error: toastError, dismiss } = useToast();
  const {
    appraisal,
    deliverables,
    competencies,
    isLoading,
    error,
    refetch,
    setDeliverables,
    setAppraisal,
  } = useAppraisalDetail(id);
  const [activeTab, setActiveTab] = useState<TabId>("kd");
  const [escalateMode, setEscalateMode] = useState<"escalate" | "reassign" | null>(null);
  const [escalatedExecutiveName, setEscalatedExecutiveName] = useState<string | null>(null);

  const userRelation: UserRelation = useMemo(
    () => resolveUserRelation(user, appraisal),
    [user, appraisal],
  );

  const selfRatingEnabled = appraisal?.self_rating_enabled ?? true;
  const canEditKd = useMemo(() => {
    if (!appraisal) return false;
    // Appraisee can edit in SELF_ASSESSMENT
    if (EDITABLE_KD_STATUSES.has(appraisal.status) && userRelation === "APPRAISEE") return true;
    // Manager can edit in MANAGER_REVIEW when self-rating is off
    if (appraisal.status === "MANAGER_REVIEW" && userRelation === "APPRAISER" && !selfRatingEnabled) return true;
    return false;
  }, [appraisal, userRelation, selfRatingEnabled]);
  const canMgrRate = useMemo(
    () => appraisal !== null && MGR_RATE_STATUSES.has(appraisal.status) && userRelation === "APPRAISER",
    [appraisal, userRelation],
  );
  const canSelfRate = useMemo(
    () =>
      selfRatingEnabled &&
      userRelation === "APPRAISEE" &&
      appraisal !== null &&
      SELF_RATE_STATUSES.has(appraisal.status),
    [selfRatingEnabled, userRelation, appraisal],
  );

  // Admin-tier gate: HR_ADMIN and SYSTEM_ADMIN share the same platform-admin
  // privileges (TASK-303). The variable name is kept for backwards-compat
  // with downstream prop names but the predicate covers both roles.
  const isHRAdmin = useMemo(() => isAdminUser(user), [user]);

  const isExecutive = useMemo(
    () => user?.roles.includes("EXECUTIVE") ?? false,
    [user],
  );

  // Escalation visibility — derived from appraisal + user. AC-13, AC-14.
  const escalatedExecutiveId = appraisal?.escalated_executive ?? null;
  const isEscalated = escalatedExecutiveId !== null;
  // TODO(backend): Replace this with a server-supplied `is_original_manager`
  // boolean on AppraisalDetailSerializer to avoid relying on the FK shape
  // (`appraiser_id` is the manager's Employee UUID — keep in sync with the
  // serializer's `get_appraiser_id`). Until then the comparison below is the
  // only authoritative signal; the backend still enforces write blocks.
  const isOriginalManager = useMemo(
    () =>
      user !== null &&
      appraisal !== null &&
      appraisal.appraiser_id !== null &&
      user.employee_id !== null &&
      user.employee_id === appraisal.appraiser_id,
    [user, appraisal],
  );
  const showEscalationBanner =
    isEscalated &&
    isOriginalManager &&
    user !== null &&
    escalatedExecutiveId !== user.id;

  const SIGNED_OFF_STATUSES: ReadonlySet<AppraisalStatus> = useMemo(
    () => new Set<AppraisalStatus>(["SIGNED_OFF", "FINALISED"]),
    [],
  );
  const canShowEscalateButton =
    isHRAdmin &&
    appraisal !== null &&
    appraisal.status === "DISPUTED" &&
    !isEscalated;
  const canShowReassignButton =
    isHRAdmin &&
    appraisal !== null &&
    isEscalated &&
    !SIGNED_OFF_STATUSES.has(appraisal.status);

  // Look up the escalated executive's display name. The /admin/users/ list
  // endpoint is HR-Admin-scoped, so the side-fetch is gated to the two
  // callers that actually need the name:
  //   1. The original manager (to render `EscalationBanner`)
  //   2. HR Admin viewing the re-assign button (dialog needs `currentExecutive`)
  //
  // For everyone else (EXECUTIVE, HR_OFFICER, EMPLOYEE, etc.) we skip the
  // call entirely — they don't render anything that depends on the name.
  //
  // TODO(backend): consume an `escalated_executive_name` field on
  // AppraisalDetailSerializer once shipped — that eliminates this side-fetch
  // and the off-page pagination edge-case (where the assigned executive
  // wouldn't be on the first page of /admin/users/).
  const needsExecutiveName =
    isEscalated && (showEscalationBanner || canShowReassignButton);
  useEffect(() => {
    if (!escalatedExecutiveId || !needsExecutiveName) {
      setEscalatedExecutiveName(null);
      return;
    }
    let cancelled = false;
    void listExecutiveUsers()
      .then((users) => {
        if (cancelled) return;
        const match = users.find((u) => u.id === escalatedExecutiveId);
        setEscalatedExecutiveName(match?.full_name ?? "the assigned Executive");
      })
      .catch(() => {
        if (cancelled) return;
        setEscalatedExecutiveName("the assigned Executive");
      });
    return () => {
      cancelled = true;
    };
  }, [escalatedExecutiveId, needsExecutiveName]);

  const handleEscalationSuccess = useCallback(
    (updated: Appraisal) => {
      setAppraisal(updated);
    },
    [setAppraisal],
  );

  const canExportPDF = useMemo(
    () =>
      appraisal !== null &&
      PDF_EXPORTABLE_STATUSES.has(appraisal.status) &&
      (isHRAdmin || isExecutive || userRelation !== "NONE"),
    [appraisal, isHRAdmin, isExecutive, userRelation],
  );

  const hasUserSigned = useMemo(() => {
    if (!user || !appraisal?.signatures) return false;
    // Scope to the current PENDING_SIGNOFF session via the deterministic
    // `signing_round` counter (TASK-276b). Prior-round signatures (e.g.
    // an appraisee REJECT that triggered a dispute) remain in the audit
    // trail but must not block the user from signing again this round.
    return appraisal.signatures.some(
      (s) => s.signer_id === user.id && s.signing_round === appraisal.signing_round,
    );
  }, [user, appraisal]);

  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    if (appraisal) {
      setBreadcrumbs([
        { label: "Appraisals", href: "/appraisals" },
        { label: `${appraisal.employee_name} \u2014 ${appraisal.cycle_period_name}` },
      ]);
    }
    return () => {
      setBreadcrumbs([]);
    };
  }, [appraisal, setBreadcrumbs]);

  const [pdfError, setPdfError] = useState<string | null>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const handleDownloadPDF = useCallback(async () => {
    if (!id) return;
    setPdfError(null);
    setIsGeneratingPDF(true);
    try {
      const blob = await downloadAppraisalPDF(id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `appraisal-${id}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setPdfError("Unable to generate PDF. The appraisal may not be in an exportable status.");
    } finally {
      setIsGeneratingPDF(false);
    }
  }, [id]);

  const handleTransition = useCallback(async (toStatus: AppraisalStatus) => {
    if (!id || !appraisal) return;
    await transitionAppraisal(id, { to_status: toStatus, version: appraisal.version });
    void refetch();
  }, [id, appraisal, refetch]);

  const handleSign = useCallback(async (action: "ACCEPT" | "REJECT", reason?: string) => {
    if (!id) return;
    await submitSignature(id, action, reason);
    void refetch();
  }, [id, refetch]);

  const handleUpdateKd = useCallback((kdId: string, updates: UpdateKeyDeliverableRequest) => {
    if (!id) return;
    // Optimistically update local state with the changed fields
    setDeliverables((prev) =>
      prev.map((kd) => (kd.id === kdId ? { ...kd, ...updates } as typeof kd : kd)),
    );
    // Replace with authoritative server response (includes computed fields like weighted_score)
    void updateDeliverable(id, kdId, updates)
      .then((updated) => {
        setDeliverables((prev) =>
          prev.map((kd) => (kd.id === kdId ? updated : kd)),
        );
        // Manager rating changes trigger scoring engine — refetch appraisal
        // to pick up updated kd_average_score, total_score, etc.
        if ("manager_rating" in updates) {
          void refetch();
        }
      })
      .catch((err: unknown) => {
        toastError(buildErrorMessage(err));
        void refetch();
      });
  }, [id, setDeliverables, refetch, toastError]);

  const handleDeleteKd = useCallback((kdId: string) => {
    if (!id) return;
    void deleteDeliverable(id, kdId)
      .then(() => refetch())
      .catch((err: unknown) => {
        toastError(buildErrorMessage(err));
        void refetch();
      });
  }, [id, refetch, toastError]);

  const handleAddKd = useCallback(
    (perspective: BscPerspective, description: string, weight: number, selfRating?: number, managerRating?: number) => {
      if (!id) return;
      const body: CreateKeyDeliverableRequest = { perspective, description, weight };
      if (selfRating !== undefined) body.self_rating = selfRating;
      if (managerRating !== undefined) body.manager_rating = managerRating;
      void createDeliverable(id, body)
        .then(() => refetch())
        .catch((err: unknown) => {
          toastError(buildErrorMessage(err));
          void refetch();
        });
    },
    [id, refetch, toastError],
  );

  const handleUpdateCr = useCallback(
    (crId: string, field: RatingField, value: number): Promise<void> => {
      if (!id) return Promise.resolve();
      return updateCompetencyRating(id, crId, { [field]: value })
        .then(() => {
          void refetch();
        })
        .catch((err: unknown) => {
          toastError(buildErrorMessage(err));
          void refetch();
        });
    },
    [id, refetch, toastError],
  );

  const handleUpdateSubCr = useCallback(
    (crId: string, subCrId: string, field: RatingField, value: number): Promise<void> => {
      if (!id) return Promise.resolve();
      return updateSubCompetencyRating(id, crId, subCrId, { [field]: value })
        .then(() => {
          void refetch();
        })
        .catch((err: unknown) => {
          toastError(buildErrorMessage(err));
          void refetch();
        });
    },
    [id, refetch, toastError],
  );

  const handleAddSubCr = useCallback(
    (crId: string, name: string): Promise<void> => {
      if (!id) return Promise.resolve();
      return addSubCompetency(id, crId, name).then(() => {
        void refetch();
      });
      // Deliberately not caught here — CompetenciesTab's add form shows
      // the validation error (duplicate/empty name) inline itself and
      // needs the rejection to reach it, unlike the rating handlers
      // above which only ever toast a generic failure.
    },
    [id, refetch],
  );

  if (isLoading) return <DetailSkeleton />;

  if (error) {
    return (
      <div>
        <Alert variant="error">
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>Retry</Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!appraisal) return null;

  return (
    <div>
      <a href="#appraisal-tabs" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded focus:shadow text-sm">
        Skip to appraisal content
      </a>
      {showEscalationBanner && (
        <EscalationBanner
          executiveName={escalatedExecutiveName ?? "the assigned Executive"}
        />
      )}
      {(canShowEscalateButton || canShowReassignButton) && (
        <div className="mb-4 flex justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setEscalateMode(canShowReassignButton ? "reassign" : "escalate")
            }
            aria-label={
              canShowReassignButton
                ? "Re-assign Executive for this appraisal"
                : "Escalate this appraisal to an Executive"
            }
          >
            {canShowReassignButton ? "Re-assign Executive" : "Escalate to Executive"}
          </Button>
        </div>
      )}
      <AppraisalDetailHeader
        appraisal={appraisal}
        userRelation={userRelation}
        isHRAdmin={isHRAdmin}
        onTransition={handleTransition}
        onSign={handleSign}
        hasUserSigned={hasUserSigned}
        onRefresh={() => void refetch()}
        canExportPDF={canExportPDF}
        isGeneratingPDF={isGeneratingPDF}
        onDownloadPDF={handleDownloadPDF}
      />
      {pdfError && (
        <Alert variant="error" className="mb-4">
          <AlertDescription>{pdfError}</AlertDescription>
        </Alert>
      )}
      <div id="appraisal-tabs">
        <div role="tablist" aria-label="Appraisal sections" className="flex gap-1 border-b border-gray-200">
          {TABS.map((tab) => (
            <button
              type="button"
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`tabpanel-${tab.id}`}
              id={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-secondary focus-visible:outline-none ${
                activeTab === tab.id
                  ? "border-secondary text-secondary"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {activeTab === "kd" && (
          <div role="tabpanel" id="tabpanel-kd" aria-labelledby="tab-kd" className="py-6">
            <KdSection deliverables={deliverables} selfRatingEnabled={selfRatingEnabled} canEditKd={canEditKd} canMgrRate={canMgrRate} formType={appraisal.form_type} onUpdateKd={handleUpdateKd} onDeleteKd={handleDeleteKd} onAddKd={handleAddKd} onWeightError={toastError} />
          </div>
        )}
        {activeTab === "competencies" && (
          <div role="tabpanel" id="tabpanel-competencies" aria-labelledby="tab-competencies" className="py-6">
            <CompetenciesTab
              competencies={competencies}
              selfRatingEnabled={selfRatingEnabled}
              canMgrRate={canMgrRate}
              canSelfRate={canSelfRate}
              status={appraisal.status}
              bcAverage={appraisal.bc_average_score}
              bcDescriptor={appraisal.bc_descriptor}
              onUpdateRating={handleUpdateCr}
              onUpdateSubRating={handleUpdateSubCr}
              onAddSubCompetency={handleAddSubCr}
            />
          </div>
        )}
        {activeTab === "comments" && (
          <div role="tabpanel" id="tabpanel-comments" aria-labelledby="tab-comments" className="py-6">
            <CommentsSection appraisalId={appraisal.id} status={appraisal.status} userRelation={userRelation} isHRAdmin={isHRAdmin} />
          </div>
        )}
        {activeTab === "growth-plan" && (
          <div role="tabpanel" id="tabpanel-growth-plan" aria-labelledby="tab-growth-plan" className="py-6">
            <GrowthPlanForm
              appraisalId={appraisal.id}
              status={appraisal.status}
              userRelation={userRelation}
              signingRound={appraisal.signing_round}
              onRefresh={() => void refetch()}
            />
          </div>
        )}
        {activeTab === "sign-off" && (
          <div role="tabpanel" id="tabpanel-sign-off" aria-labelledby="tab-sign-off" className="py-6">
            <SignoffSection
              appraisalId={appraisal.id}
              status={appraisal.status}
              userRelation={userRelation}
              signatures={appraisal.signatures ?? []}
              onRefresh={() => void refetch()}
            />
          </div>
        )}
      </div>
      {escalateMode !== null && appraisal && (
        <EscalateExecutiveDialog
          open
          mode={escalateMode}
          appraisalId={appraisal.id}
          appraisalVersion={appraisal.version}
          currentExecutive={
            escalateMode === "reassign" && escalatedExecutiveId
              ? {
                  id: escalatedExecutiveId,
                  full_name: escalatedExecutiveName ?? "",
                }
              : null
          }
          onClose={() => setEscalateMode(null)}
          onSuccess={handleEscalationSuccess}
        />
      )}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
