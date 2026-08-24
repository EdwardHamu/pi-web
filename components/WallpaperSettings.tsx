"use client";

import { useRef, useState } from "react";
import type { WallpaperController } from "@/hooks/useWallpaper";
import { useI18n } from "@/hooks/useI18n";

type Props = {
  open: boolean;
  wallpaper: WallpaperController;
  onClose: () => void;
};

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 16V3" />
      <path d="m7 8 5-5 5 5" />
      <path d="M5 21h14a2 2 0 0 0 2-2v-4" />
      <path d="M3 15v4a2 2 0 0 0 2 2" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

export function WallpaperSettings({ open, wallpaper, onClose }: Props) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);

  if (!open) return null;

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    const result = await wallpaper.upload(file);
    if (result.ok) {
      setStatus(null);
      return;
    }
    setStatus(t(`wallpaper.error.${result.error}`));
  };

  const isCustom = wallpaper.source === "custom";
  const previewBrightness = Math.max(0.3, 1 - wallpaper.overlay / 100);

  return (
    <div
      data-pi-web-wallpaper-settings="true"
      role="presentation"
      style={{
        position: "fixed",
        top: "max(64px, calc(env(safe-area-inset-top) + 16px))",
        left: "50%",
        width: "min(420px, calc(100vw - 32px))",
        maxHeight: "calc(var(--app-viewport-height, 100dvh) - 80px)",
        zIndex: 900,
        transform: "translateX(-50%)",
        overflowY: "auto",
        pointerEvents: "auto",
      }}
    >
      <section
        role="dialog"
        aria-labelledby="wallpaper-settings-title"
        data-pi-web-wallpaper-settings-panel="true"
        style={{
          width: "100%",
          border: "1px solid var(--border)",
          borderRadius: 8,
          overflow: "hidden",
          color: "var(--text)",
        }}
      >
        <header style={{ height: 44, padding: "0 10px 0 14px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)" }}>
          <h2 id="wallpaper-settings-title" style={{ margin: 0, fontSize: 13, fontWeight: 650 }}>{t("wallpaper.title")}</h2>
          <button
            type="button"
            onClick={onClose}
            title={t("wallpaper.close")}
            aria-label={t("wallpaper.close")}
            style={{ width: 30, height: 30, padding: 0, display: "grid", placeItems: "center", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
          >
            <CloseIcon />
          </button>
        </header>

        <div style={{ padding: 14, display: "grid", gap: 16 }}>
          <div data-pi-web-wallpaper-preview="true" style={{ position: "relative", height: 160, overflow: "hidden", border: "1px solid var(--border)", borderRadius: 6 }}>
            {/* Uploaded wallpapers use Blob URLs, which Next's image optimizer cannot serve. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={wallpaper.imageUrl}
              alt=""
              style={{ width: "100%", height: "100%", display: "block", objectFit: "cover", filter: `brightness(${previewBrightness})` }}
            />
            <div style={{ position: "absolute", left: 10, bottom: 9, color: "#f8fafc", fontSize: 12, fontWeight: 650, pointerEvents: "none" }}>
              Pi Web
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 8 }}>
            <button
              type="button"
              onClick={() => { wallpaper.selectDefault(); setStatus(null); }}
              aria-pressed={!isCustom}
              title={t("wallpaper.default")}
              style={{
                minHeight: 40,
                padding: "0 10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
                border: "1px solid var(--border)",
                borderRadius: 5,
                color: !isCustom ? "var(--text)" : "var(--text-muted)",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" />
              </svg>
              <span>{t("wallpaper.default")}</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title={t("wallpaper.upload")}
              style={{
                minHeight: 40,
                padding: "0 10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
                border: "1px solid var(--border)",
                borderRadius: 5,
                color: isCustom ? "var(--text)" : "var(--text-muted)",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              <UploadIcon />
              <span>{t("wallpaper.upload")}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              tabIndex={-1}
              aria-hidden="true"
              style={{ display: "none" }}
              onChange={(event) => {
                void handleUpload(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </div>

          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--text-muted)", fontSize: 12 }}>
              <span>{t("wallpaper.overlay")}</span>
              <span style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>{wallpaper.overlay}%</span>
            </span>
            <input
              data-pi-web-wallpaper-overlay="true"
              type="range"
              min="0"
              max="70"
              step="1"
              value={wallpaper.overlay}
              aria-label={t("wallpaper.overlay")}
              onChange={(event) => wallpaper.setOverlay(Number(event.target.value))}
              style={{ width: "100%", accentColor: "var(--text)" }}
            />
          </label>

          <div style={{ minHeight: 22, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span role="status" style={{ minWidth: 0, color: "#fca5a5", fontSize: 11, overflowWrap: "anywhere" }}>{status}</span>
            {isCustom && (
              <button
                type="button"
                onClick={() => { void wallpaper.clearCustom(); setStatus(null); }}
                title={t("wallpaper.reset")}
                aria-label={t("wallpaper.reset")}
                style={{ width: 30, height: 30, display: "grid", placeItems: "center", padding: 0, border: "1px solid var(--border)", borderRadius: 5, color: "var(--text-muted)", cursor: "pointer", flex: "0 0 auto" }}
              >
                <ResetIcon />
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
