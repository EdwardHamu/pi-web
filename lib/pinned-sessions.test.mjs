import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { loadPinnedSessionIds, savePinnedSessionIds } = await jiti.import("./pinned-sessions.ts");

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("saves and restores pinned session ids", () => {
  const storage = createStorage();
  const ids = new Set(["session-a", "session-b"]);

  savePinnedSessionIds(ids, storage);

  assert.deepEqual([...loadPinnedSessionIds(storage)], [...ids]);
});

test("removes the storage entry when no sessions are pinned", () => {
  const storage = createStorage({ "pi-web:pinned-session-ids": '["session-a"]' });

  savePinnedSessionIds(new Set(), storage);

  assert.equal(storage.getItem("pi-web:pinned-session-ids"), null);
  assert.deepEqual([...loadPinnedSessionIds(storage)], []);
});

test("ignores malformed or non-string stored values", () => {
  const storage = createStorage({
    "pi-web:pinned-session-ids": '["session-a", 4, "", null, "session-b"]',
  });

  assert.deepEqual([...loadPinnedSessionIds(storage)], ["session-a", "session-b"]);
  storage.setItem("pi-web:pinned-session-ids", "not-json");
  assert.deepEqual([...loadPinnedSessionIds(storage)], []);
});

test("falls back when browser storage is unavailable", () => {
  const unavailable = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
    removeItem() { throw new Error("blocked"); },
  };

  assert.deepEqual([...loadPinnedSessionIds(unavailable)], []);
  assert.doesNotThrow(() => savePinnedSessionIds(new Set(["session-a"]), unavailable));
});
