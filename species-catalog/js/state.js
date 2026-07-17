/**
 * Central mutable app state. Modules import this and read/write; renders
 * are driven by explicit calls to ui.render() after mutation.
 *
 * Kept intentionally simple (a plain object) so the code is easy to follow.
 * If reactivity becomes necessary, swap this file for a proper store —
 * every consumer imports `{ state }` from here and nothing else, so the
 * migration surface is small.
 */

/** Persistent catalog data (seeded from data/species.json, then user-editable). */
export const state = {
  data: {
    categories: [],
    colors: [],
    species: []
  },
  filters: {
    search: "",
    months: new Set(),      // string values ("1"…"12"), matches DOM textContent
    categories: new Set(),
    colors: new Set(),
    supplier: "",
    minPrice: null,
    maxPrice: null
  },
  sort: "name",             // name | priceAsc | priceDesc | bloomEarly
  editingId: null           // species id being edited in the modal, or null
};

/** Per-modal-session working state (kept separate so the main state stays clean). */
export const formState = {
  months: new Set(),        // strings, mirrors filter's convention
  colors: new Set()
};

/** Restore filter state to defaults. Called by the Reset button. */
export function resetFilters() {
  state.filters.search = "";
  state.filters.months.clear();
  state.filters.categories.clear();
  state.filters.colors.clear();
  state.filters.supplier = "";
  state.filters.minPrice = null;
  state.filters.maxPrice = null;
}
