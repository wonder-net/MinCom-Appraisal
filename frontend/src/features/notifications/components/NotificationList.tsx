/**
 * NotificationList — Renders the notification items inside the
 * popover dropdown, including loading skeleton, empty state,
 * and the "Mark all as read" footer.
 */

import { Bell, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationItem } from "./NotificationItem";
import type { Notification } from "@/types";

interface NotificationListProps {
  notifications: Notification[];
  isLoading: boolean;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  isMarkingAll: boolean;
  onClose?: () => void;
}

function LoadingSkeleton() {
  return (
    <div
      className="p-4 space-y-3 animate-pulse"
      aria-busy="true"
      aria-label="Loading notifications"
    >
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-3">
          <div className="h-2 w-2 mt-2 rounded-full bg-gray-200 shrink-0" />
          <div className="space-y-1.5 flex-1">
            <div className="h-3 w-3/4 rounded bg-gray-200" />
            <div className="h-3 w-full rounded bg-gray-200" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center min-h-[160px]">
      <Bell
        className="h-8 w-8 text-gray-400 mb-3"
        aria-hidden="true"
      />
      <p className="text-sm font-medium text-gray-500">
        No notifications yet.
      </p>
      <p className="text-xs text-gray-400 mt-1">
        You are all caught up.
      </p>
    </div>
  );
}

export function NotificationList({
  notifications,
  isLoading,
  onMarkRead,
  onMarkAllRead,
  isMarkingAll,
  onClose,
}: NotificationListProps) {
  const hasUnread = notifications.some((n) => !n.is_read);

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (notifications.length === 0) {
    return <EmptyState />;
  }

  return (
    <>
      <ul role="list" className="max-h-80 overflow-y-auto">
        {notifications.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onMarkRead={onMarkRead}
            onClose={onClose}
          />
        ))}
      </ul>
      {hasUnread && (
        <footer className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-secondary hover:text-primary font-medium w-full"
            onClick={onMarkAllRead}
            disabled={isMarkingAll}
            aria-label="Mark all notifications as read"
          >
            {isMarkingAll && (
              <Loader2
                className="mr-1.5 h-3 w-3 animate-spin"
                aria-hidden="true"
              />
            )}
            Mark all as read
          </Button>
        </footer>
      )}
    </>
  );
}
