"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  getEmptyRunningSessionIds,
  getRunningSessionIds,
  subscribeRunningSessionIds,
} from "@/lib/running-sessions";

export function useRunningSessionIds() {
  return useSyncExternalStore(
    subscribeRunningSessionIds,
    getRunningSessionIds,
    getEmptyRunningSessionIds,
  );
}

/** Subscribe to one session so unrelated running sessions do not re-render chat. */
export function useRunningSession(sessionId: string | null): boolean {
  const getSnapshot = useCallback(
    () => sessionId !== null && getRunningSessionIds().has(sessionId),
    [sessionId],
  );
  return useSyncExternalStore(
    subscribeRunningSessionIds,
    getSnapshot,
    () => false,
  );
}
