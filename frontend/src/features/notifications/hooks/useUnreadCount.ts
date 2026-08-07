/**
 * useUnreadCount — Polls the unread notification count every 60 seconds.
 *
 * Returns { count, setCount } where count defaults to 0.
 * Fetches on mount and sets up a 60-second polling interval.
 * On API failure, the count is not updated (silent degradation).
 * The interval is cleared on unmount to prevent memory leaks.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { getUnreadCount } from "@/api/notifications";

const POLL_INTERVAL_MS = 60_000;

interface UseUnreadCountResult {
  count: number;
  setCount: (count: number) => void;
}

export function useUnreadCount(): UseUnreadCountResult {
  const [count, setCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCount = useCallback(async () => {
    try {
      const result = await getUnreadCount();
      setCount(result);
    } catch {
      // Silent degradation — do not update state on failure
    }
  }, []);

  useEffect(() => {
    void fetchCount();

    intervalRef.current = setInterval(() => {
      void fetchCount();
    }, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchCount]);

  return { count, setCount };
}
