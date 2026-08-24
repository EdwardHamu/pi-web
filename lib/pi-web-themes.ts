import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  DefaultPackageManager,
  getAgentDir,
  SettingsManager,
  type PackageSource,
} from "@earendil-works/pi-coding-agent";
import { getProjectTrustStatus } from "@/lib/project-trust";
import type { PluginScope } from "@/lib/api-types";

export type PiWebAssetKind = "style" | "script";

export interface PiWebAsset {
  kind: PiWebAssetKind;
  source: string;
  scope: PluginScope;
  packageName: string;
  path: string;
  relativePath: string;
  cacheKey: string;
}

export interface PiWebThemeDiagnostic {
  type: "warning" | "error";
  message: string;
  source?: string;
  path?: string;
}

export interface PiWebAssetsResult {
  assets: PiWebAsset[];
  diagnostics: PiWebThemeDiagnostic[];
  projectResourcesLoaded: boolean;
}

type PackageWebManifest = {
  name?: unknown;
  styles?: unknown;
  scripts?: unknown;
};

function packageKey(source: string, scope: PluginScope): string {
  return `${scope}\0${source}`;
}

function packageSource(entry: PackageSource): string {
  return typeof entry === "string" ? entry : entry.source;
}

function isDisabledPackage(entry: PackageSource): boolean {
  if (typeof entry === "string") return false;
  return (
    Array.isArray(entry.extensions) && entry.extensions.length === 0 &&
    Array.isArray(entry.skills) && entry.skills.length === 0 &&
    Array.isArray(entry.prompts) && entry.prompts.length === 0 &&
    Array.isArray(entry.themes) && entry.themes.length === 0
  );
}

function getDisabledPackages(settingsManager: SettingsManager): Map<string, boolean> {
  const disabled = new Map<string, boolean>();
  for (const entry of settingsManager.getGlobalSettings().packages ?? []) {
    disabled.set(packageKey(packageSource(entry), "global"), isDisabledPackage(entry));
  }
  for (const entry of settingsManager.getProjectSettings().packages ?? []) {
    disabled.set(packageKey(packageSource(entry), "project"), isDisabledPackage(entry));
  }
  return disabled;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readWebManifest(packageRoot: string): PackageWebManifest | null {
  const packageJsonPath = join(packageRoot, "package.json");
  if (!existsSync(packageJsonPath)) return null;

  try {
    const parsed: unknown = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    if (!isRecord(parsed)) return null;
    const manifest = parsed.piWeb ?? parsed["pi-web"];
    return isRecord(manifest) ? manifest as PackageWebManifest : null;
  } catch {
    return null;
  }
}

function readPathList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function isPathInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function resolveAssetPath(
  packageRoot: string,
  requestedPath: string,
  kind: PiWebAssetKind,
): { path: string; relativePath: string; cacheKey: string } | { error: string } {
  const trimmed = requestedPath.trim();
  if (!trimmed || isAbsolute(trimmed)) {
    return { error: "Web theme asset paths must be relative to the package root." };
  }

  const extension = extname(trimmed).toLowerCase();
  const validExtension = kind === "style"
    ? extension === ".css"
    : extension === ".js" || extension === ".mjs";
  if (!validExtension) {
    return { error: `Unsupported ${kind} asset extension: ${trimmed}` };
  }

  try {
    const realRoot = realpathSync(packageRoot);
    const candidate = resolve(packageRoot, trimmed);
    if (!existsSync(candidate) || !statSync(candidate).isFile()) {
      return { error: "Web theme asset does not exist." };
    }
    const realCandidate = realpathSync(candidate);
    if (!isPathInside(realRoot, realCandidate)) {
      return { error: "Web theme asset must stay inside the package root." };
    }
    const stats = statSync(realCandidate);
    if (stats.size > 2 * 1024 * 1024) {
      return { error: "Web theme assets must be smaller than 2 MB." };
    }
    return {
      path: realCandidate,
      relativePath: relative(realRoot, realCandidate),
      cacheKey: `${Math.round(stats.mtimeMs)}-${stats.size}`,
    };
  } catch {
    return { error: "Unable to inspect web theme asset." };
  }
}

export async function loadPiWebAssets(cwd: string): Promise<PiWebAssetsResult> {
  const agentDir = getAgentDir();
  const projectTrust = getProjectTrustStatus(cwd, agentDir);
  const settingsManager = SettingsManager.create(cwd, agentDir, {
    projectTrusted: projectTrust.trusted,
  });
  const packageManager = new DefaultPackageManager({
    cwd,
    agentDir,
    settingsManager,
  });
  const disabledPackages = getDisabledPackages(settingsManager);
  const diagnostics: PiWebThemeDiagnostic[] = [];
  const assets: PiWebAsset[] = [];
  const seenAssets = new Set<string>();

  for (const configured of packageManager.listConfiguredPackages()) {
    const scope: PluginScope = configured.scope === "project" ? "project" : "global";
    if (scope === "project" && !projectTrust.trusted) continue;

    const source = configured.source;
    if (disabledPackages.get(packageKey(source, scope))) continue;
    if (!configured.installedPath) continue;

    const webManifest = readWebManifest(configured.installedPath);
    if (!webManifest) continue;

    const packageName = typeof webManifest.name === "string" && webManifest.name.trim()
      ? webManifest.name.trim()
      : source;
    const declaredAssets: Array<[PiWebAssetKind, string[]]> = [
      ["style", readPathList(webManifest.styles)],
      ["script", readPathList(webManifest.scripts)],
    ];

    for (const [kind, paths] of declaredAssets) {
      for (const requestedPath of paths) {
        const resolved = resolveAssetPath(configured.installedPath, requestedPath, kind);
        if ("error" in resolved) {
          diagnostics.push({
            type: "warning",
            source,
            path: requestedPath,
            message: resolved.error,
          });
          continue;
        }

        const assetKey = `${kind}\0${scope}\0${source}\0${resolved.path}`;
        if (seenAssets.has(assetKey)) continue;
        seenAssets.add(assetKey);
        assets.push({
          kind,
          source,
          scope,
          packageName,
          path: resolved.path,
          relativePath: resolved.relativePath,
          cacheKey: resolved.cacheKey,
        });
      }
    }
  }

  return {
    assets,
    diagnostics,
    projectResourcesLoaded: projectTrust.trusted,
  };
}

export async function findPiWebAsset(
  cwd: string,
  input: Pick<PiWebAsset, "kind" | "source" | "scope" | "path">,
): Promise<PiWebAsset | null> {
  const result = await loadPiWebAssets(cwd);
  return result.assets.find((asset) => (
    asset.kind === input.kind &&
    asset.source === input.source &&
    asset.scope === input.scope &&
    asset.path === input.path
  )) ?? null;
}
