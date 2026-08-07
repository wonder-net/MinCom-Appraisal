/**
 * CommentItem — Single comment bubble with author name, role badge, and timestamp.
 */

import { Badge } from "@/components/ui/badge";
import type { CommentAuthorRole } from "@/types";
import { formatCommentTimestamp } from "@/utils/format-date";

interface CommentItemProps {
  authorName: string;
  authorRole: CommentAuthorRole;
  content: string;
  createdAt: string;
}

const ROLE_CONFIG: Record<
  CommentAuthorRole,
  { label: string; className: string }
> = {
  APPRAISER: {
    label: "Appraisor",
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  APPRAISEE: {
    label: "Appraisee",
    className: "bg-teal-50 text-teal-700 border-teal-200",
  },
};

export function CommentItem({
  authorName,
  authorRole,
  content,
  createdAt,
}: CommentItemProps) {
  const { label, className } = ROLE_CONFIG[authorRole];
  const timestamp = formatCommentTimestamp(createdAt);

  return (
    <div className="flex flex-col gap-1 py-4 border-b border-gray-200 last:border-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-gray-900">
          {authorName}
        </span>
        <Badge
          variant="outline"
          className={`text-xs px-2 py-0.5 ${className}`}
        >
          {label}
        </Badge>
        <span className="text-xs text-gray-500 ml-auto">{timestamp}</span>
      </div>
      <p className="text-sm text-gray-900 leading-relaxed">{content}</p>
    </div>
  );
}
