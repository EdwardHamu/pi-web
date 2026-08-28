import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const tableOverrideStart = css.indexOf(
  'html body [data-pi-web-app="true"][data-pi-web-app="true"][data-pi-web-app="true"] .markdown-table-wrap',
);
const tableOverride = css.slice(tableOverrideStart);

test("markdown table borders override the app-wide border reset", () => {
  assert.ok(tableOverrideStart >= 0);
  assert.match(tableOverride, /\.markdown-table-wrap \{[\s\S]*?border: 1px solid[\s\S]*?!important/);
  assert.match(tableOverride, /\.markdown-table-wrap table \{[\s\S]*?border: 0 !important/);
  assert.match(tableOverride, /\.markdown-table-wrap th,[\s\S]*?\.markdown-table-wrap td \{[\s\S]*?border-bottom: 1px solid[\s\S]*?!important/);
});
