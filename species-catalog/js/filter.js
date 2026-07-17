/**
 * Filter + sort predicates for the species list.
 * Pure functions — no state, no DOM. Safe to unit-test in isolation.
 */

import { minPriceOf, earliestBloomOf } from "./utils.js";

/**
 * Does a species pass the given filter set?
 * @param {object} sp
 * @param {object} filters state.filters shape
 * @returns {boolean}
 */
export function matches(sp, filters) {
  // Name / scientific-name (`latin`) substring
  if (filters.search) {
    const q = filters.search.toLowerCase();
    const hay = `${sp.name} ${sp.latin || sp.scientificName || ""}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }

  // Bloom-month overlap (any-of)
  if (filters.months.size) {
    const bloom = new Set((sp.bloomMonths || []).map(String));
    if (![...filters.months].some(m => bloom.has(m))) return false;
  }

  // Category exact match (any-of)
  if (filters.categories.size && !filters.categories.has(sp.category)) return false;

  // Color overlap (any-of)
  if (filters.colors.size) {
    const cs = new Set(sp.colors || []);
    if (![...filters.colors].some(c => cs.has(c))) return false;
  }

  // Supplier match by name
  if (filters.supplier && !(sp.suppliers || []).some(s => s.name === filters.supplier)) return false;

  // Price-range: at least one 단가표 entry inside the range
  if (filters.minPrice != null || filters.maxPrice != null) {
    const prices = (sp.prices || []).map(p => p.price);
    if (!prices.length) return false;
    const min = filters.minPrice ?? -Infinity;
    const max = filters.maxPrice ?? Infinity;
    if (!prices.some(p => p >= min && p <= max)) return false;
  }

  return true;
}

/**
 * Sort a species list by one of the supported modes.
 * @param {object[]} species
 * @param {"name"|"priceAsc"|"priceDesc"|"bloomEarly"} sort
 * @returns {object[]} new sorted array (input untouched)
 */
export function sortList(species, sort) {
  const arr = [...species];
  switch (sort) {
    case "priceAsc":
      arr.sort((a, b) => minPriceOf(a) - minPriceOf(b));
      break;
    case "priceDesc":
      arr.sort((a, b) => minPriceOf(b) - minPriceOf(a));
      break;
    case "bloomEarly":
      arr.sort((a, b) => earliestBloomOf(a) - earliestBloomOf(b));
      break;
    default:
      arr.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }
  return arr;
}

/** Convenience: filter + sort in one call. */
export function applyPipeline(species, filters, sort) {
  return sortList(species.filter(sp => matches(sp, filters)), sort);
}
