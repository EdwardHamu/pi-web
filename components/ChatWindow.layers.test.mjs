import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const chatWindowSource = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
const globalCssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const appShellSource = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");
const chatInputSource = await readFile(new URL("./ChatInput.tsx", import.meta.url), "utf8");

function cssRule(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...source.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "g"))];
  return matches.at(-1)?.[1] ?? "";
}

test("keeps the chat backdrop layer outside the scrolling content subtree", () => {
  const glassIndex = chatWindowSource.indexOf('data-pi-web-chat-glass-layer="true"');
  const scrollIndex = chatWindowSource.indexOf('ref={scrollContainerRef}');
  const contentIndex = chatWindowSource.indexOf('data-pi-web-chat-content-layer="true"');

  assert.ok(glassIndex >= 0, "chat glass layer is missing");
  assert.ok(scrollIndex > glassIndex, "chat glass layer must be a sibling before the scroll viewport");
  assert.ok(contentIndex > scrollIndex, "chat content layer must be inside the scroll viewport");
  assert.doesNotMatch(globalCssSource, /\[data-pi-web-message-column="true"\]::before/);
});

test("bounds the live chat layer and promotes it only while active", () => {
  const contentRule = cssRule(globalCssSource, '[data-pi-web-chat-content-layer="true"]');
  const liveRule = cssRule(globalCssSource, '[data-pi-web-chat-live-layer="true"]');
  const activeSelector = '[data-pi-web-chat-live-layer="true"][data-active="true"]';
  const escapedActiveSelector = activeSelector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const activeRule = [...globalCssSource.matchAll(
    new RegExp(`${escapedActiveSelector}\\s*\\{([^}]*)\\}`, "g"),
  )].map((match) => match[1]).find((rule) => /will-change:\s*transform,\s*opacity/.test(rule)) ?? "";

  assert.match(contentRule, /contain:\s*paint/);
  assert.match(liveRule, /contain:\s*paint/);
  assert.match(liveRule, /isolation:\s*isolate/);
  assert.match(activeRule, /will-change:\s*transform,\s*opacity/);
  assert.match(chatWindowSource, /data-active=\{sessionBusy \|\| streamState\.isStreaming \? "true" : "false"\}/);
});

test("keeps backdrop filtering on the dedicated glass layer", () => {
  const scrollRule = cssRule(globalCssSource, '[data-pi-web-chat-scroll="true"]');
  const glassRule = cssRule(globalCssSource, '[data-pi-web-chat-glass-layer="true"]');

  assert.match(scrollRule, /backdrop-filter:\s*none/);
  assert.match(scrollRule, /-webkit-backdrop-filter:\s*none/);
  assert.match(glassRule, /contain:\s*paint/);
  assert.match(glassRule, /backdrop-filter:\s*blur/);
  assert.match(glassRule, /-webkit-backdrop-filter:\s*blur/);
});

test("uses a shared paint-contained pseudo-element for non-scrolling glass", () => {
  const sharedHostSelector = `:is(
  .pi-web-glass-surface,
  [data-pi-web-sidebar="true"],
  [data-pi-web-floating-menu="true"],
  [data-pi-web-floating-dialog="true"],
  [data-pi-web-minimap="true"],
  [data-minimap-preview-box],
  [data-pi-web-glass]
)`;
  const hostRule = cssRule(globalCssSource, sharedHostSelector);
  const pseudoRule = cssRule(globalCssSource, `${sharedHostSelector}::before`);
  const closedSidebarRule = cssRule(globalCssSource, '[data-pi-web-sidebar="true"].sidebar-closed::before');

  assert.match(hostRule, /isolation:\s*isolate/);
  assert.match(hostRule, /backdrop-filter:\s*none/);
  assert.match(hostRule, /-webkit-backdrop-filter:\s*none/);
  assert.doesNotMatch(hostRule, /will-change/);
  assert.match(pseudoRule, /pointer-events:\s*none/);
  assert.match(pseudoRule, /contain:\s*paint/);
  assert.match(pseudoRule, /backdrop-filter:\s*blur/);
  assert.match(pseudoRule, /-webkit-backdrop-filter:\s*blur/);
  assert.match(closedSidebarRule, /backdrop-filter:\s*none/);
  assert.doesNotMatch(appShellSource, /\bbackdropFilter\s*:/);
  assert.doesNotMatch(chatInputSource, /\b(?:backdropFilter|WebkitBackdropFilter)\s*:/);
});
