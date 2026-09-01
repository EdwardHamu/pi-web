import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const chatWindowSource = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
const globalCssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const pluginCssSource = await readFile(
  new URL("../plugins/pi-web-glassmorphism-theme/web/glassmorphism.css", import.meta.url),
  "utf8",
);
const pluginJsSource = await readFile(
  new URL("../plugins/pi-web-glassmorphism-theme/web/glassmorphism.js", import.meta.url),
  "utf8",
);

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

test("reuses the React-owned glass layer and filters plugin shell observation", () => {
  assert.match(pluginJsSource, /CHAT_SURFACE_LAYER_ATTRIBUTE = "data-pi-web-chat-glass-layer"/);
  assert.match(pluginJsSource, /document\.querySelector\(`\[\$\{CHAT_SURFACE_LAYER_ATTRIBUTE\}\]\`\)/);
  assert.match(pluginJsSource, /if \(shellChanged\) syncChatGlassLayer\(\)/);
  assert.match(pluginJsSource, /node\.matches\("\[data-pi-web-chat-glass-layer\], \[data-pi-web-chat-scroll\], \[data-pi-web-message-column\]"\)/);
  assert.match(pluginCssSource, /\[data-pi-web-chat-glass-layer="true"\][\s\S]*?contain:\s*paint/);
});
