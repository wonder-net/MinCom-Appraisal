/**
 * NotificationBell — Bell icon button in the site header with unread
 * badge and notification dropdown popover.
 *
 * Polls unread count every 60 seconds. Opens a popover on click
 * showing the last 10 notifications. Supports mark-as-read and
 * mark-all-as-read actions.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useUnreadCount } from "@/features/notifications/hooks/useUnreadCount";
import { useNotifications } from "@/features/notifications/hooks/useNotifications";
import { NotificationList } from "@/features/notifications/components/NotificationList";
import { ToastContainer } from "@/components/toast-container";
import { useToast } from "@/hooks/use-toast";

export function NotificationBell() {
  const { count, setCount } = useUnreadCount();
  const [isOpen, setIsOpen] = useState(false);
  const toast = useToast();
  const prevOpenRef = useRef(false);

  const {
    notifications,
    isLoading,
    markAsRead,
    markAllAsRead,
    isMarkingAll,
    fetchNotifications,
  } = useNotifications({
    onCountUpdate: setCount,
    onError: toast.error,
  });

  // Fetch notifications when popover opens
  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      void fetchNotifications();
    }
    prevOpenRef.current = isOpen;
  }, [isOpen, fetchNotifications]);

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
  }, []);

  const ariaLabel =
    count > 0
      ? `Notifications \u2014 ${String(count)} unread`
      : "Notifications";

  return (
    <>
      <Popover open={isOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label={ariaLabel}
            className="relative h-9 w-9 rounded-full p-0 text-gray-600 hover:bg-primary-light focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
          >
            <Bell className="h-5 w-5" aria-hidden="true" />
            {count > 0 && (
              <span
                className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-white text-[10px] font-bold leading-none"
                aria-hidden="true"
              >
                {count > 999 ? "999+" : count}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-80 p-0 shadow-lg border border-gray-200 rounded-lg overflow-hidden"
          align="end"
          sideOffset={8}
          aria-label="Notifications panel"
          role="dialog"
          aria-labelledby="notif-panel-title"
        >
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-primary-light to-white">
            <span
              id="notif-panel-title"
              className="text-sm font-semibold text-gray-900"
            >
              Notifications
            </span>
            {count > 0 && (
              <span className="rounded-full bg-primary text-white text-xs px-2 py-0.5 font-medium">
                {count} unread
              </span>
            )}
          </div>

          <NotificationList
            notifications={notifications}
            isLoading={isLoading}
            onMarkRead={markAsRead}
            onMarkAllRead={markAllAsRead}
            isMarkingAll={isMarkingAll}
            onClose={() => setIsOpen(false)}
          />
        </PopoverContent>
      </Popover>
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} />
    </>
  );
}
