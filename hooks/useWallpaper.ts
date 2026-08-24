"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SETTINGS_STORAGE_KEY = "pi-web-wallpaper-settings";
const DATABASE_NAME = "pi-web-wallpapers";
const DATABASE_VERSION = 1;
const STORE_NAME = "assets";
const CUSTOM_WALLPAPER_KEY = "custom-wallpaper";
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const DEFAULT_WALLPAPER_URL = "/misty-lake-wallpaper.png";

type WallpaperSource = "default" | "custom";

type StoredWallpaperSettings = {
  source: WallpaperSource;
  overlay: number;
};

export type WallpaperUploadResult =
  | { ok: true }
  | { ok: false; error: "type" | "size" | "storage" };

export type WallpaperController = {
  imageUrl: string;
  overlay: number;
  source: WallpaperSource;
  setOverlay: (overlay: number) => void;
  selectDefault: () => void;
  upload: (file: File) => Promise<WallpaperUploadResult>;
  clearCustom: () => Promise<void>;
};

const DEFAULT_SETTINGS: StoredWallpaperSettings = {
  source: "default",
  overlay: 34,
};

function clampOverlay(value: number): number {
  return Math.min(70, Math.max(0, Math.round(value)));
}

function readSettings(): StoredWallpaperSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<StoredWallpaperSettings>;
    return {
      source: parsed.source === "custom" ? "custom" : "default",
      overlay: typeof parsed.overlay === "number" ? clampOverlay(parsed.overlay) : DEFAULT_SETTINGS.overlay,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function persistSettings(settings: StoredWallpaperSettings): void {
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage restrictions should not prevent the current session from changing its wallpaper.
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open wallpaper storage"));
  });
}

async function getStoredWallpaper(): Promise<Blob | null> {
  const database = await openDatabase();
  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(CUSTOM_WALLPAPER_KEY);
      request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
      request.onerror = () => reject(request.error ?? new Error("Unable to read wallpaper storage"));
    });
  } finally {
    database.close();
  }
}

async function storeWallpaper(file: Blob): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(file, CUSTOM_WALLPAPER_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("Unable to save wallpaper storage"));
    });
  } finally {
    database.close();
  }
}

async function removeStoredWallpaper(): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(CUSTOM_WALLPAPER_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("Unable to remove wallpaper storage"));
    });
  } finally {
    database.close();
  }
}

export function useWallpaper(): WallpaperController {
  // Keep the first client render identical to SSR. Browser-local wallpaper
  // preferences are applied after hydration below.
  const [settings, setSettings] = useState<StoredWallpaperSettings>(() => ({ ...DEFAULT_SETTINGS }));
  const [customUrl, setCustomUrl] = useState<string | null>(null);
  const customUrlRef = useRef<string | null>(null);

  const replaceCustomUrl = useCallback((nextUrl: string | null) => {
    if (customUrlRef.current) URL.revokeObjectURL(customUrlRef.current);
    customUrlRef.current = nextUrl;
    setCustomUrl(nextUrl);
  }, []);

  useEffect(() => {
    let disposed = false;
    const stored = readSettings();
    setSettings(stored);

    if (stored.source === "custom") {
      void getStoredWallpaper()
        .then((blob) => {
          if (disposed || !blob) return;
          replaceCustomUrl(URL.createObjectURL(blob));
        })
        .catch(() => {
          if (disposed) return;
          const next = { ...stored, source: "default" as const };
          setSettings(next);
          persistSettings(next);
        });
    }

    return () => {
      disposed = true;
      if (customUrlRef.current) URL.revokeObjectURL(customUrlRef.current);
    };
  }, [replaceCustomUrl]);

  const updateSettings = useCallback((updater: (current: StoredWallpaperSettings) => StoredWallpaperSettings) => {
    setSettings((current) => {
      const next = updater(current);
      persistSettings(next);
      return next;
    });
  }, []);

  const setOverlay = useCallback((overlay: number) => {
    updateSettings((current) => ({ ...current, overlay: clampOverlay(overlay) }));
  }, [updateSettings]);

  const selectDefault = useCallback(() => {
    updateSettings((current) => ({ ...current, source: "default" }));
  }, [updateSettings]);

  const upload = useCallback(async (file: File): Promise<WallpaperUploadResult> => {
    if (!file.type.startsWith("image/")) return { ok: false, error: "type" };
    if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "size" };

    replaceCustomUrl(URL.createObjectURL(file));
    updateSettings((current) => ({ ...current, source: "custom" }));

    try {
      await storeWallpaper(file);
      return { ok: true };
    } catch {
      return { ok: false, error: "storage" };
    }
  }, [replaceCustomUrl, updateSettings]);

  const clearCustom = useCallback(async () => {
    replaceCustomUrl(null);
    updateSettings((current) => ({ ...current, source: "default" }));
    try {
      await removeStoredWallpaper();
    } catch {
      // Clearing the active image still succeeds when IndexedDB is unavailable.
    }
  }, [replaceCustomUrl, updateSettings]);

  return {
    imageUrl: settings.source === "custom" && customUrl ? customUrl : DEFAULT_WALLPAPER_URL,
    overlay: settings.overlay,
    source: settings.source,
    setOverlay,
    selectDefault,
    upload,
    clearCustom,
  };
}
