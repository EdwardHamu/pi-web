import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./useAgentSession.ts", import.meta.url), "utf8");
const loadSessionSource = source.slice(
  source.indexOf("const loadSession = useCallback"),
  source.indexOf("const loadContext = useCallback"),
);
const switchSource = source.slice(
  source.indexOf("const handleModelChange = useCallback"),
  source.indexOf("const handleCompact = useCallback"),
);

test("existing-session model changes are optimistic and serialized", () => {
  const optimisticIndex = switchSource.indexOf("setCurrentModelOverride(target)");
  const requestIndex = switchSource.indexOf("await sendAgentCommand", optimisticIndex);

  assert.match(switchSource, /if \(!sid \|\| modelSwitchPendingRef\.current\) return/);
  assert.ok(optimisticIndex >= 0);
  assert.ok(requestIndex > optimisticIndex);
  assert.match(switchSource, /setModelSwitching\(true\)/);
  assert.match(switchSource, /setModelSwitching\(false\)/);
});

test("session reloads cannot clear an in-flight optimistic model", () => {
  assert.match(
    loadSessionSource,
    /setCurrentModelOverride\(\(current\) => modelSwitchPendingRef\.current \? current : null\)/,
  );
});

test("promoted sessions restore the live model before JSONL persistence catches up", () => {
  assert.match(source, /model\?: \{ provider: string; id: string \} \| null/);
  assert.match(
    loadSessionSource,
    /liveState\.model !== undefined && !d\.context\.model[\s\S]*?modelId: liveState\.model\.id[\s\S]*?modelSwitchPendingRef\.current \? current : liveModel/,
  );
});

test("a completed model switch reloads canonical session state and reports failures", () => {
  assert.match(switchSource, /modelSwitchPendingRef\.current = false;\s*await loadSession\(sid\)/);
  assert.match(switchSource, /setCurrentModelOverride\(previousModel\)/);
  assert.match(switchSource, /Failed to switch model:/);
});

test("fresh-session model changes are queued before the first prompt", () => {
  const sendSource = source.slice(
    source.indexOf("  const handleSend = useCallback"),
    source.indexOf("  const executeBash = useCallback"),
  );

  assert.match(source, /const newSessionModelAppliedRef = useRef/);
  assert.match(source, /const newSessionModelChangeRef = useRef<Promise<void>>/);
  assert.match(source, /const applyNewSessionModel = useCallback/);
  assert.match(sendSource, /const sid = sessionIdRef\.current[\s\S]*?await ensureNewSession\(\)/);
  assert.match(sendSource, /await applyNewSessionModel\(sid\)/);
  assert.doesNotMatch(sendSource, /const selectedModel = newSessionModel;/);
});

test("fresh-session model selection uses the live override ref", () => {
  assert.match(switchSource, /newSessionModelOverrideRef\.current = selectedModel/);
  assert.match(switchSource, /await applyNewSessionModel\(sid\)/);
  assert.match(switchSource, /Failed to switch model:/);
});

test("prompts wait for existing-session model switches and carry the selected model", () => {
  const sendSource = source.slice(
    source.indexOf("  const handleSend = useCallback"),
    source.indexOf("  const executeBash = useCallback"),
  );

  assert.match(sendSource, /existingModelChangeRef\.current/);
  assert.match(sendSource, /const promptModel = currentModelRef\.current/);
  assert.match(sendSource, /provider: promptModel\.provider, modelId: promptModel\.modelId/);
  assert.match(switchSource, /existingModelChangeRef\.current = run\.catch\(\(\) => \{\}\)/);
});
