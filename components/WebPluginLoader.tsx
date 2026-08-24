"use client";

import { useEffect } from "react";
import type { PiWebThemesResponse } from "@/lib/api-types";

type AppliedPlugin = {
  cleanup?: () => void | Promise<void>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCleanup(value: unknown): value is () => void | Promise<void> {
  return typeof value === "function";
}

async function waitForStylesheets(links: HTMLLinkElement[]): Promise<void> {
  await Promise.all(links.map((link) => new Promise<void>((resolve) => {
    if (link.sheet) {
      resolve();
      return;
    }
    const finish = () => {
      link.removeEventListener("load", finish);
      link.removeEventListener("error", finish);
      resolve();
    };
    link.addEventListener("load", finish, { once: true });
    link.addEventListener("error", finish, { once: true });
  })));
}

export function WebPluginLoader({ cwd }: { cwd: string | null }) {
  useEffect(() => {
    if (!cwd) return;

    let requestController: AbortController | null = null;
    let generation = 0;
    let links: HTMLLinkElement[] = [];
    let applied: AppliedPlugin[] = [];
    let disposed = false;

    const cleanupResources = () => {
      for (const plugin of applied.reverse()) {
        const result = plugin.cleanup?.();
        if (result instanceof Promise) void result.catch(() => {});
      }
      applied = [];
      for (const link of links) link.remove();
      links = [];
    };

    const load = async () => {
      const currentGeneration = ++generation;
      requestController?.abort();
      requestController = new AbortController();
      cleanupResources();

      const response = await fetch(`/api/plugins/web?cwd=${encodeURIComponent(cwd)}`, {
        cache: "no-store",
        signal: requestController.signal,
      });
      const data: PiWebThemesResponse & { error?: string } = await response.json();
      if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`);
      if (disposed || currentGeneration !== generation) return;

      for (const asset of data.styles) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = asset.url;
        link.dataset.piWebThemeAsset = asset.url;
        document.head.append(link);
        links.push(link);
      }
      await waitForStylesheets(links);
      if (disposed || currentGeneration !== generation) return;

      for (const asset of data.scripts) {
        const plugin = await import(/* webpackIgnore: true */ asset.url) as unknown;
        if (disposed || currentGeneration !== generation) return;
        if (!isRecord(plugin)) continue;
        const apply = plugin.apply ?? plugin.default;
        if (typeof apply !== "function") continue;
        const cleanup = await (apply as (context: {
          cwd: string;
          source: string;
          scope: string;
          packageName: string;
          styleUrls: string[];
        }) => unknown)({
          cwd,
          source: asset.source,
          scope: asset.scope,
          packageName: asset.packageName,
          styleUrls: data.styles.map((style) => style.url),
        });
        if (isCleanup(cleanup)) {
          if (disposed || currentGeneration !== generation) {
            const result = cleanup();
            if (result instanceof Promise) void result.catch(() => {});
            return;
          }
          applied.push({ cleanup });
        }
      }
    };

    const loadWithDiagnostics = () => {
      void load().catch((error: unknown) => {
        if (!disposed && !(error instanceof DOMException && error.name === "AbortError")) {
          console.warn("Pi Web theme plugin failed to load:", error);
        }
      });
    };
    const handlePluginChange = () => {
      loadWithDiagnostics();
    };

    window.addEventListener("pi-web-plugins-changed", handlePluginChange);
    loadWithDiagnostics();

    return () => {
      disposed = true;
      ++generation;
      requestController?.abort();
      window.removeEventListener("pi-web-plugins-changed", handlePluginChange);
      cleanupResources();
    };
  }, [cwd]);

  return null;
}
