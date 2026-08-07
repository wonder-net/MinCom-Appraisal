/**
 * CommentsEmpty — Empty state for when no comments exist yet.
 */

export function CommentsEmpty() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[160px] gap-2 text-center py-10">
      <p className="text-base font-medium text-gray-500">No comments yet</p>
      <p className="text-sm text-gray-400">
        Be the first to add a comment to this appraisal.
      </p>
    </div>
  );
}
