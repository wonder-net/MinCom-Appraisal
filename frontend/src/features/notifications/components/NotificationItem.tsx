/**
 * NotificationItem — Single row in the notification dropdown.
 *
 * Shows unread indicator dot, title, message (truncated to 2 lines),
 * relative timestamp, and (when the row points at a target) a static
 * chevron cue on the right.
 *
 * The whole row is the action: clicking anywhere on it marks the
 * notification as read (if unread), closes the popover, and — if the
 * notification has a target — navigates to that target. This matches
 * the Gmail/GitHub/Slack/Linear convention where each notification
 * row is a single, unified click target rather than nesting an inline
 * link inside a clickable container.
 */

import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import type { Notification } from "@/types";

interface NotificationItemProps {
  notification: Notification;
  onMarkRead: (id: string) => void;
  onClose?: () => void;
}

function formatRelativeTime(dateString: string): string {
  return formatDistanceToNow(new Date(dateString), { addSuffix: true });
}

function resolveTargetPath(notification: Notification): string | null {
  const { appraisal, related_object_type, related_object_id } = notification;
  if (related_object_type === "AppraisalBulkImportJob" && related_object_id) {
    return `/admin/appraisals/import/${related_object_id}/results`;
  }
  if (related_object_type === "BulkImportJob" && related_object_id) {
    return `/admin/users/import/${related_object_id}/results`;
  }
  if (appraisal) {
    return `/appraisals/${appraisal}`;
  }
  return null;
}

export function NotificationItem({
  notification,
  onMarkRead,
  onClose,
}: NotificationItemProps) {
  const { id, title, message, is_read, created_at } = notification;
  const navigate = useNavigate();

  const targetPath = useMemo(() => resolveTargetPath(notification), [notification]);

  const markReadIfNeeded = useCallback(() => {
    if (!is_read) {
      onMarkRead(id);
    }
  }, [id, is_read, onMarkRead]);

  const handleClick = useCallback(() => {
    markReadIfNeeded();
    onClose?.();
    if (targetPath) {
      navigate(targetPath);
    }
  }, [markReadIfNeeded, onClose, navigate, targetPath]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleClick();
      }
    },
    [handleClick],
  );

  const unreadPrefix = is_read ? "" : "Unread: ";
  const actionSuffix = targetPath ? "Press to view." : "Press to dismiss.";
  const ariaLabel = `${unreadPrefix}${title}. ${actionSuffix}`;

  return (
    <li
      className={`flex gap-3 px-4 py-3 border-b border-gray-200 last:border-0 hover:bg-gray-50 transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-secondary ${!is_read ? "bg-primary-light/30" : "bg-white"}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
    >
      {/* Unread indicator dot */}
      <div className="mt-1.5 shrink-0">
        {!is_read ? (
          <span
            className="block h-2 w-2 rounded-full bg-secondary"
            aria-label="Unread"
          />
        ) : (
          <span
            className="block h-2 w-2 rounded-full bg-transparent"
            aria-hidden="true"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm leading-snug ${!is_read ? "font-semibold text-gray-900" : "font-medium text-gray-900"}`}
        >
          {title}
        </p>
        <p className="text-xs text-gray-500 mt-0.5 leading-snug line-clamp-2">
          {message}
        </p>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-gray-400">
            {formatRelativeTime(created_at)}
          </span>
          {targetPath ? (
            <span className="text-xs text-gray-400" aria-hidden="true">
              &rsaquo;
            </span>
          ) : null}
        </div>
      </div>
    </li>
  );
}
