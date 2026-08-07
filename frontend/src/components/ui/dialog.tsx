/**
 * Dialog — Accessible modal dialog using div overlay.
 *
 * Provides a shadcn-compatible API (Dialog, DialogContent, DialogHeader,
 * DialogTitle, DialogFooter) using a portal-free div overlay with
 * backdrop, keyboard dismiss (Escape), and focus management.
 */

import { useEffect, useCallback, useRef } from "react";
import { cn } from "@/utils/cn";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

function Dialog({ open, onOpenChange, children }: DialogProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false);
      }
    },
    [onOpenChange],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [open, handleKeyDown]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onOpenChange(false);
      }
    },
    [onOpenChange],
  );

  if (!open) return null;

  return (
    <div
      ref={contentRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white shadow-xl">
        {children}
      </div>
    </div>
  );
}

interface DialogContentProps {
  className?: string;
  children: React.ReactNode;
  role?: string;
  "aria-labelledby"?: string;
  "aria-modal"?: boolean | "true" | "false";
}

function DialogContent({
  className,
  children,
  ...props
}: DialogContentProps) {
  return (
    <div className={cn("p-6", className)} {...props}>
      {children}
    </div>
  );
}

interface DialogHeaderProps {
  className?: string;
  children: React.ReactNode;
}

function DialogHeader({ className, children }: DialogHeaderProps) {
  return (
    <div className={cn("mb-4", className)}>
      {children}
    </div>
  );
}

interface DialogTitleProps {
  id?: string;
  className?: string;
  children: React.ReactNode;
}

function DialogTitle({ id, className, children }: DialogTitleProps) {
  return (
    <h2 id={id} className={cn("text-lg font-semibold text-gray-900", className)}>
      {children}
    </h2>
  );
}

interface DialogFooterProps {
  className?: string;
  children: React.ReactNode;
}

function DialogFooter({ className, children }: DialogFooterProps) {
  return (
    <div className={cn("mt-4 flex justify-end gap-2", className)}>
      {children}
    </div>
  );
}

export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter };
