/**
 * CommentsSection — Displays the comment thread and conditional write form
 * for an appraisal.
 *
 * Render variants:
 *   1. isLoading       -> CommentsSkeleton
 *   2. fetchError      -> Error alert with retry info
 *   3. empty list      -> CommentsEmpty + write form if permitted
 *   4. populated list  -> Comment list + write form if permitted
 *
 * Write form is hidden entirely (not disabled) when:
 *   - userRelation === "NONE"
 *   - status is terminal (SIGNED_OFF, FINALISED, EXCLUDED, INCOMPLETE)
 */

import { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { AppraisalStatus } from "@/types";
import { TERMINAL_STATUSES } from "@/types";
import { useComments } from "../hooks/useComments";
import { CommentItem } from "./CommentItem";
import { CommentsSkeleton } from "./CommentsSkeleton";
import { CommentsEmpty } from "./CommentsEmpty";
import { CommentForm } from "./CommentForm";

type UserRelation = "APPRAISER" | "APPRAISEE" | "HR_ADMIN" | "NONE";

interface CommentsSectionProps {
  appraisalId: string;
  status: AppraisalStatus;
  userRelation: UserRelation;
  isHRAdmin?: boolean;
}

export function CommentsSection({
  appraisalId,
  status,
  userRelation,
  isHRAdmin = false,
}: CommentsSectionProps) {
  const {
    comments,
    isLoading,
    fetchError,
    submitError,
    isSubmitting,
    postComment,
  } = useComments(appraisalId);

  const canWrite = useMemo(
    () => {
      if (userRelation === "NONE") return false;
      if (!TERMINAL_STATUSES.has(status)) return true;
      // HR Admin can add remarks on SIGNED_OFF appraisals before finalising
      return (userRelation === "HR_ADMIN" || isHRAdmin) && status === "SIGNED_OFF";
    },
    [userRelation, status, isHRAdmin],
  );

  if (isLoading) return <CommentsSkeleton />;

  if (fetchError) {
    return (
      <Alert variant="error">
        <AlertDescription>{fetchError}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="shadow-sm" aria-label="Appraisal comments">
      <CardHeader className="bg-gradient-to-r from-primary-light to-white border-b border-gray-200 px-6 py-4">
        <CardTitle className="text-lg font-semibold text-gray-900">
          Discussion Comments
        </CardTitle>
        <p className="text-sm text-gray-500 mt-0.5">
          {comments.length} comment{comments.length !== 1 ? "s" : ""}
        </p>
      </CardHeader>

      <CardContent className="px-6 py-0">
        {comments.length === 0 ? (
          <CommentsEmpty />
        ) : (
          <div role="list" aria-label="Comment thread">
            {comments.map((comment) => (
              <div key={comment.id} role="listitem">
                <CommentItem
                  authorName={comment.author_name}
                  authorRole={comment.author_role}
                  content={comment.content}
                  createdAt={comment.created_at}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {canWrite && (
        <CommentForm
          onSubmit={postComment}
          isSubmitting={isSubmitting}
          submitError={submitError}
        />
      )}
    </Card>
  );
}
