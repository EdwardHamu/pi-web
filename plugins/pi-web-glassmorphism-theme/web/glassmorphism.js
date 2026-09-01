const STORAGE_KEY = "pi-web-glassmorphism.wallpaper";
const DB_NAME = "pi-web-glassmorphism";
const DB_VERSION = 1;
const DB_STORE = "assets";
const DB_KEY = "wallpaper";
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const WALLPAPER_LAYER_ATTRIBUTE = "data-pi-web-glass-wallpaper-layer";
const CHAT_LAYER_ATTRIBUTE = "data-pi-web-glass-chat-layer";
const CHAT_SURFACE_LAYER_ATTRIBUTE = "data-pi-web-chat-glass-layer";

const FITS = ["cover", "contain", "auto"];
const POSITIONS = [
  "center",
  "top",
  "bottom",
  "left",
  "right",
  "top left",
  "top right",
  "bottom left",
  "bottom right",
];

const DEFAULT_STATE = {
  enabled: false,
  source: "none",
  url: "",
  fit: "cover",
  position: "center",
  overlay: 24,
};

function isRecord(value) {
  return typeof value === "object" && value !== null;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function readState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!isRecord(parsed)) return { ...DEFAULT_STATE };
    return {
      enabled: parsed.enabled === true,
      source: parsed.source === "url" || parsed.source === "file" ? parsed.source : "none",
      url: typeof parsed.url === "string" ? parsed.url.slice(0, 2048) : "",
      fit: FITS.includes(parsed.fit) ? parsed.fit : DEFAULT_STATE.fit,
      position: POSITIONS.includes(parsed.position) ? parsed.position : DEFAULT_STATE.position,
      overlay: typeof parsed.overlay === "number" ? clamp(Math.round(parsed.overlay), 0, 70) : DEFAULT_STATE.overlay,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function persistState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // A private browsing profile may reject localStorage; the current page can
    // still use the wallpaper until it is closed.
  }
}

function cssUrl(url) {
  return `url(${JSON.stringify(url)})`;
}

function labels() {
  const chinese = (document.documentElement.lang || navigator.language || "").toLowerCase().startsWith("zh");
  return chinese ? {
    button: "壁纸",
    title: "自定义壁纸",
    subtitle: "为 Pi Web 设置本地或网络背景，并保持对话内容清晰可读。",
    preview: "Pi Web",
    previewCaption: "预览当前壁纸和遮罩效果",
    enable: "启用壁纸",
    local: "本地图片",
    localCaption: "支持常见图片格式，单个文件最大 20 MB。",
    choose: "选择图片",
    clear: "清除",
    url: "图片 URL",
    urlCaption: "仅允许 HTTP 或 HTTPS 地址。",
    apply: "应用",
    fit: "适配方式",
    cover: "铺满",
    contain: "完整显示",
    auto: "原始尺寸",
    position: "位置",
    center: "居中",
    top: "顶部",
    bottom: "底部",
    left: "左侧",
    right: "右侧",
    topLeft: "左上",
    topRight: "右上",
    bottomLeft: "左下",
    bottomRight: "右下",
    overlay: "可读性遮罩",
    overlayCaption: "在复杂图片上提高文字和输入区的对比度。",
    close: "关闭",
    noImage: "请先选择图片或应用图片 URL。",
    invalidUrl: "请输入有效的 HTTP 或 HTTPS 图片地址。",
    loading: "正在加载图片…",
    urlApplied: "网络壁纸已应用。",
    fileApplied: "本地壁纸已应用，并已保存到此浏览器。",
    fileFailed: "无法读取这张图片，请选择其他文件。",
    fileType: "请选择图片文件。",
    fileSize: "图片不能超过 20 MB。",
    cleared: "壁纸已清除。",
  } : {
    button: "Wallpaper",
    title: "Custom wallpaper",
    subtitle: "Set a local or network background while keeping Pi Web readable.",
    preview: "Pi Web",
    previewCaption: "Preview the wallpaper and readability overlay",
    enable: "Enable wallpaper",
    local: "Local image",
    localCaption: "Common image formats, up to 20 MB per file.",
    choose: "Choose image",
    clear: "Clear",
    url: "Image URL",
    urlCaption: "Only HTTP and HTTPS image URLs are accepted.",
    apply: "Apply",
    fit: "Fit",
    cover: "Cover",
    contain: "Contain",
    auto: "Original size",
    position: "Position",
    center: "Center",
    top: "Top",
    bottom: "Bottom",
    left: "Left",
    right: "Right",
    topLeft: "Top left",
    topRight: "Top right",
    bottomLeft: "Bottom left",
    bottomRight: "Bottom right",
    overlay: "Readability overlay",
    overlayCaption: "Increase contrast over complex images.",
    close: "Close",
    noImage: "Choose an image or apply an image URL first.",
    invalidUrl: "Enter a valid HTTP or HTTPS image URL.",
    loading: "Loading image...",
    urlApplied: "Network wallpaper applied.",
    fileApplied: "Local wallpaper applied and saved in this browser.",
    fileFailed: "This image could not be read. Choose another file.",
    fileType: "Choose an image file.",
    fileSize: "Images must be smaller than 20 MB.",
    cleared: "Wallpaper cleared.",
  };
}

function openDatabase() {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB unavailable"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open wallpaper storage"));
  });
}

async function readWallpaperBlob() {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(DB_KEY);
    request.onsuccess = () => {
      database.close();
      resolve(request.result instanceof Blob ? request.result : null);
    };
    request.onerror = () => {
      database.close();
      reject(request.error || new Error("Unable to read wallpaper storage"));
    };
  });
}

async function writeWallpaperBlob(blob) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(DB_STORE, "readwrite").objectStore(DB_STORE).put(blob, DB_KEY);
    request.onsuccess = () => {
      database.close();
      resolve();
    };
    request.onerror = () => {
      database.close();
      reject(request.error || new Error("Unable to save wallpaper storage"));
    };
  });
}

async function deleteWallpaperBlob() {
  try {
    const database = await openDatabase();
    await new Promise((resolve, reject) => {
      const request = database.transaction(DB_STORE, "readwrite").objectStore(DB_STORE).delete(DB_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error("Unable to remove wallpaper storage"));
    });
    database.close();
  } catch {
    // Optional cached files must never block clearing the visible wallpaper.
  }
}

function preloadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timeout = window.setTimeout(() => reject(new Error("Image loading timed out")), 12000);
    image.onload = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    image.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("Image could not be read"));
    };
    image.src = url;
  });
}

function normalizeUrl(value) {
  const raw = value.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw, window.location.href);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function makeWallpaperLayer() {
  let layer = document.querySelector(`[${WALLPAPER_LAYER_ATTRIBUTE}]`);
  if (!layer) {
    layer = document.createElement("div");
    layer.setAttribute(WALLPAPER_LAYER_ATTRIBUTE, "true");
    layer.setAttribute("aria-hidden", "true");
    document.body.prepend(layer);
  }
  return layer;
}

function updatePreview(panel, state, activeUrl) {
  if (!panel) return;
  const image = panel.querySelector(".pi-web-glass-preview-image");
  const enabled = panel.querySelector('[data-wallpaper-control="enabled"]');
  const url = panel.querySelector('[data-wallpaper-control="url"]');
  const fit = panel.querySelector('[data-wallpaper-control="fit"]');
  const position = panel.querySelector('[data-wallpaper-control="position"]');
  const overlay = panel.querySelector('[data-wallpaper-control="overlay"]');
  const overlayValue = panel.querySelector(".pi-web-glass-range-value");
  if (enabled) enabled.checked = state.enabled;
  if (url) url.value = state.source === "url" ? state.url : "";
  if (fit) fit.value = state.fit;
  if (position) position.value = state.position;
  if (overlay) overlay.value = String(state.overlay);
  if (overlayValue) overlayValue.textContent = `${state.overlay}%`;
  if (image) {
    image.style.backgroundImage = activeUrl ? cssUrl(activeUrl) : "none";
    image.style.backgroundSize = state.fit;
    image.style.backgroundPosition = state.position;
  }
}

export function apply() {
  const text = labels();
  let state = readState();
  let activeUrl = null;
  let activeObjectUrl = null;
  let loadToken = 0;
  let trigger = null;
  let overlay = null;
  let panel = null;
  let chatLayer = null;
  let chatHost = null;
  let chatColumn = null;
  let observer = null;
  let domReadyHandler = null;
  let disposed = false;
  let statusMessage = "";
  let statusTone = "";

  function releaseObjectUrl() {
    if (activeObjectUrl) {
      URL.revokeObjectURL(activeObjectUrl);
      activeObjectUrl = null;
    }
  }

  function setStatus(message, tone = "") {
    statusMessage = message;
    statusTone = tone;
    const status = panel?.querySelector(".pi-web-glass-panel-status");
    if (status) {
      status.textContent = message;
      status.dataset.tone = tone;
    }
  }

  function renderWallpaper() {
    if (disposed || !document.body) return;
    const shouldShow = state.enabled && activeUrl;
    if (!shouldShow) {
      document.body.removeAttribute("data-pi-web-glass-wallpaper");
      if (document.querySelector(`[${WALLPAPER_LAYER_ATTRIBUTE}]`)) {
        document.querySelector(`[${WALLPAPER_LAYER_ATTRIBUTE}]`).remove();
      }
      syncChatGlassLayer();
      updatePreview(panel, state, activeUrl);
      return;
    }

    const layer = makeWallpaperLayer();
    layer.style.setProperty("--pi-web-glass-wallpaper-image", cssUrl(activeUrl));
    layer.style.setProperty("--pi-web-glass-wallpaper-overlay", String(state.overlay / 100));
    layer.style.backgroundSize = state.fit;
    layer.style.backgroundPosition = state.position;
    document.body.setAttribute("data-pi-web-glass-wallpaper", "on");
    updatePreview(panel, state, activeUrl);
    syncChatGlassLayer();
  }

  function removeChatGlassLayer() {
    if (chatLayer && !chatLayer.hasAttribute(CHAT_SURFACE_LAYER_ATTRIBUTE)) chatLayer.remove();
    chatLayer = null;
    chatHost = null;
    chatColumn = null;
    document.querySelectorAll(`[${CHAT_LAYER_ATTRIBUTE}]`).forEach((node) => {
      if (!node.hasAttribute(CHAT_SURFACE_LAYER_ATTRIBUTE)) node.remove();
    });
  }

  function layoutChatGlassLayer() {
    if (!chatLayer || !chatHost || !chatColumn) return;
    if (chatLayer.hasAttribute(CHAT_SURFACE_LAYER_ATTRIBUTE)) return;
    if (!chatHost.isConnected || !chatColumn.isConnected) {
      removeChatGlassLayer();
      return;
    }
    const hostRect = chatHost.getBoundingClientRect();
    const columnRect = chatColumn.getBoundingClientRect();
    chatLayer.style.left = `${Math.round(columnRect.left)}px`;
    chatLayer.style.top = `${Math.round(hostRect.top)}px`;
    chatLayer.style.width = `${Math.max(0, Math.round(columnRect.width))}px`;
    chatLayer.style.height = `${Math.max(0, Math.round(hostRect.height))}px`;
  }

  function syncChatGlassLayer() {
    if (disposed || document.body?.dataset.piWebGlassWallpaper !== "on") {
      removeChatGlassLayer();
      return;
    }
    const surfaceLayer = document.querySelector(`[${CHAT_SURFACE_LAYER_ATTRIBUTE}]`);
    if (surfaceLayer) {
      // ChatWindow owns this fixed-size sibling layer. Reusing it avoids a
      // second backdrop-filter surface and keeps streaming DOM changes out of
      // the plugin's geometry bookkeeping.
      if (chatLayer !== surfaceLayer) removeChatGlassLayer();
      chatLayer = surfaceLayer;
      chatHost = null;
      chatColumn = null;
      return;
    }
    const column = document.querySelector("[data-pi-web-message-column]");
    const host = document.querySelector("[data-pi-web-chat-scroll]");
    if (!column || !host) {
      removeChatGlassLayer();
      return;
    }
    if (column !== chatColumn || host !== chatHost) {
      removeChatGlassLayer();
      chatColumn = column;
      chatHost = host;
      chatLayer = document.createElement("div");
      chatLayer.setAttribute(CHAT_LAYER_ATTRIBUTE, "true");
      chatLayer.setAttribute("aria-hidden", "true");
      document.body.append(chatLayer);
    }
    layoutChatGlassLayer();
  }

  function closePanel() {
    if (overlay) overlay.hidden = true;
  }

  function openPanel() {
    if (!overlay) createPanel();
    if (overlay) overlay.hidden = false;
    updatePreview(panel, state, activeUrl);
  }

  function createPanel() {
    overlay = document.createElement("div");
    overlay.setAttribute("data-pi-web-glass-wallpaper-overlay", "true");
    overlay.hidden = true;
    overlay.innerHTML = `
      <section data-pi-web-glass-wallpaper-panel role="dialog" aria-modal="true" aria-labelledby="pi-web-glass-title">
        <header class="pi-web-glass-panel-header">
          <div>
            <h2 class="pi-web-glass-panel-title" id="pi-web-glass-title">${text.title}</h2>
            <p class="pi-web-glass-panel-subtitle">${text.subtitle}</p>
          </div>
          <button class="pi-web-glass-close" type="button" data-wallpaper-action="close" aria-label="${text.close}">×</button>
        </header>
        <div class="pi-web-glass-panel-body">
          <div class="pi-web-glass-preview" aria-live="polite">
            <div class="pi-web-glass-preview-image"></div>
            <div class="pi-web-glass-preview-content">
              <span class="pi-web-glass-preview-label">${text.preview}</span>
              <span class="pi-web-glass-panel-caption">${text.previewCaption}</span>
            </div>
          </div>
          <div class="pi-web-glass-panel-section">
            <label class="pi-web-glass-panel-row pi-web-glass-panel-label">
              <span>${text.enable}</span>
                <input id="pi-web-glass-wallpaper-enabled" name="wallpaper-enabled" type="checkbox" data-wallpaper-control="enabled">
            </label>
          </div>
          <div class="pi-web-glass-panel-section">
            <div class="pi-web-glass-panel-row">
              <div>
                <div class="pi-web-glass-panel-label">${text.local}</div>
                <div class="pi-web-glass-panel-caption">${text.localCaption}</div>
              </div>
              <div class="pi-web-glass-panel-actions">
                <button class="pi-web-glass-button" type="button" data-wallpaper-action="file">${text.choose}</button>
                <button class="pi-web-glass-button pi-web-glass-button-danger" type="button" data-wallpaper-action="clear">${text.clear}</button>
              </div>
            </div>
            <input id="pi-web-glass-wallpaper-file" name="wallpaper-file" type="file" accept="image/*" data-wallpaper-control="file" hidden>
          </div>
          <div class="pi-web-glass-panel-section">
            <div class="pi-web-glass-panel-label">${text.url}</div>
            <div class="pi-web-glass-panel-caption">${text.urlCaption}</div>
            <div class="pi-web-glass-panel-actions">
              <input id="pi-web-glass-wallpaper-url" name="wallpaper-url" class="pi-web-glass-url" type="url" inputmode="url" autocomplete="off" placeholder="https://example.com/wallpaper.jpg" data-wallpaper-control="url">
              <button class="pi-web-glass-button pi-web-glass-button-primary" type="button" data-wallpaper-action="url">${text.apply}</button>
            </div>
          </div>
          <div class="pi-web-glass-panel-section">
            <label class="pi-web-glass-panel-field">
              <span class="pi-web-glass-panel-label">${text.fit}</span>
              <select id="pi-web-glass-wallpaper-fit" name="wallpaper-fit" class="pi-web-glass-select" data-wallpaper-control="fit">
                <option value="cover">${text.cover}</option>
                <option value="contain">${text.contain}</option>
                <option value="auto">${text.auto}</option>
              </select>
            </label>
            <label class="pi-web-glass-panel-field">
              <span class="pi-web-glass-panel-label">${text.position}</span>
              <select id="pi-web-glass-wallpaper-position" name="wallpaper-position" class="pi-web-glass-select" data-wallpaper-control="position">
                <option value="center">${text.center}</option>
                <option value="top">${text.top}</option>
                <option value="bottom">${text.bottom}</option>
                <option value="left">${text.left}</option>
                <option value="right">${text.right}</option>
                <option value="top left">${text.topLeft}</option>
                <option value="top right">${text.topRight}</option>
                <option value="bottom left">${text.bottomLeft}</option>
                <option value="bottom right">${text.bottomRight}</option>
              </select>
            </label>
          </div>
          <div class="pi-web-glass-panel-section">
            <div class="pi-web-glass-panel-label">${text.overlay}</div>
            <div class="pi-web-glass-panel-caption">${text.overlayCaption}</div>
            <div class="pi-web-glass-panel-field">
              <input id="pi-web-glass-wallpaper-overlay" name="wallpaper-overlay" class="pi-web-glass-range" type="range" min="0" max="70" step="1" data-wallpaper-control="overlay">
              <output class="pi-web-glass-range-value">24%</output>
            </div>
          </div>
          <p class="pi-web-glass-panel-status" role="status" aria-live="polite"></p>
        </div>
        <footer class="pi-web-glass-panel-footer">
          <span class="pi-web-glass-panel-caption">${text.subtitle}</span>
          <button class="pi-web-glass-button" type="button" data-wallpaper-action="close">${text.close}</button>
        </footer>
      </section>`;
    document.body.append(overlay);
    panel = overlay.querySelector("[data-pi-web-glass-wallpaper-panel]");
    bindPanelEvents();
    updatePreview(panel, state, activeUrl);
    if (statusMessage) setStatus(statusMessage, statusTone);
  }

  function bindPanelEvents() {
    const enabled = panel.querySelector('[data-wallpaper-control="enabled"]');
    const file = panel.querySelector('[data-wallpaper-control="file"]');
    const url = panel.querySelector('[data-wallpaper-control="url"]');
    const fit = panel.querySelector('[data-wallpaper-control="fit"]');
    const position = panel.querySelector('[data-wallpaper-control="position"]');
    const range = panel.querySelector('[data-wallpaper-control="overlay"]');

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closePanel();
    });
    overlay.querySelectorAll('[data-wallpaper-action="close"]').forEach((button) => {
      button.addEventListener("click", closePanel);
    });
    overlay.querySelector('[data-wallpaper-action="file"]')?.addEventListener("click", () => file.click());
    overlay.querySelector('[data-wallpaper-action="clear"]')?.addEventListener("click", clearWallpaper);
    overlay.querySelector('[data-wallpaper-action="url"]')?.addEventListener("click", () => useWallpaperUrl(url.value));
    file.addEventListener("change", () => {
      const selected = file.files?.[0];
      file.value = "";
      if (selected) void useWallpaperFile(selected);
    });
    url.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void useWallpaperUrl(url.value);
      }
    });
    enabled.addEventListener("change", () => {
      state.enabled = enabled.checked;
      if (state.enabled && !activeUrl) {
        if (state.source === "file" || state.source === "url") void restoreWallpaperAsset();
        else setStatus(text.noImage, "error");
      }
      persistState(state);
      renderWallpaper();
    });
    fit.addEventListener("change", () => {
      if (FITS.includes(fit.value)) state.fit = fit.value;
      persistState(state);
      renderWallpaper();
    });
    position.addEventListener("change", () => {
      if (POSITIONS.includes(position.value)) state.position = position.value;
      persistState(state);
      renderWallpaper();
    });
    range.addEventListener("input", () => {
      state.overlay = clamp(Number.parseInt(range.value, 10) || 0, 0, 70);
      persistState(state);
      renderWallpaper();
    });
  }

  async function useWallpaperUrl(value) {
    const normalized = normalizeUrl(value);
    if (!normalized) {
      setStatus(text.invalidUrl, "error");
      return;
    }
    const token = ++loadToken;
    setStatus(text.loading);
    try {
      await preloadImage(normalized);
    } catch {
      if (token === loadToken) setStatus(text.fileFailed, "error");
      return;
    }
    if (token !== loadToken || disposed) return;
    releaseObjectUrl();
    activeUrl = normalized;
    state.source = "url";
    state.url = normalized;
    state.enabled = true;
    persistState(state);
    await deleteWallpaperBlob();
    renderWallpaper();
    setStatus(text.urlApplied, "success");
  }

  async function useWallpaperFile(file) {
    if (!file.type.startsWith("image/")) {
      setStatus(text.fileType, "error");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setStatus(text.fileSize, "error");
      return;
    }

    const token = ++loadToken;
    const objectUrl = URL.createObjectURL(file);
    setStatus(text.loading);
    try {
      await preloadImage(objectUrl);
    } catch {
      URL.revokeObjectURL(objectUrl);
      if (token === loadToken) setStatus(text.fileFailed, "error");
      return;
    }
    if (token !== loadToken || disposed) {
      URL.revokeObjectURL(objectUrl);
      return;
    }

    releaseObjectUrl();
    activeObjectUrl = objectUrl;
    activeUrl = objectUrl;
    state.source = "file";
    state.url = "";
    state.enabled = true;
    persistState(state);
    renderWallpaper();
    try {
      await writeWallpaperBlob(file);
      if (token === loadToken) setStatus(text.fileApplied, "success");
    } catch {
      if (token === loadToken) setStatus(text.fileApplied, "error");
    }
  }

  async function restoreWallpaperAsset() {
    const token = ++loadToken;
    if (state.source === "file") {
      try {
        const blob = await readWallpaperBlob();
        if (!blob) {
          setStatus(text.noImage, "error");
          return;
        }
        const objectUrl = URL.createObjectURL(blob);
        await preloadImage(objectUrl);
        if (token !== loadToken || disposed) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        releaseObjectUrl();
        activeObjectUrl = objectUrl;
        activeUrl = objectUrl;
        renderWallpaper();
      } catch {
        setStatus(text.fileFailed, "error");
      }
      return;
    }

    if (state.source === "url" && state.url) {
      const normalized = normalizeUrl(state.url);
      if (!normalized) {
        setStatus(text.invalidUrl, "error");
        return;
      }
      try {
        await preloadImage(normalized);
        if (token !== loadToken || disposed) return;
        activeUrl = normalized;
        state.url = normalized;
        renderWallpaper();
      } catch {
        setStatus(text.fileFailed, "error");
      }
    }
  }

  async function clearWallpaper() {
    ++loadToken;
    releaseObjectUrl();
    activeUrl = null;
    state = { ...DEFAULT_STATE };
    persistState(state);
    await deleteWallpaperBlob();
    renderWallpaper();
    setStatus(text.cleared, "success");
  }

  function installTrigger() {
    const topbar = document.querySelector("[data-pi-web-topbar] > div:first-child");
    if (!topbar) return;
    if (trigger?.isConnected) return;
    trigger?.remove();
    trigger = document.createElement("button");
    trigger.type = "button";
    trigger.setAttribute("data-pi-web-glass-wallpaper-trigger", "true");
    trigger.setAttribute("aria-label", text.button);
    trigger.title = text.button;
    trigger.style.cssText = "display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;padding:0;border:0;border-left:1px solid var(--border);background:none;color:var(--text-muted);cursor:pointer;flex-shrink:0";
    trigger.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.4"/><path d="m4 17 5-5 3 3 3-3 5 5"/></svg>`;
    trigger.addEventListener("click", openPanel);
    topbar.append(trigger);
  }

  function handleKeydown(event) {
    if (event.key === "Escape" && overlay && !overlay.hidden) closePanel();
  }

  function initialize() {
    if (disposed) return;
    installTrigger();
    createPanel();
    window.addEventListener("keydown", handleKeydown);
    window.addEventListener("resize", layoutChatGlassLayer, { passive: true });
    window.visualViewport?.addEventListener("resize", layoutChatGlassLayer, { passive: true });
    observer = new MutationObserver((mutations) => {
      let shellChanged = false;
      let topbarChanged = false;
      for (const mutation of mutations) {
        for (const node of [...mutation.addedNodes, ...mutation.removedNodes]) {
          if (!(node instanceof Element)) continue;
          if (
            node.matches("[data-pi-web-chat-glass-layer], [data-pi-web-chat-scroll], [data-pi-web-message-column]")
            || node.querySelector("[data-pi-web-chat-glass-layer], [data-pi-web-chat-scroll], [data-pi-web-message-column]")
          ) shellChanged = true;
          if (
            node.matches("[data-pi-web-topbar]")
            || node.querySelector("[data-pi-web-topbar]")
          ) topbarChanged = true;
        }
      }
      if (shellChanged) syncChatGlassLayer();
      if (topbarChanged && !trigger?.isConnected) installTrigger();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    if (state.enabled) void restoreWallpaperAsset();
    syncChatGlassLayer();
    renderWallpaper();
  }

  if (document.readyState === "loading") {
    domReadyHandler = initialize;
    document.addEventListener("DOMContentLoaded", domReadyHandler, { once: true });
  } else {
    initialize();
  }

  return () => {
    disposed = true;
    ++loadToken;
    if (domReadyHandler) {
      document.removeEventListener("DOMContentLoaded", domReadyHandler);
      domReadyHandler = null;
    }
    observer?.disconnect();
    window.removeEventListener("keydown", handleKeydown);
    window.removeEventListener("resize", layoutChatGlassLayer);
    window.visualViewport?.removeEventListener("resize", layoutChatGlassLayer);
    trigger?.remove();
    overlay?.remove();
    removeChatGlassLayer();
    releaseObjectUrl();
    activeUrl = null;
    document.body?.removeAttribute("data-pi-web-glass-wallpaper");
    document.querySelector(`[${WALLPAPER_LAYER_ATTRIBUTE}]`)?.remove();
  };
}
