// On-screen debug overlay for iPad / WKWebView and browser.
//
// Visible toggle:
//   A small floating 🐞 button is always rendered (bottom-right). Tap it to
//   show/hide the overlay. The preference is persisted in localStorage under
//   "lov-debug-overlay" ("on" | "off").
//
// Auto-on by default when:
//   - running inside Capacitor (window.Capacitor.isNativePlatform === true), OR
//   - URL contains ?debug=1
//   - localStorage "lov-debug-overlay" === "on"
//
// Even when the panel is hidden, console / error / fetch hooks remain active
// so messages are captured and visible the moment you open the panel.

type Entry = { level: string; msg: string; at: number };

const MAX_ENTRIES = 200;
const STORAGE_KEY = "lov-debug-overlay";
const entries: Entry[] = [];
let panel: HTMLDivElement | null = null;
let body: HTMLDivElement | null = null;
let toggleBtn: HTMLButtonElement | null = null;
let installed = false;
let visible = false;

function isNative(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

function readStored(): "on" | "off" | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "on" || v === "off" ? v : null;
  } catch {
    return null;
  }
}

function writeStored(v: "on" | "off") {
  try {
    localStorage.setItem(STORAGE_KEY, v);
  } catch {}
}

function defaultVisible(): boolean {
  if (typeof window === "undefined") return false;
  const stored = readStored();
  if (stored) return stored === "on";
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("debug") === "1") return true;
  } catch {}
  return isNative();
}

function fmt(arg: unknown): string {
  if (arg instanceof Error) return `${arg.name}: ${arg.message}\n${arg.stack ?? ""}`;
  if (typeof arg === "string") return arg;
  try {
    return JSON.stringify(arg, null, 2);
  } catch {
    return String(arg);
  }
}

function push(level: string, parts: unknown[]) {
  const msg = parts.map(fmt).join(" ");
  entries.push({ level, msg, at: Date.now() });
  if (entries.length > MAX_ENTRIES) entries.shift();
  render();
}

function render() {
  if (!body) return;
  body.textContent = entries
    .map((e) => {
      const t = new Date(e.at).toISOString().slice(11, 23);
      return `[${t}] ${e.level.toUpperCase()}  ${e.msg}`;
    })
    .join("\n\n");
  body.scrollTop = body.scrollHeight;
}

function applyVisibility() {
  if (panel) panel.style.display = visible ? "flex" : "none";
  if (toggleBtn) {
    toggleBtn.textContent = visible ? "🐞 ×" : "🐞";
    toggleBtn.title = visible ? "Debug-paneel verbergen" : "Debug-paneel tonen";
    toggleBtn.setAttribute("aria-pressed", visible ? "true" : "false");
  }
}

export function setDebugOverlayVisible(next: boolean) {
  visible = next;
  writeStored(next ? "on" : "off");
  applyVisibility();
}

function mountToggleButton() {
  if (toggleBtn || typeof document === "undefined") return;
  toggleBtn = document.createElement("button");
  toggleBtn.id = "lov-debug-toggle";
  toggleBtn.type = "button";
  toggleBtn.style.cssText = [
    "position:fixed",
    "right:10px",
    "bottom:10px",
    "z-index:2147483647",
    "width:44px",
    "height:44px",
    "border-radius:22px",
    "border:1px solid rgba(0,255,0,0.6)",
    "background:rgba(0,0,0,0.75)",
    "color:#0f0",
    "font:14px/1 ui-monospace,SFMono-Regular,Menlo,monospace",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "cursor:pointer",
    "box-shadow:0 2px 8px rgba(0,0,0,0.4)",
    "padding:0",
    "-webkit-tap-highlight-color:transparent",
  ].join(";");
  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setDebugOverlayVisible(!visible);
  });
  const attach = () => document.body && document.body.appendChild(toggleBtn!);
  if (document.body) attach();
  else document.addEventListener("DOMContentLoaded", attach);
}

function mountPanel() {
  if (panel || typeof document === "undefined") return;
  panel = document.createElement("div");
  panel.id = "lov-debug-overlay";
  panel.style.cssText = [
    "position:fixed",
    "left:0",
    "right:0",
    "bottom:64px",
    "z-index:2147483646",
    "max-height:50vh",
    "background:rgba(0,0,0,0.92)",
    "color:#0f0",
    "font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace",
    "border-top:2px solid #0f0",
    "box-shadow:0 -4px 12px rgba(0,0,0,0.5)",
    "display:flex",
    "flex-direction:column",
  ].join(";");

  const header = document.createElement("div");
  header.style.cssText =
    "display:flex;align-items:center;gap:8px;padding:6px 10px;background:#111;color:#0f0;font-weight:bold;flex:0 0 auto";
  const title = document.createElement("span");
  title.textContent = "🐞 Debug";
  title.style.flex = "1";
  const urlEl = document.createElement("span");
  urlEl.style.cssText =
    "font-weight:normal;opacity:0.7;font-size:10px;max-width:50%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
  urlEl.textContent = window.location.href;
  const copyBtn = document.createElement("button");
  copyBtn.textContent = "Copy";
  copyBtn.style.cssText =
    "background:#222;color:#0f0;border:1px solid #0f0;padding:2px 8px;font-size:11px;cursor:pointer";
  copyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const text = entries.map((x) => `[${new Date(x.at).toISOString()}] ${x.level} ${x.msg}`).join("\n");
    navigator.clipboard?.writeText(text).catch(() => {});
  });
  const clearBtn = document.createElement("button");
  clearBtn.textContent = "Clear";
  clearBtn.style.cssText = copyBtn.style.cssText;
  clearBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    entries.length = 0;
    render();
  });
  const hideBtn = document.createElement("button");
  hideBtn.textContent = "Verberg";
  hideBtn.style.cssText = copyBtn.style.cssText;
  hideBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setDebugOverlayVisible(false);
  });

  body = document.createElement("div");
  body.style.cssText =
    "padding:8px 10px;overflow:auto;white-space:pre-wrap;word-break:break-word;flex:1 1 auto;min-height:80px";

  header.append(title, urlEl, copyBtn, clearBtn, hideBtn);
  panel.append(header, body);

  const attach = () => document.body && document.body.appendChild(panel!);
  if (document.body) attach();
  else document.addEventListener("DOMContentLoaded", attach);

  const updateUrl = () => (urlEl.textContent = window.location.href);
  window.addEventListener("popstate", updateUrl);
  window.addEventListener("hashchange", updateUrl);
  const origPush = history.pushState;
  const origReplace = history.replaceState;
  history.pushState = function (...args) {
    const r = origPush.apply(this, args as Parameters<typeof origPush>);
    updateUrl();
    push("nav", ["pushState →", window.location.href]);
    return r;
  };
  history.replaceState = function (...args) {
    const r = origReplace.apply(this, args as Parameters<typeof origReplace>);
    updateUrl();
    push("nav", ["replaceState →", window.location.href]);
    return r;
  };
}

export function installDebugOverlay() {
  if (installed) return;
  if (typeof window === "undefined") return;
  installed = true;

  mountPanel();
  mountToggleButton();
  visible = defaultVisible();
  applyVisibility();

  push("info", [
    "Debug overlay actief",
    `\nUA: ${navigator.userAgent}`,
    `\nURL: ${window.location.href}`,
    `\nNative: ${isNative()}`,
  ]);

  const methods: Array<"log" | "info" | "warn" | "error" | "debug"> = [
    "log",
    "info",
    "warn",
    "error",
    "debug",
  ];
  for (const m of methods) {
    const orig = console[m].bind(console);
    console[m] = (...args: unknown[]) => {
      try {
        push(m, args);
      } catch {}
      orig(...args);
    };
  }

  window.addEventListener("error", (ev) => {
    push("error", [
      `window.onerror: ${ev.message}`,
      `at ${ev.filename}:${ev.lineno}:${ev.colno}`,
      ev.error,
    ]);
  });
  window.addEventListener("unhandledrejection", (ev) => {
    push("error", ["unhandledrejection:", ev.reason]);
  });

  const origFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const url = typeof args[0] === "string" ? args[0] : (args[0] as Request).url;
    try {
      const res = await origFetch(...args);
      if (!res.ok) push("warn", [`fetch ${res.status} ${url}`]);
      return res;
    } catch (err) {
      push("error", [`fetch FAILED ${url}`, err]);
      throw err;
    }
  };
}
