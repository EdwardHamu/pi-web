import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const {
  getNextRunningSessionPollDelay,
  publishRunningSessionIds,
  getRunningSessionIds,
  subscribeRunningSessionIds,
} = await createJiti(import.meta.url).import("./running-sessions.ts");

test("publishes running snapshots only when their contents change", () => {
  publishRunningSessionIds(new Set());
  let notifications = 0;
  const unsubscribe = subscribeRunningSessionIds(() => { notifications += 1; });

  assert.equal(publishRunningSessionIds(new Set()), false);
  assert.equal(notifications, 0);
  assert.equal(publishRunningSessionIds(["one", "two"]), true);
  assert.equal(notifications, 1);
  assert.equal(publishRunningSessionIds(["two", "one"]), false);
  assert.equal(notifications, 1);
  assert.deepEqual([...getRunningSessionIds()].sort(), ["one", "two"]);

  unsubscribe();
  publishRunningSessionIds(new Set());
});

test("backs off idle polls while keeping active runs responsive", () => {
  assert.deepEqual(
    [2500, 10000, 30000, 60000, 60000].map((delay) => (
      getNextRunningSessionPollDelay(delay, 0)
    )),
    [10000, 30000, 60000, 60000, 60000],
  );
  assert.equal(getNextRunningSessionPollDelay(60000, 1), 2500);
});
