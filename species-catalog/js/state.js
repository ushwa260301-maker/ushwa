/**
 * Central mutable app state. Modules import this and read/write; renders
 * are driven by explicit calls to ui.render() after mutation.
 *
 * Kept intentionally simple (a plain object) so the code is easy to follow.
 * If reactivity becomes necessary, swap this file for a proper store —
 * every consumer imports `{ state }` from here and nothing else, so the
 * migration surface is small.
 */

/**
 * Persistent catalog data.
 *
 * Since the data-model refactor, this holds *three normalized collections*:
 *   species        — the taxonomy record (id, name, latin, category, …)
 *   invoices       — one per received 거래명세서 (id, invoiceDate, supplier, …)
 *   invoiceItems   — one per line inside an invoice, linked back by
 *                    speciesId + invoiceId.
 *
 * Every purchase-derived statistic (avg / min / max price, monthly heatmap,
 * main supplier, last purchase, …) is computed from these tables via
 * `stats.js`; nothing is stored twice.
 */
export const state = {
  /**
   * 이번 세션이 읽어들인 도메인 데이터의 출처 (app.js `loadCloudFirst` 가 설정).
   *
   *   "CLOUD"        Cloud 를 읽어 채택했다 — 로컬 배열이 서버와 같다.
   *   "LOCAL_CACHE"  Cloud 를 읽지 못했다 — 로컬 배열이 서버보다 **작을 수 있다**.
   *
   * 이 값이 필요한 이유: `nextId()` 는 넘겨받은 배열의 최대 번호 + 1 로
   * 채번한다(utils.js). 로컬이 Cloud 보다 뒤처진 상태에서 채번하면 **이미
   * 쓰인 번호를 다시 발급한다** — 실환경 inv-066~068 · sp-060~063 사고가
   * 정확히 이 경로였다. 그래서 LOCAL_CACHE 에서는 신규 번호 발급을 막는다.
   * 기존 레코드 수정은 번호를 만들지 않으므로 계속 허용한다.
   *
   * 초기값은 보수적으로 LOCAL_CACHE — 첫 로드가 끝나기 전에는 안전을 택한다.
   */
  dataSource: "LOCAL_CACHE",
  data: {
    categories: [],
    colors: [],
    species: [],       // Species records — metadata only
    invoices: [],      // Invoice header records
    invoiceItems: []   // InvoiceItem line records
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
