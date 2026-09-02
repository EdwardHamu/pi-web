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

function cssRules(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...source.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "g"))]
    .map((match) => match[1]);
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
  [data-pi-web-floating-menu="true"],
  [data-pi-web-floating-dialog="true"],
  [data-pi-web-minimap="true"],
  [data-minimap-preview-box],
  [data-pi-web-glass]
)`;
  const hostRule = cssRule(globalCssSource, sharedHostSelector);
  const pseudoRule = cssRule(globalCssSource, `${sharedHostSelector}::before`);
  const sidebarHostRule = cssRule(globalCssSource, '[data-pi-web-sidebar="true"]');
  const sidebarLayerRules = cssRules(globalCssSource, '[data-pi-web-sidebar-glass-layer="true"]');
  const sidebarLayerRule = sidebarLayerRules.find((rule) => /contain:\s*paint/.test(rule)) ?? "";
  const closedSidebarRule = cssRules(globalCssSource, '[data-pi-web-sidebar-glass-layer="true"].sidebar-closed')
    .find((rule) => /backdrop-filter:\s*none/.test(rule)) ?? "";
  const overlayIndex = appShellSource.indexOf('className={`sidebar-overlay-backdrop');
  const sidebarGlassIndex = appShellSource.indexOf('data-pi-web-sidebar-glass-layer="true"');
  const sidebarIndex = appShellSource.indexOf('data-pi-web-sidebar="true"');

  assert.match(hostRule, /isolation:\s*isolate/);
  assert.match(hostRule, /backdrop-filter:\s*none/);
  assert.match(hostRule, /-webkit-backdrop-filter:\s*none/);
  assert.doesNotMatch(hostRule, /will-change/);
  assert.match(pseudoRule, /pointer-events:\s*none/);
  assert.match(pseudoRule, /contain:\s*paint/);
  assert.match(pseudoRule, /backdrop-filter:\s*blur/);
  assert.match(pseudoRule, /-webkit-backdrop-filter:\s*blur/);
  assert.ok(overlayIndex >= 0, "sidebar overlay is missing");
  assert.ok(sidebarGlassIndex > overlayIndex, "sidebar glass must sit above the mobile overlay");
  assert.ok(sidebarIndex > sidebarGlassIndex, "sidebar content must sit above its glass layer");
  assert.doesNotMatch(globalCssSource, /\[data-pi-web-sidebar="true"\]::before/);
  assert.match(sidebarHostRule, /backdrop-filter:\s*none/);
  assert.match(sidebarLayerRule, /pointer-events:\s*none/);
  assert.match(sidebarLayerRule, /contain:\s*paint/);
  assert.match(sidebarLayerRule, /backdrop-filter:\s*blur/);
  assert.match(closedSidebarRule, /backdrop-filter:\s*none/);
  assert.doesNotMatch(appShellSource, /\bbackdropFilter\s*:/);
  assert.doesNotMatch(chatInputSource, /\b(?:backdropFilter|WebkitBackdropFilter)\s*:/);
});
