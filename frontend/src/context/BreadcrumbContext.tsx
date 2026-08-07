/**
 * BreadcrumbContext -- Allows pages to set breadcrumb items that
 * Layout renders in the fixed top bar header.
 */

import { createContext, useContext, useState, useCallback, useMemo } from "react";
import type { ReactNode } from "react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbContextValue {
  breadcrumbs: ReadonlyArray<BreadcrumbItem>;
  setBreadcrumbs: (items: ReadonlyArray<BreadcrumbItem>) => void;
}

const BreadcrumbCtx = createContext<BreadcrumbContextValue | null>(null);

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [breadcrumbs, setBreadcrumbsState] = useState<ReadonlyArray<BreadcrumbItem>>([]);

  const setBreadcrumbs = useCallback((items: ReadonlyArray<BreadcrumbItem>) => {
    setBreadcrumbsState(items);
  }, []);

  const value = useMemo<BreadcrumbContextValue>(
    () => ({ breadcrumbs, setBreadcrumbs }),
    [breadcrumbs, setBreadcrumbs],
  );

  return (
    <BreadcrumbCtx.Provider value={value}>
      {children}
    </BreadcrumbCtx.Provider>
  );
}

export function useBreadcrumbs(): BreadcrumbContextValue {
  const ctx = useContext(BreadcrumbCtx);
  if (ctx === null) {
    throw new Error("useBreadcrumbs must be used within a BreadcrumbProvider");
  }
  return ctx;
}
