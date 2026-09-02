import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const chatWindowSource = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
const globalCssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const appShellSource = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");
const chatInputSource = await readFile(new URL("./ChatInput.tsx", import.meta.url), "utf8");
const sessionSidebarSource = await readFile(new URL("./SessionSidebar.tsx", import.meta.url), "utf8");

function cssRule(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...source.replace(/\r\n/g, "\n").matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "g"))];
  return matches.at(-1)?.[1] ?? "";
}

function cssRules(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...source.replace(/\r\n/g, "\n").matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "g"))]
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

test("contains sidebar spinners and live message-column status labels", () => {
  const animationLayerRule = cssRule(globalCssSource, ".pi-web-animation-layer");
  const messageStatusRule = cssRule(
    globalCssSource,
    '[data-pi-web-message-column="true"] .pi-web-animation-layer.running-status-animation',
  );
  const spinnerContainerMatches = [
    ...sessionSidebarSource.matchAll(
      /<span\s+className="pi-web-animation-layer"[\s\S]*?<svg className="running-session-spinner"/g,
    ),
  ];

  assert.match(animationLayerRule, /contain:\s*paint/);
  assert.match(messageStatusRule, /contain:\s*paint/);
  assert.equal(spinnerContainerMatches.length, 2);
  assert.match(
    chatWindowSource,
    /<span className="pi-web-animation-layer running-status-animation">/,
  );
});

test("updates isolated animations on a 250ms discrete cadence", () => {
  const extensionLayerRule = cssRules(globalCssSource, ".extension-widget-update-pulse")
    .find((rule) => /transition:\s*opacity\s+250ms/.test(rule)) ?? "";
  const extensionPulseRule = cssRules(
    globalCssSource,
    ".extension-widget-trigger.is-updating .extension-widget-update-pulse::before",
  ).find((rule) => /animation:\s*extension-widget-update-pulse/.test(rule)) ?? "";
  const statusRule = cssRule(globalCssSource, ".running-status-animation");
  const spinnerRule = cssRule(globalCssSource, ".running-session-spinner");
  const sessionPulseRule = cssRule(globalCssSource, ".running-session-pulse");
  const rippleRule = cssRule(globalCssSource, ".drop-ripple-animation");

  assert.match(extensionLayerRule, /transition:\s*opacity\s+250ms\s+steps\(1,\s*end\)/);
  assert.match(extensionPulseRule, /animation:\s*extension-widget-update-pulse\s+1s\s+steps\(4,\s*end\)\s+infinite\s+alternate/);
  assert.match(statusRule, /animation:\s*pulse\s+1\.5s\s+steps\(6,\s*end\)\s+infinite/);
  assert.match(spinnerRule, /animation:\s*spin\s+1s\s+steps\(4,\s*end\)\s+infinite/);
  assert.match(sessionPulseRule, /animation:\s*session-activity-pulse\s+1\.5s\s+steps\(6,\s*end\)\s+infinite/);
  assert.match(rippleRule, /animation:\s*drop-ripple\s+2\.5s\s+steps\(10,\s*end\)\s+infinite\s+backwards/);
  assert.match(chatWindowSource, /\{\[0,\s*0\.75,\s*1\.5\]\.map\(\(delay\) => \(/);
  assert.doesNotMatch(chatWindowSource, /animate-\[(?:pulse_1\.5s_infinite|drop-ripple_2\.4s_ease-out_infinite_backwards)\]/);
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
