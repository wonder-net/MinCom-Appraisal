/**
 * useNotifications — Manages the notification list, mark-read, and
 * mark-all-read operations with optimistic updates.
 *
 * Fetches notifications on demand (when popover opens) and provides
 * optimistic state updates with rollback on API failure.
 */

import { useState, useCallback } from "react";
import { listNotifications, markRead, markAllRead } from "@/api/notifications";
import type { Notification } from "@/types";

interface UseNotificationsOptions {
  onCountUpdate: (count: number) => void;
  onError: (message: string) => void;
}

interface UseNotificationsResult {
  notifications: Notification[];
  isLoading: boolean;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  isMarkingAll: boolean;
  fetchNotifications: () => Promise<void>;
}

export function useNotifications({
  onCountUpdate,
  onError,
}: UseNotificationsOptions): UseNotificationsResult {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await listNotifications();
      setNotifications(data);
    } catch {
      // Silent degradation on fetch
    } finally {
      setIsLoading(false);
    }
  }, []);

  const markAsRead = useCallback(
    (id: string) => {
      const previous = notifications;
      const previousUnread = notifications.filter((n) => !n.is_read).length;

      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
      );

      const target = notifications.find((n) => n.id === id);
      if (target && !target.is_read) {
        onCountUpdate(Math.max(0, previousUnread - 1));
      }

      markRead(id).catch(() => {
        // Revert on failure
        setNotifications(previous);
        onCountUpdate(previousUnread);
        onError("Failed to mark notification as read.");
      });
    },
    [notifications, onCountUpdate, onError],
  );

  const markAllAsRead = useCallback(() => {
    const previous = notifications;
    const previousUnread = notifications.filter((n) => !n.is_read).length;

    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, is_read: true })),
    );
    onCountUpdate(0);
    setIsMarkingAll(true);

    markAllRead()
      .catch(() => {
        // Revert on failure
        setNotifications(previous);
        onCountUpdate(previousUnread);
        onError("Failed to mark all notifications as read.");
      })
      .finally(() => {
        setIsMarkingAll(false);
      });
  }, [notifications, onCountUpdate, onError]);

  return {
    notifications,
    isLoading,
    markAsRead,
    markAllAsRead,
    isMarkingAll,
    fetchNotifications,
  };
}
