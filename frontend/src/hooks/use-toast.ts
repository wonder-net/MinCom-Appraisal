/**
 * useToast — Minimal toast notification hook.
 *
 * Provides a simple way to show ephemeral success/error messages
 * without a third-party library dependency. Toasts auto-dismiss
 * after a configurable duration.
 */

import { useState, useCallback, useRef } from "react";

export type ToastVariant = "success" | "error";

export interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface UseToastResult {
  toasts: readonly Toast[];
  success: (message: string) => void;
  error: (message: string) => void;
  dismiss: (id: number) => void;
}

const AUTO_DISMISS_MS = 4000;

export function useToast(): UseToastResult {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);

  const addToast = useCallback((message: string, variant: ToastVariant) => {
    const id = ++counterRef.current;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, AUTO_DISMISS_MS);
  }, []);

  const success = useCallback(
    (message: string) => addToast(message, "success"),
    [addToast],
  );

  const error = useCallback(
    (message: string) => addToast(message, "error"),
    [addToast],
  );

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, success, error, dismiss };
}
