export const RUNNING_SESSION_POLL_WAKE_EVENT = "pi-web:running-session-poll-wake";
export const RUNNING_SESSION_POLL_ACTIVE_MS = 2500;
export const RUNNING_SESSION_POLL_IDLE_START_MS = 10_000;
export const RUNNING_SESSION_POLL_MAX_MS = 60_000;

export type RunningSessionIds = ReadonlySet<string>;

const EMPTY_RUNNING_SESSION_IDS: RunningSessionIds = new Set();
let snapshot: RunningSessionIds = EMPTY_RUNNING_SESSION_IDS;
const listeners = new Set<() => void>();

export function areRunningSessionIdsEqual(
  first: ReadonlySet<string>,
  second: ReadonlySet<string>,
): boolean {
  if (first.size !== second.size) return false;
  for (const id of first) {
    if (!second.has(id)) return false;
  }
  return true;
}

export function getRunningSessionIds(): RunningSessionIds {
  return snapshot;
}

export function getEmptyRunningSessionIds(): RunningSessionIds {
  return EMPTY_RUNNING_SESSION_IDS;
}

export function subscribeRunningSessionIds(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Publish only a new value. React subscribers stay asleep for identical polls. */
export function publishRunningSessionIds(ids: Iterable<string>): boolean {
  const next = new Set(ids);
  if (areRunningSessionIdsEqual(snapshot, next)) return false;

  snapshot = next;
  for (const listener of [...listeners]) listener();
  return true;
}

export function getNextRunningSessionPollDelay(
  previousDelayMs: number,
  runningSessionCount: number,
): number {
  if (runningSessionCount > 0) return RUNNING_SESSION_POLL_ACTIVE_MS;
  if (previousDelayMs <= RUNNING_SESSION_POLL_ACTIVE_MS) {
    return RUNNING_SESSION_POLL_IDLE_START_MS;
  }
  return Math.min(previousDelayMs * 3, RUNNING_SESSION_POLL_MAX_MS);
}

/** Wake the visible-tab poll after a local prompt or shell command starts/ends. */
export function wakeRunningSessionPoll(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(RUNNING_SESSION_POLL_WAKE_EVENT));
  }
}
