/**
 * Purchase-statistics computation from InvoiceItem records.
 *
 * The data model stores raw purchase events (Invoice + InvoiceItem) and
 * derives *every* per-species statistic on the fly. The card, filter, and
 * sort code all read the enriched species object produced by
 * `enrichSpecies()`, so downstream modules never need to know that these
 * values are computed rather than stored.
 *
 * All functions here are pure: they take arrays and return primitives
 * or arrays. No DOM, no state, no side effects.
 */

/**
 * @typedef {{id:string, invoiceDate:string, supplier:string, supplierAddress:string, supplierPhone:string, invoiceNumber:string, createdAt:string}} Invoice
 * @typedef {{id:string, invoiceId:string, speciesId:string, speciesName:string, spec:string, unit:string, quantity:number, unitPrice:number, amount:number}} InvoiceItem
 * @typedef {{id:string, name:string, latin:string, category:string, bloomMonths:number[], colors:string[], suppliers:Array<{name,region,contact}>, notes:string}} Species
 */

// ============================================================
// Individual stat functions — as spec'd
// ============================================================

/**
 * 가격 통계의 대상이 되는 행만 남긴다 — 단가 0원 제외.
 *
 * 거래명세서의 "서비스" 품목은 단가·금액이 0이다. 그 행은 거래 이력으로는
 * 반드시 보존해야 하지만(원본 재현), **가격 통계에 넣으면 값을 망가뜨린다**:
 *   평균가  0원 행이 분모에 들어가 평균을 끌어내린다
 *   최저가  Math.min 이 0 을 집어 "최저 0원"이 된다
 * 예전에는 저장 단계에서 0원 행을 아예 지워 왜곡을 피했는데, 그 대가로
 * 원본 7건짜리 명세서가 DB 에 5건으로 들어갔다(실환경 inv-073).
 * 이제 저장은 원본대로 하고, 걸러내는 일은 여기서만 한다.
 *
 * 구매 횟수·최근 구매일·주 거래처는 서비스 품목도 실제 거래이므로
 * 제외하지 않는다 — 가격 계산에만 적용한다.
 *
 * @param {InvoiceItem[]} items
 * @returns {InvoiceItem[]}
 */
function pricedItems(items) {
  return (items || []).filter(it => Number(it.unitPrice || 0) > 0);
}

/**
 * Recent average unit price across the given invoice items.
 * Returns null when there are no items so the UI can show "정보 없음".
 * 단가 0원(서비스) 행은 제외한다 — `pricedItems()` 참조.
 * @param {InvoiceItem[]} items
 * @returns {number|null}
 */
export function calculateAveragePrice(items) {
  const priced = pricedItems(items);
  if (priced.length === 0) return null;
  const sum = priced.reduce((a, it) => a + Number(it.unitPrice || 0), 0);
  return Math.round(sum / priced.length);
}

/**
 * Lowest unit price ever paid. 단가 0원(서비스) 행은 제외한다.
 * @param {InvoiceItem[]} items
 * @returns {number|null}
 */
export function calculateMinPrice(items) {
  const priced = pricedItems(items);
  if (priced.length === 0) return null;
  return Math.min(...priced.map(it => Number(it.unitPrice)));
}

/**
 * Highest unit price ever paid. 단가 0원(서비스) 행은 제외한다.
 * @param {InvoiceItem[]} items
 * @returns {number|null}
 */
export function calculateMaxPrice(items) {
  const priced = pricedItems(items);
  if (priced.length === 0) return null;
  return Math.max(...priced.map(it => Number(it.unitPrice)));
}

/**
 * Total purchase count = sum of item quantities.
 * @param {InvoiceItem[]} items
 * @returns {number}
 */
export function calculatePurchaseFrequency(items) {
  if (!items || items.length === 0) return 0;
  return items.reduce((a, it) => a + Number(it.quantity || 1), 0);
}

/**
 * Most recent purchase date (YYYY-MM-DD) among invoices referenced by items.
 * @param {InvoiceItem[]} items
 * @param {Invoice[]} invoices
 * @returns {string|null}
 */
export function calculateLastPurchase(items, invoices) {
  if (!items || items.length === 0) return null;
  const invoiceById = new Map(invoices.map(inv => [inv.id, inv]));
  const dates = items
    .map(it => invoiceById.get(it.invoiceId)?.invoiceDate)
    .filter(Boolean)
    .sort();
  return dates.length ? dates[dates.length - 1] : null;
}

/**
 * Supplier that appears in the most invoices for this species.
 * Ties broken by first-seen order.
 * @param {InvoiceItem[]} items
 * @param {Invoice[]} invoices
 * @returns {string|null}
 */
export function calculateMainSupplier(items, invoices) {
  if (!items || items.length === 0) return null;
  const invoiceById = new Map(invoices.map(inv => [inv.id, inv]));
  const counts = new Map();
  for (const it of items) {
    const inv = invoiceById.get(it.invoiceId);
    if (!inv?.supplier) continue;
    counts.set(inv.supplier, (counts.get(inv.supplier) || 0) + Number(it.quantity || 1));
  }
  let best = null, bestCount = -1;
  for (const [name, cnt] of counts) {
    if (cnt > bestCount) { best = name; bestCount = cnt; }
  }
  return best;
}

/**
 * Monthly purchase count array of length 12 (index 0 = January … 11 = December).
 * The value at index m is the sum of quantities from invoices whose
 * `invoiceDate` month equals (m+1).
 *
 * This is what feeds the GitHub-Contribution-style heatmap on the card.
 *
 * @param {InvoiceItem[]} items
 * @param {Invoice[]} invoices
 * @returns {number[]} length 12
 */
export function calculateMonthlyPurchaseHeatmap(items, invoices) {
  const counts = Array(12).fill(0);
  if (!items || items.length === 0) return counts;
  const invoiceById = new Map(invoices.map(inv => [inv.id, inv]));
  for (const it of items) {
    const inv = invoiceById.get(it.invoiceId);
    if (!inv?.invoiceDate) continue;
    const month = Number(inv.invoiceDate.slice(5, 7));
    if (month >= 1 && month <= 12) {
      counts[month - 1] += Number(it.quantity || 1);
    }
  }
  return counts;
}

// ============================================================
// Aggregations used by the card UI
// ============================================================

/**
 * Group items by (spec, unit) and return one row per unique combo showing
 * the most recent unit price. Feeds the "단가표" table on the card.
 *
 * Sorted by earliest invoice date (so the display order tends to match the
 * chronological order of first purchase).
 *
 * @param {InvoiceItem[]} items
 * @param {Invoice[]} invoices
 * @returns {Array<{spec:string, unit:string, price:number}>}
 */
export function calculatePriceTable(items, invoices) {
  const priced = pricedItems(items);          // 서비스(0원) 행은 규격별 단가표에 넣지 않는다
  if (priced.length === 0) return [];
  const invoiceById = new Map(invoices.map(inv => [inv.id, inv]));
  // Group by "spec|unit"; keep both the latest price and the earliest date
  const grouped = new Map();
  for (const it of priced) {
    const key = `${it.spec}|${it.unit}`;
    const inv = invoiceById.get(it.invoiceId);
    const date = inv?.invoiceDate || "";
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { spec: it.spec, unit: it.unit, price: it.unitPrice, latestDate: date, firstDate: date });
    } else {
      if (date && date >= existing.latestDate) {
        existing.price = it.unitPrice;
        existing.latestDate = date;
      }
      if (date && (!existing.firstDate || date < existing.firstDate)) {
        existing.firstDate = date;
      }
    }
  }
  return [...grouped.values()]
    .sort((a, b) => a.firstDate.localeCompare(b.firstDate))
    .map(({ spec, unit, price }) => ({ spec, unit, price }));
}

/**
 * Most recent unit price paid, regardless of spec.
 * @param {InvoiceItem[]} items
 * @param {Invoice[]} invoices
 * @returns {number|null}
 */
export function calculateRecentPrice(items, invoices) {
  const priced = pricedItems(items);          // 서비스(0원) 행은 "최근 단가"가 될 수 없다
  if (priced.length === 0) return null;
  const invoiceById = new Map(invoices.map(inv => [inv.id, inv]));
  let bestDate = "", bestPrice = null;
  for (const it of priced) {
    const d = invoiceById.get(it.invoiceId)?.invoiceDate;
    if (!d) continue;
    if (d >= bestDate) { bestDate = d; bestPrice = Number(it.unitPrice || 0); }
  }
  return bestPrice;
}

// ============================================================
// Enrichment — the single call every renderer uses
// ============================================================

/**
 * Return the items belonging to a species.
 * @param {string} speciesId
 * @param {InvoiceItem[]} invoiceItems
 */
export function itemsForSpecies(speciesId, invoiceItems) {
  return invoiceItems.filter(it => it.speciesId === speciesId);
}

/**
 * Produce a "display-ready" species object that overlays computed stats
 * onto the raw Species record. The card / filter / sort code reads the
 * result without knowing (or caring) that these fields are derived:
 *
 *   sp.prices          — array of { spec, unit, price } for the 단가표
 *   sp.purchaseCounts  — length-12 monthly count array for the heatmap
 *   sp.scientificName  — alias of sp.latin (kept for card template legacy)
 *   sp.stats           — { avg, min, max, total, lastPurchase, mainSupplier, recent }
 *
 * The original raw fields (name, latin, category, bloomMonths, colors,
 * suppliers, notes) are copied as-is.
 *
 * @param {Species} sp
 * @param {Invoice[]} invoices
 * @param {InvoiceItem[]} invoiceItems
 */
export function enrichSpecies(sp, invoices, invoiceItems) {
  const items = itemsForSpecies(sp.id, invoiceItems);
  return {
    ...sp,
    // Legacy alias so the existing card template can keep reading .scientificName
    scientificName: sp.latin,
    // Derived fields that mimic the shape the old model stored directly
    prices: calculatePriceTable(items, invoices),
    purchaseCounts: calculateMonthlyPurchaseHeatmap(items, invoices),
    // Bundle of stats for any callers that want them explicitly
    stats: {
      avgPrice: calculateAveragePrice(items),
      minPrice: calculateMinPrice(items),
      maxPrice: calculateMaxPrice(items),
      recentPrice: calculateRecentPrice(items, invoices),
      total: calculatePurchaseFrequency(items),
      lastPurchase: calculateLastPurchase(items, invoices),
      mainSupplier: calculateMainSupplier(items, invoices)
    }
  };
}

/**
 * Bulk-enrich an entire species list.
 * @param {Species[]} species
 * @param {Invoice[]} invoices
 * @param {InvoiceItem[]} invoiceItems
 */
export function enrichAllSpecies(species, invoices, invoiceItems) {
  return species.map(sp => enrichSpecies(sp, invoices, invoiceItems));
}
