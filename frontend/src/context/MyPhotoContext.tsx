/**
 * MyPhotoContext — Shares the signed-in user's own profile photo URL
 * between the sidebar avatar (Layout) and whichever page updates it
 * (EmployeeProfilePage's upload/remove controls), without round-tripping
 * a page reload for the sidebar to catch up.
 *
 * Deliberately NOT folded into AuthContext's `user`: that object is
 * fully replaced from freshly decoded JWT claims on every token refresh
 * (see AuthContext.performTokenRefresh) — photo_url isn't a JWT claim,
 * so merging it in there would just have it silently vanish a few
 * minutes later. This context owns its own independent, longer-lived
 * state instead.
 */

import {
  createContext, useContext, useEffect, useState, useCallback, useMemo,
} from "react";
import type { ReactNode } from "react";
import { useAuth } from "@/auth/useAuth";
import { getEmployee } from "@/api/employees";

interface MyPhotoContextValue {
  photoUrl: string | null;
  setPhotoUrl: (url: string | null) => void;
}

const MyPhotoCtx = createContext<MyPhotoContextValue | null>(null);

export function MyPhotoProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const employeeId = user?.employee_id ?? null;

  useEffect(() => {
    if (employeeId === null) {
      setPhotoUrl(null);
      return;
    }

    let cancelled = false;
    getEmployee(employeeId)
      .then((employee) => {
        if (!cancelled) setPhotoUrl(employee.photo_url ?? null);
      })
      .catch(() => {
        // Non-fatal — the sidebar just falls back to initials.
      });

    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  const setPhoto = useCallback((url: string | null) => {
    setPhotoUrl(url);
  }, []);

  const value = useMemo<MyPhotoContextValue>(
    () => ({ photoUrl, setPhotoUrl: setPhoto }),
    [photoUrl, setPhoto],
  );

  return <MyPhotoCtx.Provider value={value}>{children}</MyPhotoCtx.Provider>;
}

export function useMyPhoto(): MyPhotoContextValue {
  const ctx = useContext(MyPhotoCtx);
  if (ctx === null) {
    throw new Error("useMyPhoto must be used within a MyPhotoProvider");
  }
  return ctx;
}
