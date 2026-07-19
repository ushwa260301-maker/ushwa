/**
 * Debug-mode feature flag.
 *
 * The Debug Panel (OCR 검증 화면) is developer-only and MUST be off for
 * regular end users. This module gates every debug-only DOM element via a
 * single `<html class="debug-mode">` class + `.debug-only` visibility rule
 * in `css/modal.css`.
 *
 * Enable / disable in one of three ways:
 *
 *   1. URL param:      https://…/?debug=1        (persists to localStorage)
 *                       https://…/?debug=0        (clears)
 *   2. JS console:     window.enableDebug(true)
 *                       window.toggleDebug()
 *   3. Keyboard:       Ctrl+Shift+D               (toggle)
 *
 * The flag is read once at boot; toggling live rewrites the class immediately
 * so any wizard already open shows / hides its debug section instantly.
 */

const KEY = "species-catalog:debug";

/**
 * Read the flag.
 * URL param wins for the current pageload (and persists to localStorage);
 * otherwise localStorage is the source of truth.
 * @returns {boolean}
 */
export function isDebugEnabled() {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has("debug")) {
      const v = (url.searchParams.get("debug") || "").toLowerCase();
      const on = v === "" || v === "1" || v === "true" || v === "on" || v === "yes";
      writeStorage(on);
      return on;
    }
    return readStorage();
  } catch { return false; }
}

/** Persist the flag and reflect it on `<html>`. */
export function setDebug(on) {
  const flag = !!on;
  writeStorage(flag);
  applyClass(flag);
  return flag;
}

/** Flip the flag, return the new state. */
export function toggleDebug() {
  return setDebug(!isDebugEnabled());
}

/**
 * Wire keyboard + `window.enableDebug()` + `window.toggleDebug()`.
 * Sets the `<html class="debug-mode">` state from the current flag.
 * Idempotent — safe to call once at app boot.
 */
export function initDebugFlag() {
  applyClass(isDebugEnabled());
  window.enableDebug = setDebug;
  window.toggleDebug = toggleDebug;
  document.addEventListener("keydown", e => {
    if (e.ctrlKey && e.shiftKey && (e.key === "D" || e.key === "d")) {
      e.preventDefault();
      const now = toggleDebug();
      console.log(`[debug] ${now ? "enabled" : "disabled"}`);
    }
  });
}

// ----------------------------------------------------------------
// Internals
// ----------------------------------------------------------------

function readStorage() {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}
function writeStorage(on) {
  try { localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* ignore */ }
}
function applyClass(on) {
  document.documentElement.classList.toggle("debug-mode", !!on);
}
