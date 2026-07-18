/**
 * Application entry point.
 *
 * Bootstraps the app:
 *   1. Cache DOM elements
 *   2. Load persisted data (or fetch seed on first run)
 *   3. Initialize the species modal
 *   4. Wire toolbar + filter-rail events
 *   5. First render
 *
 * Business-logic mutations flow through the helpers here (saveSpecies,
 * deleteSpecies, persistAndRerender) so persistence + re-rendering stay
 * consistent regardless of who triggered the change.
 */

import { state, resetFilters } from "./state.js";
import { storage } from "./storage.js";
import { loadSeed, exportJson, importJson } from "./importExport.js";
import { cacheElements, els, render, refreshFilterUi, toast, toggleTheme } from "./ui.js";
import { initModal, openModal } from "./modal.js";
import { initInvoiceModal, openInvoiceModal } from "./invoiceModal.js";
import { initHistoryModal, openHistoryModal } from "./historyModal.js";
import { nextId } from "./utils.js";

// ============================================================
// Business-logic mutation helpers
// ============================================================

/**
 * Persist a species from the modal.
 *
 * The modal's form is (visually) the same as before, but the payload now
 * splits into two shapes: metadata that lives on the Species record, and
 * `prices` + `purchaseCounts` that describe purchase history.
 *
 * On save we:
 *   1. Extract Species metadata (name, latin, category, colors, bloom,
 *      suppliers, notes) and upsert the Species record.
 *   2. Drop every InvoiceItem tied to this species — plus any invoice
 *      that then holds no items at all.
 *   3. Rebuild invoices + items from the form's `prices` + `purchaseCounts`
 *      via `synthesizeInvoicesForSpecies()`.
 *
 * This keeps the modal's UX identical while shifting the storage to the
 * new normalized model.
 */
function saveSpecies(payload, id) {
  const meta = extractSpeciesMeta(payload);
  let speciesId = id;
  if (id) {
    const idx = state.data.species.findIndex(s => s.id === id);
    if (idx >= 0) {
      state.data.species[idx] = { ...state.data.species[idx], ...meta, id };
      toast("수정되었습니다");
    }
  } else {
    speciesId = nextId("sp", state.data.species);
    state.data.species.push({ id: speciesId, ...meta });
    toast("추가되었습니다");
  }

  // Drop old invoice items + orphaned invoices for this species.
  purgeInvoiceRecordsFor(speciesId);

  // Rebuild from the form's prices + purchaseCounts.
  const synthesized = synthesizeInvoicesForSpecies(
    speciesId,
    meta,
    payload.prices || [],
    payload.purchaseCounts || Array(12).fill(0),
    state.data.invoices,
    state.data.invoiceItems
  );
  state.data.invoices.push(...synthesized.invoices);
  state.data.invoiceItems.push(...synthesized.items);

  persistAndRerender();
}

/** Delete a species and cascade to its invoices/items. */
function deleteSpecies(id) {
  const sp = state.data.species.find(s => s.id === id);
  if (!sp) return;
  if (!confirm(`「${sp.name}」을(를) 삭제하시겠습니까?`)) return;
  state.data.species = state.data.species.filter(s => s.id !== id);
  purgeInvoiceRecordsFor(id);
  toast("삭제되었습니다");
  persistAndRerender();
}

// ============================================================
// Species / invoice write helpers
// ============================================================

/**
 * Extract just the Species-record fields from a modal payload. Everything
 * else in the payload (prices, purchaseCounts) is invoice-derived data.
 */
function extractSpeciesMeta(payload) {
  return {
    name: payload.name,
    latin: payload.latin || "",
    category: payload.category,
    bloomMonths: payload.bloomMonths || [],
    colors: payload.colors || [],
    suppliers: payload.suppliers || [],
    notes: payload.notes || ""
  };
}

/**
 * Remove every InvoiceItem linked to a species, and any Invoice left
 * with zero items after the purge.
 */
function purgeInvoiceRecordsFor(speciesId) {
  state.data.invoiceItems = state.data.invoiceItems.filter(it => it.speciesId !== speciesId);
  const stillReferenced = new Set(state.data.invoiceItems.map(it => it.invoiceId));
  state.data.invoices = state.data.invoices.filter(inv => stillReferenced.has(inv.id));
}

/**
 * Build Invoice + InvoiceItem records from a modal's price rows +
 * purchase-count array.
 *
 * If purchases exist:
 *   - one Invoice per (supplier, month) pair
 *   - items cycle through the price rows and supplier list
 *
 * If purchases are zero but the user typed prices:
 *   - one "catalog" invoice dated today with one item per price row
 *
 * If both are empty: no invoices synthesized.
 */
function synthesizeInvoicesForSpecies(speciesId, sp, prices, counts, existingInvoices, existingItems) {
  const outInvoices = [];
  const outItems = [];
  const suppliers = sp.suppliers?.length
    ? sp.suppliers
    : [{ name: "미지정", region: "", contact: "" }];
  const totalPurchases = counts.reduce((a, b) => a + (Number(b) || 0), 0);

  const nextInvId = idAllocator("inv", existingInvoices, outInvoices);
  const nextItemId = idAllocator("item", existingItems, outItems);
  const nowIso = new Date().toISOString();

  if (totalPurchases > 0 && prices.length) {
    // Group items into (supplier, month) invoices.
    const invByKey = new Map();
    for (let m = 1; m <= 12; m++) {
      const cnt = Number(counts[m - 1]) || 0;
      for (let i = 0; i < cnt; i++) {
        const supplier = suppliers[i % suppliers.length];
        const spec = prices[i % prices.length];
        const key = `${speciesId}|${supplier.name}|${m}`;
        let inv = invByKey.get(key);
        if (!inv) {
          const day = 4 + (i % 24);
          const dateStr = `2025-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          inv = {
            id: nextInvId(),
            invoiceDate: dateStr,
            supplier: supplier.name,
            supplierAddress: supplier.region || "",
            supplierPhone: supplier.contact || "",
            invoiceNumber: `M-${speciesId}-${m}`,
            createdAt: nowIso
          };
          outInvoices.push(inv);
          invByKey.set(key, inv);
        }
        outItems.push({
          id: nextItemId(),
          invoiceId: inv.id,
          speciesId,
          speciesName: sp.name,
          spec: spec.spec,
          unit: spec.unit || "주",
          quantity: 1,
          unitPrice: spec.price,
          amount: spec.price
        });
      }
    }
  } else if (prices.length) {
    // Prices with no purchases → one catalog invoice, one item per row.
    const supplier = suppliers[0];
    const today = nowIso.slice(0, 10);
    const inv = {
      id: nextInvId(),
      invoiceDate: today,
      supplier: supplier.name,
      supplierAddress: supplier.region || "",
      supplierPhone: supplier.contact || "",
      invoiceNumber: `C-${speciesId}`,
      createdAt: nowIso
    };
    outInvoices.push(inv);
    for (const p of prices) {
      outItems.push({
        id: nextItemId(),
        invoiceId: inv.id,
        speciesId,
        speciesName: sp.name,
        spec: p.spec,
        unit: p.unit || "주",
        quantity: 1,
        unitPrice: p.price,
        amount: p.price
      });
    }
  }

  return { invoices: outInvoices, items: outItems };
}

/**
 * Return a function that yields fresh `{prefix}-###` ids, guaranteed to
 * be unique across `existing` records plus any ids already emitted into
 * `pending`.
 */
function idAllocator(prefix, existing, pending) {
  return () => nextId(prefix, [...existing, ...pending]);
}

// ============================================================
// Invoice registration (from 거래명세서 등록 wizard)
// ============================================================

/**
 * Persist an invoice + its items produced by the wizard.
 *
 * For every item we resolve `speciesId`:
 *   - if a Species with the same (trimmed, case-insensitive) name
 *     already exists → link to it,
 *   - otherwise auto-create a minimal Species record with default
 *     fields; the user can flesh it out later via the 수종 modal.
 *
 * @param {{invoiceDate,invoiceNumber,supplier,supplierPhone,supplierAddress}} header
 * @param {Array<{name,spec,unit,quantity,unitPrice,amount}>} items
 * @returns {{invoiceId:string, newSpecies:object[], reusedSpecies:object[]}}
 */
function saveInvoice(header, items) {
  // 1. Resolve each row to a species (create if missing).
  const newSpecies = [];
  const reusedSpecies = [];
  const nextSp = idAllocator("sp", state.data.species, newSpecies);
  const resolved = items.map(it => {
    const trimmed = (it.name || "").trim();
    const match = state.data.species.find(s =>
      (s.name || "").trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (match) {
      if (!reusedSpecies.some(s => s.id === match.id)) reusedSpecies.push(match);
      return { ...it, speciesId: match.id, speciesName: match.name };
    }
    // Create a new Species with default metadata; user can edit later.
    const created = {
      id: nextSp(),
      name: trimmed,
      latin: "",
      category: state.data.categories[0] || "교목",
      bloomMonths: [],
      colors: [],
      suppliers: header.supplier
        ? [{ name: header.supplier, region: header.supplierAddress, contact: header.supplierPhone }]
        : [],
      notes: `${new Date().toISOString().slice(0, 10)} 거래명세서 등록으로 자동 생성`
    };
    newSpecies.push(created);
    state.data.species.push(created);
    return { ...it, speciesId: created.id, speciesName: created.name };
  });

  // 2. Create the Invoice header.
  const invoice = {
    id: nextId("inv", state.data.invoices),
    invoiceDate: header.invoiceDate,
    supplier: header.supplier,
    supplierAddress: header.supplierAddress || "",
    supplierPhone: header.supplierPhone || "",
    invoiceNumber: header.invoiceNumber || "",
    createdAt: new Date().toISOString()
  };
  state.data.invoices.push(invoice);

  // 3. Create InvoiceItem rows.
  const nextItem = idAllocator("item", state.data.invoiceItems, []);
  for (const r of resolved) {
    const quantity = Number(r.quantity) || 1;
    const unitPrice = Number(r.unitPrice) || 0;
    const explicitAmount = Number(r.amount);
    const amount = Number.isFinite(explicitAmount) && explicitAmount > 0
      ? explicitAmount
      : quantity * unitPrice;
    state.data.invoiceItems.push({
      id: nextItem(),
      invoiceId: invoice.id,
      speciesId: r.speciesId,
      speciesName: r.speciesName,
      spec: r.spec || "",
      unit: r.unit || "주",
      quantity,
      unitPrice,
      amount
    });
  }

  persistAndRerender();
  toast(`거래명세서 ${invoice.id} 저장 완료 (품목 ${resolved.length}건)`);
  return { invoiceId: invoice.id, newSpecies, reusedSpecies };
}

/** Save to storage, rebuild filter chips (in case master lists changed), rerender. */
function persistAndRerender() {
  storage.save(state.data);
  refreshFilterUi(rerender);
  rerender();
}

const cardHandlers = {
  onEdit: id => openModal(id),
  onDelete: id => deleteSpecies(id),
  onOpen: id => openHistoryModal(id)
};

function rerender() {
  render(cardHandlers);
}

// ============================================================
// Event wiring
// ============================================================

function wireToolbar() {
  els.addBtn.addEventListener("click", () => openModal(null));
  els.addInvoiceBtn?.addEventListener("click", () => openInvoiceModal());

  els.exportBtn.addEventListener("click", () => {
    exportJson(state.data);
    toast("JSON을 내보냈습니다");
  });

  els.importFile.addEventListener("change", async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await importJson(file);
      if (!confirm(`${parsed.species.length}개 수종으로 덮어씁니다. 계속?`)) return;
      state.data = parsed;
      persistAndRerender();
      toast("가져오기 완료");
    } catch (err) {
      alert("JSON 파싱 실패: " + err.message);
    } finally {
      e.target.value = "";  // Allow re-selecting the same file
    }
  });

  els.resetSeedBtn.addEventListener("click", async () => {
    if (!confirm("모든 사용자 데이터를 지우고 시드 데이터로 초기화합니다. 계속?")) return;
    try {
      const seed = await loadSeed();
      state.data = seed;
      persistAndRerender();
      toast("시드 데이터로 초기화되었습니다");
    } catch (err) {
      alert("시드 파일을 불러올 수 없습니다: " + err.message);
    }
  });

  els.themeToggle.addEventListener("click", toggleTheme);
}

function wireFilterRail() {
  els.searchInput.addEventListener("input", e => {
    state.filters.search = e.target.value.trim();
    rerender();
  });
  els.supplierSelect.addEventListener("change", e => {
    state.filters.supplier = e.target.value;
    rerender();
  });
  els.minPrice.addEventListener("input", e => {
    state.filters.minPrice = e.target.value === "" ? null : Number(e.target.value);
    rerender();
  });
  els.maxPrice.addEventListener("input", e => {
    state.filters.maxPrice = e.target.value === "" ? null : Number(e.target.value);
    rerender();
  });
  els.sortSelect.addEventListener("change", e => {
    state.sort = e.target.value;
    rerender();
  });
  els.resetBtn.addEventListener("click", () => {
    resetFilters();
    els.searchInput.value = "";
    els.minPrice.value = "";
    els.maxPrice.value = "";
    els.supplierSelect.value = "";
    refreshFilterUi(rerender);
    rerender();
  });
}

// ============================================================
// Bootstrap
// ============================================================

async function init() {
  cacheElements();

  // Load persisted data; fall back to fetched seed on first visit.
  let data = storage.load();
  if (!data) {
    try {
      data = await loadSeed();
      storage.save(data);
    } catch (err) {
      console.error("[app] seed load failed:", err);
      alert("데이터를 불러올 수 없습니다. 로컬 서버(python3 -m http.server)로 열어주세요.");
      data = { categories: [], colors: [], species: [] };
    }
  }
  state.data = data;

  initModal({
    onSave: saveSpecies,
    onDelete: deleteSpecies,
    toast
  });

  initInvoiceModal({
    onSave: saveInvoice,
    toast
  });

  initHistoryModal({ toast });

  wireToolbar();
  wireFilterRail();
  refreshFilterUi(rerender);
  rerender();
}

init();
