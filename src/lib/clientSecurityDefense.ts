import { loadAuthSession, loadPlanMode } from "./api";

const SECURITY_STYLE_ID = "priva-client-security-css";
const DEBUGGER_INTERVAL_MS = 120;
const DEBUG_ACCESS_STORAGE_KEY = "debug-access-enabled";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/** Whitelist: allow F12 / Inspect / devtools shortcuts on this machine only. */
function isDebugAccessEnabled(): boolean {
  if (!isBrowser()) return false;
  return localStorage.getItem(DEBUG_ACCESS_STORAGE_KEY) === "true";
}

function isJwtLikeToken(token: string): boolean {
  const parts = token.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

/** Authenticated premium session (not Free Trial guest). */
export function isPremiumAuthenticatedClient(): boolean {
  if (!isBrowser()) return false;
  if (loadPlanMode() !== "premium") return false;
  const session = loadAuthSession();
  if (!session?.token || session.token === "trial_guest") return false;
  return isJwtLikeToken(session.token);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest("input, textarea, [contenteditable='true']"));
}

function shouldBlockDevToolsShortcut(event: KeyboardEvent): boolean {
  if (isDebugAccessEnabled()) return false;

  const key = event.key;
  const code = event.code;
  const ctrl = event.ctrlKey;
  const shift = event.shiftKey;
  const meta = event.metaKey;
  const alt = event.altKey;

  if (key === "F12" || code === "F12") return true;

  // View page source
  if ((ctrl && !shift && !alt && (key === "u" || key === "U")) || (meta && alt && (key === "u" || key === "U"))) {
    return true;
  }

  // Inspect / console (Chromium + Firefox + Safari variants)
  if (ctrl && shift && (key === "I" || key === "i" || key === "J" || key === "j" || key === "C" || key === "c")) {
    return true;
  }
  if (meta && alt && (key === "I" || key === "i" || key === "J" || key === "j" || key === "U" || key === "u")) {
    return true;
  }

  return false;
}

function buildSecurityStylesheet(): string {
  return `
    html,
    body,
    #root,
    #app {
      overscroll-behavior-y: none;
      overscroll-behavior: none;
    }

  * {
    -webkit-touch-callout: none !important;
    -webkit-user-select: none !important;
    -khtml-user-select: none !important;
    -moz-user-select: none !important;
    -ms-user-select: none !important;
    user-select: none !important;
  }

  html.priva-premium-ui,
  html.priva-premium-ui * {
    -webkit-user-select: text !important;
    -moz-user-select: text !important;
    -ms-user-select: text !important;
    user-select: text !important;
  }

  input,
  textarea,
  [contenteditable="true"] {
    -webkit-user-select: text !important;
    -moz-user-select: text !important;
    -ms-user-select: text !important;
    user-select: text !important;
    -webkit-touch-callout: default !important;
  }
  `.trim();
}

function injectSecurityStyles(): void {
  let style = document.getElementById(SECURITY_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = SECURITY_STYLE_ID;
    style.setAttribute("data-priva-security", "true");
    document.head.appendChild(style);
  }
  style.textContent = buildSecurityStylesheet();
}

function syncPremiumUiClass(): void {
  document.documentElement.classList.toggle(
    "priva-premium-ui",
    isPremiumAuthenticatedClient(),
  );
}

function applyRootTouchGuards(): void {
  const root = document.documentElement;
  root.style.overscrollBehavior = "none";
  if (document.body) {
    document.body.style.overscrollBehavior = "none";
  }
}

function onContextMenu(event: MouseEvent): void {
  if (isDebugAccessEnabled()) return;
  if (isEditableTarget(event.target)) return;
  event.preventDefault();
}

function onKeyDown(event: KeyboardEvent): void {
  if (!shouldBlockDevToolsShortcut(event)) return;
  event.preventDefault();
  event.stopPropagation();
}

function onMultiTouch(event: TouchEvent): void {
  if (event.touches.length > 1) {
    event.preventDefault();
  }
}

function startDebuggerLoop(): ReturnType<typeof setInterval> {
  return setInterval(() => {
    // eslint-disable-next-line no-debugger
    debugger;
  }, DEBUGGER_INTERVAL_MS);
}

export type ClientSecurityDefenseHandle = {
  refresh: () => void;
  dispose: () => void;
};

/**
 * Desktop + mobile/tablet client hardening (context menu, devtools keys, touch, debugger loop).
 */
export function installClientSecurityDefense(): ClientSecurityDefenseHandle {
  if (!isBrowser()) {
    return { refresh: () => undefined, dispose: () => undefined };
  }

  const isWhitelistedDeveloper =
    typeof window !== "undefined" &&
    localStorage.getItem("PRIVA_DEV_SECRET_BYPASS") === "true";

  if (isWhitelistedDeveloper) {
    // Disarm protections only on explicitly whitelisted browser sessions.
    return { refresh: () => undefined, dispose: () => undefined };
  }

  const debugAccessEnabled = isDebugAccessEnabled();
  injectSecurityStyles();
  applyRootTouchGuards();
  syncPremiumUiClass();

  if (!debugAccessEnabled) {
    document.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown, true);
  }

  document.addEventListener("touchstart", onMultiTouch, { passive: false });
  document.addEventListener("touchmove", onMultiTouch, { passive: false });

  const debuggerTimer = debugAccessEnabled ? null : startDebuggerLoop();

  const onStorage = () => {
    syncPremiumUiClass();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("focus", onStorage);

  const refresh = () => {
    syncPremiumUiClass();
  };

  const dispose = () => {
    if (debuggerTimer) clearInterval(debuggerTimer);
    document.removeEventListener("contextmenu", onContextMenu);
    window.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("touchstart", onMultiTouch);
    document.removeEventListener("touchmove", onMultiTouch);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("focus", onStorage);
    document.documentElement.classList.remove("priva-premium-ui");
    document.getElementById(SECURITY_STYLE_ID)?.remove();
  };

  return { refresh, dispose };
}
