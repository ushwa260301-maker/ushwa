/**
 * UI orchestration layer: element cache, top-level render, filter refresh,
 * toast, theme toggle. Reads from state, doesn't mutate business data.
 *
 * The rest of the app talks to the DOM through this module (plus modal.js
 * for the species editor). Keeps DOM concerns from bleeding into
 * business modules like filter.js / storage.js.
 */

import { state } from "./state.js";
import { applyPipeline } from "./filter.js";
import {
  createCard,
  buildMonthGrid,
  buildChips,
  populateSupplierOptions
} from "./components.js";

/** Cached top-level DOM references. Filled once by cacheElements(). */
export const els = {};

const CACHED_IDS = [
  "cardGrid", "emptyState", "resultCount",
  "searchInput", "monthGrid", "categoryChips", "colorChips",
  "supplierSelect", "minPrice", "maxPrice",
  "sortSelect", "resetBtn", "themeToggle",
  "cardTemplate", "modal", "toast",
  "addBtn", "exportBtn", "importFile", "resetSeedBtn"
];

/** Look up every top-level element the app touches. Call once at startup. */
export function cacheElements() {
  for (const id of CACHED_IDS) els[id] = document.getElementById(id);
}

/**
 * Render the filtered + sorted card grid.
 * @param {{onEdit:(id:string)=>void, onDelete:(id:string)=>void}} handlers
 */
export function render(handlers) {
  const list = applyPipeline(state.data.species, state.filters, state.sort);
  els.resultCount.textContent = list.length;
  els.cardGrid.innerHTML = "";

  if (!list.length) {
    els.emptyState.hidden = false;
    return;
  }
  els.emptyState.hidden = true;

  const frag = document.createDocumentFragment();
  list.forEach(sp => frag.appendChild(createCard(sp, els.cardTemplate, handlers)));
  els.cardGrid.appendChild(frag);
}

/**
 * Rebuild the filter rail. Called after data (or master lists) change so
 * that new categories / colors / suppliers show up as chips or options.
 * @param {Function} onFilterChange usually a re-render callback
 */
export function refreshFilterUi(onFilterChange) {
  buildMonthGrid(els.monthGrid, state.filters.months, onFilterChange);
  buildChips(els.categoryChips, state.data.categories, state.filters.categories, {}, onFilterChange);
  buildChips(els.colorChips, state.data.colors, state.filters.colors, { withSwatch: true }, onFilterChange);
  const prev = els.supplierSelect.value;
  const kept = populateSupplierOptions(els.supplierSelect, state.data.species, prev);
  if (!kept) state.filters.supplier = "";
}

let toastTimer = null;
/**
 * Show a short toast message at the bottom of the screen.
 * @param {string} msg
 * @param {number} [ms=2000]
 */
export function toast(msg, ms = 2000) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, ms);
}

/**
 * Cycle theme: dark ↔ light. If nothing was explicitly chosen yet, pick the
 * opposite of what the OS prefers so the toggle always visibly changes.
 */
export function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next =
    current === "dark" ? "light"
    : current === "light" ? "dark"
    : (matchMedia("(prefers-color-scheme: dark)").matches ? "light" : "dark");
  document.documentElement.setAttribute("data-theme", next);
}
