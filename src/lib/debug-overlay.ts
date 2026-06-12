// On-screen debug overlay for iPad / WKWebView.
// Renders captured errors, console messages, URL & navigation events directly
// in the page so you can read them without Xcode when the screen is otherwise white.
//
// Activates automatically when:
//   - running inside Capacitor (window.Capacitor.isNativePlatform === true), OR
//   - URL contains ?debug=1
//
// Tap the overlay header to collapse/expand. Tap "Copy" to copy to clipboard.

type Entry = { level: string; msg: string; at: number };

const MAX_ENTRIES = 200;
const entries: Entry[] = [];
let panel: HTMLDivElement | null = null;
let body: HTMLDivElement | null = null;
let installed = false;

function shouldActivate(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("debug") === "1") return true;
  } catch {}
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
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

function mountPanel() {
  if (panel || typeof document === "undefined") return;
  panel = document.createElement("div");
  panel.id = "lov-debug-overlay";
  panel.style.cssText = [
    "position:fixed",
    "left:0",
    "right:0",
    "bottom:0",
    "z-index:2147483647",
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
  urlEl.style.cssText = "font-weight:normal;opacity:0.7;font-size:10px;max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
  urlEl.textContent = window.location.href;
  const copyBtn = document.createElement("button");
  copyBtn.textContent = "Copy";
  copyBtn.style.cssText = "background:#222;color:#0f0;border:1px solid #0f0;padding:2px 8px;font-size:11px";
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

  body = document.createElement("div");
  body.style.cssText =
    "padding:8px 10px;overflow:auto;white-space:pre-wrap;word-break:break-word;flex:1 1 auto;min-height:80px";

  let collapsed = false;
  header.addEventListener("click", () => {
    collapsed = !collapsed;
    body!.style.display = collapsed ? "none" : "block";
    panel!.style.maxHeight = collapsed ? "auto" : "50vh";
  });

  header.append(title, urlEl, copyBtn, clearBtn);
  panel.append(header, body);

  const attach = () => document.body && document.body.appendChild(panel!);
  if (document.body) attach();
  else document.addEventListener("DOMContentLoaded", attach);

  // Keep URL display in sync with SPA navigation
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
  if (!shouldActivate()) return;
  installed = true;

  mountPanel();

  push("info", [
    "Debug overlay active",
    `\nUA: ${navigator.userAgent}`,
    `\nURL: ${window.location.href}`,
  ]);

  // Patch console
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

  // Network failure logging
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
