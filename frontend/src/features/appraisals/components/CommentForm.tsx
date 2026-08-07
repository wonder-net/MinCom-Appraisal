/**
 * CommentForm — Textarea + submit button for posting a new comment.
 *
 * Validates that content is non-empty before submission.
 * Displays inline error messages for validation and API errors.
 */

import { useState, useCallback, type FormEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface CommentFormProps {
  onSubmit: (content: string) => Promise<boolean>;
  isSubmitting: boolean;
  submitError: string | null;
}

export function CommentForm({
  onSubmit,
  isSubmitting,
  submitError,
}: CommentFormProps) {
  const [content, setContent] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setValidationError(null);

      const trimmed = content.trim();
      if (trimmed.length === 0) {
        setValidationError("Comment cannot be empty");
        return;
      }

      const success = await onSubmit(trimmed);
      if (success) {
        setContent("");
      }
    },
    [content, onSubmit],
  );

  const displayError = validationError ?? submitError;
  const errorId = "comment-error";

  return (
    <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
      <form aria-label="Post a comment" onSubmit={(e) => void handleSubmit(e)}>
        <label
          htmlFor="comment-input"
          className="block text-sm font-medium text-gray-900 mb-1"
        >
          Add a comment
        </label>
        <Textarea
          id="comment-input"
          name="content"
          rows={3}
          placeholder="Type your comment..."
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            if (validationError) setValidationError(null);
          }}
          aria-describedby={displayError ? errorId : undefined}
          className="resize-none focus-visible:ring-2 focus-visible:ring-secondary"
        />
        {displayError && (
          <p
            id={errorId}
            role="alert"
            className="text-sm text-red-700 mt-1"
          >
            {displayError}
          </p>
        )}
        <div className="flex justify-end mt-3">
          <Button
            type="submit"
            disabled={isSubmitting}
            aria-disabled={isSubmitting}
            className="bg-primary text-white hover:bg-primary-dark"
          >
            {isSubmitting ? "Posting..." : "Post Comment"}
          </Button>
        </div>
      </form>
    </div>
  );
}
