import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextResponse } from "next/server";
import { getAllowedFileRoots, isExistingFilePathAllowed } from "@/lib/file-access";
import { findPiWebAsset, type PiWebAssetKind } from "@/lib/pi-web-themes";
import { isApiRequestAllowed } from "@/lib/request-security";

export const dynamic = "force-dynamic";

function readKind(value: string | null): PiWebAssetKind | null {
  return value === "style" || value === "script" ? value : null;
}

export async function GET(request: Request) {
  if (!isApiRequestAllowed(request)) {
    return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const requestedCwd = params.get("cwd");
  const kind = readKind(params.get("kind"));
  const source = params.get("source");
  const scope = params.get("scope") === "project" ? "project" : params.get("scope") === "global" ? "global" : null;
  const assetPath = params.get("path");
  if (!requestedCwd || !kind || !source || !scope || !assetPath) {
    return NextResponse.json({ error: "Invalid web theme asset request" }, { status: 400 });
  }

  const cwd = resolve(requestedCwd);
  const allowedRoots = await getAllowedFileRoots();
  if (!isExistingFilePathAllowed(cwd, allowedRoots)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  try {
    const asset = await findPiWebAsset(cwd, {
      kind,
      source,
      scope,
      path: assetPath,
    });
    if (!asset) return NextResponse.json({ error: "Web theme asset not found" }, { status: 404 });

    const content = readFileSync(asset.path);
    return new Response(content, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": kind === "style" ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
