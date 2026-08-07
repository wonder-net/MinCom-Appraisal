/**
 * useComments — Custom hook for fetching and posting appraisal comments.
 *
 * Manages loading, error, and optimistic insert state for the
 * CommentsSection component.
 */

import { useState, useEffect, useCallback } from "react";
import { listComments, createComment } from "@/api/comments";
import type { Comment } from "@/types";
import { isAxiosError } from "axios";

interface UseCommentsReturn {
  comments: Comment[];
  isLoading: boolean;
  fetchError: string | null;
  submitError: string | null;
  isSubmitting: boolean;
  postComment: (content: string) => Promise<boolean>;
}

export function useComments(appraisalId: string): UseCommentsReturn {
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchComments() {
      setIsLoading(true);
      setFetchError(null);
      try {
        const commentList = await listComments(appraisalId);
        if (!cancelled) {
          const sorted = [...commentList].sort(
            (a, b) =>
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime(),
          );
          setComments(sorted);
        }
      } catch {
        if (!cancelled) {
          setFetchError("Failed to load comments. Please try again.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchComments();

    return () => {
      cancelled = true;
    };
  }, [appraisalId]);

  const postComment = useCallback(
    async (content: string): Promise<boolean> => {
      setSubmitError(null);
      setIsSubmitting(true);

      // Optimistic insert with a temporary ID
      const optimisticId = `temp-${Date.now()}`;
      const optimistic: Comment = {
        id: optimisticId,
        appraisal_id: appraisalId,
        author_id: "",
        author_name: "",
        author_role: "APPRAISEE",
        content,
        created_at: new Date().toISOString(),
      };
      setComments((prev) => [...prev, optimistic]);

      try {
        const created = await createComment(appraisalId, { content });
        setComments((prev) =>
          prev.map((c) => (c.id === optimisticId ? created : c)),
        );
        return true;
      } catch (err: unknown) {
        // Revert optimistic insert
        setComments((prev) => prev.filter((c) => c.id !== optimisticId));

        if (isAxiosError(err) && err.response?.data) {
          const data = err.response.data as { data?: { message?: string } };
          setSubmitError(
            data.data?.message ?? "Failed to post comment. Please try again.",
          );
        } else {
          setSubmitError("Failed to post comment. Please try again.");
        }
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [appraisalId],
  );

  return { comments, isLoading, fetchError, submitError, isSubmitting, postComment };
}
