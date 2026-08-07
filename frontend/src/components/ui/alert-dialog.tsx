/**
 * AlertDialog — Accessible confirmation dialog for destructive actions.
 *
 * Follows the shadcn/ui AlertDialog API pattern using a div overlay
 * with keyboard dismiss (Escape) and focus management.
 *
 * Unlike Dialog, AlertDialog does not dismiss on backdrop click
 * (requires explicit Cancel or Confirm action).
 */

import { useEffect, useCallback } from "react";
import { cn } from "@/utils/cn";

interface AlertDialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

function AlertDialog({ open, onOpenChange, children }: AlertDialogProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange?.(false);
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="presentation"
    >
      {children}
    </div>
  );
}

interface AlertDialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  children: React.ReactNode;
}

function AlertDialogContent({
  className,
  children,
  ...props
}: AlertDialogContentProps) {
  return (
    <div
      className={cn(
        "w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-xl",
        className,
      )}
      role="alertdialog"
      aria-modal="true"
      {...props}
    >
      {children}
    </div>
  );
}

interface AlertDialogHeaderProps {
  className?: string;
  children: React.ReactNode;
}

function AlertDialogHeader({ className, children }: AlertDialogHeaderProps) {
  return <div className={cn("mb-4", className)}>{children}</div>;
}

interface AlertDialogTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  className?: string;
  children: React.ReactNode;
}

function AlertDialogTitle({
  className,
  children,
  ...props
}: AlertDialogTitleProps) {
  return (
    <h2
      className={cn("text-lg font-semibold text-gray-900", className)}
      {...props}
    >
      {children}
    </h2>
  );
}

interface AlertDialogDescriptionProps
  extends React.HTMLAttributes<HTMLParagraphElement> {
  className?: string;
  children: React.ReactNode;
}

function AlertDialogDescription({
  className,
  children,
  ...props
}: AlertDialogDescriptionProps) {
  return (
    <p className={cn("mt-2 text-sm text-gray-500", className)} {...props}>
      {children}
    </p>
  );
}

interface AlertDialogFooterProps {
  className?: string;
  children: React.ReactNode;
}

function AlertDialogFooter({ className, children }: AlertDialogFooterProps) {
  return (
    <div className={cn("mt-6 flex justify-end gap-3", className)}>
      {children}
    </div>
  );
}

interface AlertDialogButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string;
  children: React.ReactNode;
}

function AlertDialogCancel({
  className,
  children,
  ...props
}: AlertDialogButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-md border border-gray-200 bg-transparent px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function AlertDialogAction({
  className,
  children,
  ...props
}: AlertDialogButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
};
