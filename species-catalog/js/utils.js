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

/**
 * Generate the next unique `{prefix}-###` id given the existing records.
 *
 * Usage:
 *   nextId("sp",   state.data.species)        → "sp-013"
 *   nextId("inv",  state.data.invoices)       → "inv-050"
 *   nextId("item", state.data.invoiceItems)   → "item-123"
 *
 * Kept generic so id generation is one function across the three collections.
 * The 2-arg form (prefix, records) is the modern signature; the 1-arg legacy
 * form (records) implicitly uses the "sp" prefix and is kept so any older
 * calls still work.
 */
export function nextId(prefixOrRecords, maybeRecords) {
  const prefix = typeof prefixOrRecords === "string" ? prefixOrRecords : "sp";
  const records = typeof prefixOrRecords === "string" ? maybeRecords : prefixOrRecords;
  const re = new RegExp("^" + escapeRegex(prefix) + "-(\\d+)$");
  const nums = (records || [])
    .map(r => (r.id || "").match(re))
    .filter(Boolean)
    .map(m => parseInt(m[1], 10));
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return prefix + "-" + String(n).padStart(3, "0");
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 거래명세서에서 **저장 대상이 되는 품목 행**을 고른다.
 *
 * 저장 경로(`invoiceModal.saveInvoice`)와 디버그 스냅샷(`debugPanel.projectSave`)이
 * **같은 함수**를 써야 한다. 두 곳이 갈라져 있던 동안 스냅샷은 7건인데 DB 에는
 * 5건이 들어갔고, 감사 기록이 실제 저장과 어긋났다(실환경 inv-073).
 * 여기(leaf 모듈)에 두는 이유는 그 두 모듈이 `invoiceModal → debugPanel`
 * 방향으로 이미 의존하고 있어 한쪽에 두면 순환 참조가 되기 때문이다.
 *
 * **단가 0원을 거르지 않는다.** 거래명세서의 "서비스" 품목은 단가·금액이 0이다.
 * 예전 조건 `unitPrice > 0` 은 그 행을 저장 직전에 지웠다
 * (inv-073 붓들레야 4주·위성류 11주 소실). 거래 이력은 원본대로 보존하고,
 * 가격 왜곡은 통계에서 막는다 — `stats.js` 의 `pricedItems()` 참조.
 *
 * 수량 0은 계속 거른다 — 행만 추가하고 입력하지 않은 빈 행이며, 서비스
 * 품목이라도 수량은 적혀 있다.
 *
 * @param {Array<{name?:string, quantity?:number|string}>} items
 * @returns {Array} 저장 대상 행
 */
export function collectValidItems(items) {
  return (items || []).filter(it =>
    it?.name?.trim() && Number(it.quantity) > 0
  );
}
