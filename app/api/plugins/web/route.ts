import { resolve } from "node:path";
import { NextResponse } from "next/server";
import { getAllowedFileRoots, isExistingFilePathAllowed } from "@/lib/file-access";
import { loadPiWebAssets } from "@/lib/pi-web-themes";
import { isApiRequestAllowed } from "@/lib/request-security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isApiRequestAllowed(request)) {
    return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  }

  const requestedCwd = new URL(request.url).searchParams.get("cwd");
  const cwd = resolve(requestedCwd || process.cwd());
  const allowedRoots = await getAllowedFileRoots();
  if (!isExistingFilePathAllowed(cwd, allowedRoots)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  try {
    const result = await loadPiWebAssets(cwd);
    const assets = result.assets.map((asset) => {
      const params = new URLSearchParams({
        cwd,
        kind: asset.kind,
        source: asset.source,
        scope: asset.scope,
        path: asset.path,
        v: asset.cacheKey,
      });
      return {
        kind: asset.kind,
        source: asset.source,
        scope: asset.scope,
        packageName: asset.packageName,
        relativePath: asset.relativePath,
        url: `/api/plugins/web/asset?${params.toString()}`,
      };
    });

    return NextResponse.json({
      styles: assets.filter((asset) => asset.kind === "style"),
      scripts: assets.filter((asset) => asset.kind === "script"),
      diagnostics: result.diagnostics,
      projectResourcesLoaded: result.projectResourcesLoaded,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
