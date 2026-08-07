/**
 * ToastContainer — Renders a stack of ephemeral toast notifications.
 *
 * Positioned fixed at the top-right corner. Each toast auto-dismisses
 * but can also be manually dismissed by clicking the close button.
 */

import type { Toast } from "@/hooks/use-toast";

interface ToastContainerProps {
  toasts: readonly Toast[];
  onDismiss: (id: number) => void;
}

const VARIANT_CLASSES: Record<string, string> = {
  success: "border-green-300 bg-green-50 text-green-800",
  error: "border-red-300 bg-red-50 text-red-800",
};

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm shadow-md ${VARIANT_CLASSES[toast.variant] ?? VARIANT_CLASSES.success}`}
          role="status"
        >
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            className="shrink-0 text-current opacity-60 hover:opacity-100"
            aria-label="Dismiss notification"
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
