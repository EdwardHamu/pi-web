/**
 * Browser-local persistence for sessions pinned in the sidebar.
 *
 * Pinning is a UI preference rather than session data, so it stays local to
 * this browser and does not modify the session JSONL files on disk.
 */

const STORAGE_KEY = "pi-web:pinned-session-ids";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadPinnedSessionIds(
  storage: StorageLike | null = getBrowserStorage(),
): Set<string> {
  if (!storage) return new Set();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((id): id is string => typeof id === "string" && id.length > 0))
      : new Set();
  } catch {
    return new Set();
  }
}

export function savePinnedSessionIds(
  ids: ReadonlySet<string>,
  storage: StorageLike | null = getBrowserStorage(),
): void {
  if (!storage) return;
  try {
    if (ids.size === 0) {
      storage.removeItem(STORAGE_KEY);
      return;
    }
    storage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Pinning remains available for the current page when storage is blocked.
  }
}
