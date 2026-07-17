/**
 * Pure utility functions and shared constants.
 * No DOM access, no state access — safe to import anywhere.
 */

/** 1..12 as an ordered array (used by month grids and heatmaps). */
export const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/** Fixed swatch colors for standard bloom colors. Unknown colors fall back to HSL. */
export const COLOR_MAP = {
  "백색": "#f2f0e6",
  "황색": "#e8b937",
  "적색": "#c33a2a",
  "분홍": "#e58ab0",
  "자색": "#8551a3",
  "청색": "#3f6cb0",
  "주황": "#e0803a",
  "혼색": "linear-gradient(135deg,#e58ab0 0%,#8551a3 50%,#e8b937 100%)"
};

/** djb2-style hash for stable pseudo-color assignment to user-added colors. */
export function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i) | 0;
  return Math.abs(h);
}

/** Return a background value for a color name (fixed if known, hashed HSL otherwise). */
export function colorFor(name) {
  return COLOR_MAP[name] || `hsl(${hash(name) % 360}, 45%, 55%)`;
}

/** HTML-escape helper for values placed via innerHTML. */
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

/** Coerce any input into a length-12 int array (missing/invalid → 0). */
export function normalizeCounts(arr) {
  const out = Array(12).fill(0);
  if (Array.isArray(arr)) {
    for (let i = 0; i < 12; i++) {
      const v = Number(arr[i]);
      out[i] = Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
    }
  }
  return out;
}

/**
 * Map a purchase count to a 0..4 heatmap intensity level (GitHub Contribution
 * style). Thresholds tuned for typical nursery order cadence.
 */
export function freqLevel(n) {
  if (n <= 0) return 0;
  if (n === 1) return 1;
  if (n <= 3) return 2;
  if (n <= 6) return 3;
  return 4;
}

/** Human-format bloom months as "3월 · 4월 · 5월" (or "—" when empty). */
export function formatBloom(months) {
  if (!months || !months.length) return "—";
  return [...months].sort((a, b) => a - b).map(m => `${m}월`).join(" · ");
}

/** Lowest price across a species' 단가표 (Infinity when no prices). */
export function minPriceOf(sp) {
  return sp.prices?.length ? Math.min(...sp.prices.map(p => p.price)) : Infinity;
}

/** Earliest bloom month (13 as a sentinel meaning "no bloom info"). */
export function earliestBloomOf(sp) {
  return sp.bloomMonths?.length ? Math.min(...sp.bloomMonths) : 13;
}

/** Generate the next unique sp-### id for a new species. */
export function nextId(species) {
  const nums = species
    .map(s => (s.id || "").match(/^sp-(\d+)$/))
    .filter(Boolean)
    .map(m => parseInt(m[1], 10));
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return "sp-" + String(n).padStart(3, "0");
}
