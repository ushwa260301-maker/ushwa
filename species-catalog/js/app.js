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
import { initInvoiceModal, openInvoiceModal, reanalyzeCurrent } from "./invoiceModal.js";
import { initHistoryModal, openHistoryModal, refreshHistoryModal } from "./historyModal.js";
import { initTransactionDetailModal, openTransactionDetailModal } from "./transactionDetailModal.js";
import { initAttachmentViewer, openAttachmentViewer } from "./attachmentViewer.js";
import { initAttachmentStore, putAttachment, deleteAttachmentsForInvoice } from "./attachmentStore.js";
import { matchSpecies } from "./matcher.js";
import { initDebugFlag } from "./debugFlag.js";
import { initDebugPanel } from "./debugPanel.js";
import { initAuthGate } from "./auth.js";
import { mirrorSaveInvoice, mirrorUpdateInvoice, mirrorDeleteInvoice, mirrorSaveSpecies, fetchAll } from "./cloudStore.js";
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
async function saveSpecies(payload, id) {
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

  // Cloud sync (T6 Phase 2) — 수종 기본 정보만 upsert. 로컬에서 재합성된
  // invoice 는 Cloud 재구성하지 않는다(구매 데이터는 invoice CRUD 로 유지 ·
  // 승인 범위). 실패 시 사용자에게 표면화.
  const savedSpecies = state.data.species.find(s => s.id === speciesId);
  if (savedSpecies) reportSync(await mirrorSaveSpecies(savedSpecies), "수종 저장");
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
  // TODO(T6 Phase 2+): Cloud species 삭제는 제외됨. Cloud
  // invoice_items.species_id → species 는 cascade 가 아니고, 로컬 삭제는
  // 연관 invoice/items 도 purge 하므로, FK 및 invoice 관계 삭제 정책을
  // 확정한 뒤 별도 Phase 에서 Cloud 반영한다. 현재는 로컬만 삭제.
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
 * PURE preview of `saveInvoice()`. Runs the exact same species-resolution
 * and id-allocation logic against a snapshot of `state.data` but returns
 * a projected payload **without mutating anything**.
 *
 * Fuels the Debug Panel's "실제 저장될 Invoice / InvoiceItem" tab so a
 * developer can preview the actual DB writes before hitting [저장].
 *
 * @param {{invoiceDate,invoiceNumber,supplier,supplierPhone,supplierAddress}} header
 * @param {Array<object>} items      Wizard-shape items (same input as saveInvoice)
 * @returns {{invoice:object, items:object[], newSpecies:object[], reusedSpecies:object[]}}
 */
function projectInvoiceSave(header, items) {
  const shadowSpecies = state.data.species.slice();
  const newSpecies    = [];
  const reusedSpecies = [];
  const nextSpId  = () => nextId("sp", shadowSpecies);
  const nextInvId = () => nextId("inv", state.data.invoices);
  const pendingItems = [];
  const nextItemId = () => nextId("item", [...state.data.invoiceItems, ...pendingItems]);

  const resolved = items.map(it => {
    const trimmed = (it.name || it.speciesName || "").trim();
    if (it.speciesId) {
      const sp = shadowSpecies.find(s => s.id === it.speciesId);
      if (sp) {
        if (!reusedSpecies.some(s => s.id === sp.id)) reusedSpecies.push(sp);
        return { ...it, speciesId: sp.id, speciesName: sp.name };
      }
    }
    const verdict = matchSpecies(trimmed, shadowSpecies);
    if (verdict.status === "match" && verdict.species) {
      const sp = verdict.species;
      if (!reusedSpecies.some(s => s.id === sp.id)) reusedSpecies.push(sp);
      return { ...it, speciesId: sp.id, speciesName: sp.name };
    }
    const created = {
      id: nextSpId(),
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
    shadowSpecies.push(created);
    return { ...it, speciesId: created.id, speciesName: created.name };
  });

  const invoice = {
    id:              nextInvId(),
    invoiceDate:     header.invoiceDate,
    supplier:        header.supplier,
    supplierAddress: header.supplierAddress || "",
    supplierPhone:   header.supplierPhone   || "",
    invoiceNumber:   header.invoiceNumber   || "",
    createdAt:       new Date().toISOString()
  };

  const projectedItems = resolved.map(r => {
    const quantity  = Number(r.quantity)  || 1;
    const unitPrice = Number(r.unitPrice) || 0;
    const declared  = Number(r.amount);
    const amount    = Number.isFinite(declared) && declared > 0 ? declared : quantity * unitPrice;
    const item = {
      id:          nextItemId(),
      invoiceId:   invoice.id,
      speciesId:   r.speciesId,
      speciesName: r.speciesName,
      spec:        r.spec || "",
      unit:        r.unit || "주",
      quantity,
      unitPrice,
      amount
    };
    pendingItems.push(item);
    return item;
  });

  return { invoice, items: projectedItems, newSpecies, reusedSpecies };
}

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
 * @param {{ file?: File|null, analysis?: object|null }} [extras]
 *   `extras.file` is persisted to IndexedDB and referenced from
 *   `invoice.attachment` (metadata only). `extras.analysis` is the raw
 *   Vision-API JSON — stored on `invoice.analysis` for the viewer's
 *   "AI 분석 결과" tab.
 * @returns {Promise<{invoiceId:string, newSpecies:object[], reusedSpecies:object[]}>}
 */
async function saveInvoice(header, items, extras = {}) {
  // 1. Resolve each row to a Species. Resolution priority:
  //    (a) `it.speciesId` — set by the wizard when the matcher returned
  //        "match" or the user picked a candidate for a "possible" row.
  //    (b) `matchSpecies()` — for untouched rows, run the matcher directly
  //        and honour a "match" verdict.
  //    (c) Otherwise create a new Species with default metadata.
  const newSpecies = [];
  const reusedSpecies = [];
  const nextSp = idAllocator("sp", state.data.species, newSpecies);
  const resolved = items.map(it => {
    const trimmed = (it.name || "").trim();

    // (a) wizard-resolved id
    if (it.speciesId) {
      const sp = state.data.species.find(s => s.id === it.speciesId);
      if (sp) {
        if (!reusedSpecies.some(s => s.id === sp.id)) reusedSpecies.push(sp);
        return { ...it, speciesId: sp.id, speciesName: sp.name };
      }
      // Stale id (species deleted mid-flight) — fall through.
    }

    // (b) matcher fallback
    const verdict = matchSpecies(trimmed, state.data.species);
    if (verdict.status === "match" && verdict.species) {
      const sp = verdict.species;
      if (!reusedSpecies.some(s => s.id === sp.id)) reusedSpecies.push(sp);
      return { ...it, speciesId: sp.id, speciesName: sp.name };
    }

    // (c) create new — "possible" without a user pick and "new" both land here
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

  // 2b. Persist raw AI analysis (for the viewer's compare tab).
  if (extras && extras.analysis) invoice.analysis = extras.analysis;

  // 2c. Persist the original file (image / PDF) to IndexedDB and
  //     stash metadata onto the invoice record. Failures are non-fatal —
  //     the invoice still saves without an attachment.
  if (extras && extras.file) {
    try {
      const meta = await putAttachment({ invoiceId: invoice.id, file: extras.file });
      invoice.attachment = meta;
    } catch (err) {
      console.warn("[saveInvoice] putAttachment failed:", err);
      toast("원본 파일 저장 실패: " + (err?.message || err));
    }
  }

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

  // Cloud dual-write mirror (T6 Phase 2) — 로컬 저장은 위에서 완료됨.
  // 이제 mirror 결과를 await 해 실패를 사용자에게 표면화한다(로컬은 안전).
  {
    const itemRows = state.data.invoiceItems.filter(it => it.invoiceId === invoice.id);
    const refIds   = new Set(itemRows.map(it => it.speciesId).filter(Boolean));
    const refSpecies = state.data.species.filter(s => refIds.has(s.id));
    reportSync(await mirrorSaveInvoice(invoice, itemRows, refSpecies), "거래명세서 저장");
  }

  toast(`거래명세서 ${invoice.id} 저장 완료 (품목 ${resolved.length}건)`);
  return { invoiceId: invoice.id, newSpecies, reusedSpecies };
}

// ============================================================
// Transaction detail — update / delete existing Invoice
// ============================================================

/**
 * Overwrite an existing Invoice + its items from the detail modal.
 *
 *   1. Patch the Invoice header in place (keeps its `id` and `createdAt`).
 *   2. Purge every InvoiceItem tied to this invoice.
 *   3. Recreate items from the supplied list, honoring pre-resolved
 *      `speciesId` when present or falling back to `matchSpecies()` /
 *      auto-create for names that don't yet exist.
 *
 * The rerender that follows recomputes every Species card's stats through
 * `enrichAllSpecies()` (ui.js), so cards + charts are always up to date.
 *
 * @param {string} invoiceId
 * @param {{invoiceDate,invoiceNumber,supplier,supplierPhone,supplierAddress}} header
 * @param {Array<{id?:string, speciesId?:string, speciesName:string, spec:string, unit:string, quantity:number, unitPrice:number, amount:number}>} items
 */
async function updateInvoice(invoiceId, header, items) {
  const inv = state.data.invoices.find(i => i.id === invoiceId);
  if (!inv) { toast("거래를 찾을 수 없습니다"); return; }

  // 1. Patch header
  inv.invoiceDate     = header.invoiceDate;
  inv.invoiceNumber   = header.invoiceNumber   || "";
  inv.supplier        = header.supplier;
  inv.supplierPhone   = header.supplierPhone   || "";
  inv.supplierAddress = header.supplierAddress || "";

  // 2. Purge items belonging to this invoice
  state.data.invoiceItems = state.data.invoiceItems.filter(it => it.invoiceId !== invoiceId);

  // 3. Recreate items, resolving speciesId where needed
  const nextSp   = idAllocator("sp",   state.data.species,      []);
  const nextItem = idAllocator("item", state.data.invoiceItems, []);
  for (const raw of items) {
    let speciesId   = raw.speciesId || null;
    let speciesName = (raw.speciesName || "").trim();

    if (speciesId) {
      const sp = state.data.species.find(s => s.id === speciesId);
      if (!sp) speciesId = null;   // stale id → re-resolve
      else speciesName = sp.name;
    }
    if (!speciesId) {
      const verdict = matchSpecies(speciesName, state.data.species);
      if (verdict.status === "match" && verdict.species) {
        speciesId   = verdict.species.id;
        speciesName = verdict.species.name;
      } else {
        // Auto-create a minimal Species record for a wholly-new name.
        const created = {
          id: nextSp(),
          name: speciesName,
          latin: "",
          category: state.data.categories[0] || "교목",
          bloomMonths: [],
          colors: [],
          suppliers: header.supplier
            ? [{ name: header.supplier, region: header.supplierAddress, contact: header.supplierPhone }]
            : [],
          notes: `${new Date().toISOString().slice(0, 10)} 거래 편집으로 자동 생성`
        };
        state.data.species.push(created);
        speciesId = created.id;
      }
    }

    const quantity  = Math.max(0, Number(raw.quantity)  || 0);
    const unitPrice = Math.max(0, Number(raw.unitPrice) || 0);
    const declared  = Number(raw.amount);
    const amount    = Number.isFinite(declared) && declared > 0 ? declared : quantity * unitPrice;

    state.data.invoiceItems.push({
      id:        nextItem(),
      invoiceId,
      speciesId,
      speciesName,
      spec:      raw.spec || "",
      unit:      raw.unit || "주",
      quantity,
      unitPrice,
      amount
    });
  }

  persistAndRerender();
  refreshHistoryModal();

  // Cloud dual-write mirror (T6 Phase 2) — 동기 로컬 변경은 위에서 완료.
  // version lookup + optimistic update (미러 전이면 save 로 백필) 결과를
  // await 해 실패를 표면화한다.
  {
    const itemRows = state.data.invoiceItems.filter(it => it.invoiceId === invoiceId);
    const refIds   = new Set(itemRows.map(it => it.speciesId).filter(Boolean));
    const refSpecies = state.data.species.filter(s => refIds.has(s.id));
    reportSync(await mirrorUpdateInvoice(inv, itemRows, refSpecies), "거래 수정");
  }
}

/**
 * Read the LocalStorage-persisted Invoice + linked InvoiceItems + linked
 * Species records for a given invoice id. Used by the Debug Panel's
 * "📥 저장 Invoice 다운로드" button and by the E2E test to prove
 * `LocalStorage snapshot === Debug ④ To Be Saved projection`.
 *
 * Returns `null` if the invoice isn't present in state.
 * @param {string} invoiceId
 */
function getSavedInvoiceSnapshot(invoiceId) {
  const inv = state.data.invoices.find(i => i.id === invoiceId);
  if (!inv) return null;
  const items         = state.data.invoiceItems.filter(it => it.invoiceId === invoiceId);
  const linkedIds     = [...new Set(items.map(it => it.speciesId))];
  const linkedSpecies = state.data.species.filter(s => linkedIds.includes(s.id));
  return { invoice: inv, items, linkedSpecies };
}

/**
 * Delete an Invoice and cascade to its items. Any Species is left alone —
 * it may still have items from other invoices; if it becomes empty its
 * stats simply go to zero (the card still renders).
 */
async function deleteInvoice(invoiceId) {
  state.data.invoices     = state.data.invoices.filter(i => i.id !== invoiceId);
  state.data.invoiceItems = state.data.invoiceItems.filter(it => it.invoiceId !== invoiceId);
  persistAndRerender();
  refreshHistoryModal();
  // Cascade to IndexedDB — best-effort, fire and forget.
  deleteAttachmentsForInvoice(invoiceId).catch(err =>
    console.warn("[deleteInvoice] attachment cleanup failed:", err));
  // Cloud dual-write mirror (T6 Phase 2) — await 해 실패를 표면화.
  reportSync(await mirrorDeleteInvoice(invoiceId), "거래 삭제");
}

/** Save to storage, rebuild filter chips (in case master lists changed), rerender. */
function persistAndRerender() {
  storage.save(state.data);
  refreshFilterUi(rerender);
  rerender();
}

/**
 * T6 Phase 2 — mirror 결과를 사용자에게 표면화.
 * skipped(=Cloud 미설정, LocalStorage 단독 모드)는 정상이므로 조용히 무시.
 * 실제 실패(네트워크/RLS/version 등)만 toast 로 알린다. 로컬 저장은 이미 완료됨.
 */
function reportSync(result, label) {
  if (!result || result.ok || result.skipped) return;
  toast(`${label} 클라우드 동기화 실패 — 로컬에는 저장됨`);
}

// ============================================================
// T6 Phase 1 — 읽기 경로 Cloud 우선 (읽기만; 쓰기·폴백 무변경)
// ============================================================

/**
 * Cloud fetchAll() 결과가 "사용 가능"한지 엄격 판정.
 * 아래는 모두 실패(=로컬 캐시 사용)로 본다:
 *   · undefined/null (미설정·미로그인·fetchAll 내부 실패)
 *   · species/invoices/invoiceItems 중 하나라도 배열이 아님
 *   · 세 배열이 모두 비어 있음 (빈 Cloud 오검출 방지)
 */
function isCloudUsable(cloud) {
  if (!cloud) return false;
  const { species, invoices, invoiceItems } = cloud;
  if (!Array.isArray(species) || !Array.isArray(invoices) || !Array.isArray(invoiceItems)) return false;
  if (species.length === 0 && invoices.length === 0 && invoiceItems.length === 0) return false;
  return true;
}

/**
 * 읽기 경로 Cloud 우선. 성공 시 Cloud 도메인 데이터 채택 + 로컬 meta 보존 +
 * LocalStorage 캐시 갱신. 실패/네트워크/미로그인/권한/빈결과 → localData 그대로.
 * fetchAll 은 미설정 시 null 을 반환하고, 실패 시 throw 하므로 try/catch 로 폴백.
 *
 * @param {object|null} localData  storage.load() 결과 (폴백 원본 · meta 출처)
 * @returns {Promise<object>}
 */
async function loadCloudFirst(localData) {
  try {
    const cloud = await fetchAll();               // 미설정 → null
    if (isCloudUsable(cloud)) {
      const merged = {
        categories:   localData?.categories || [],   // meta 는 로컬 보존 (Cloud 에 없음)
        colors:       localData?.colors || [],
        species:      cloud.species,
        invoices:     cloud.invoices,
        invoiceItems: cloud.invoiceItems
      };
      storage.save(merged);                        // 오프라인 대비 캐시 갱신
      console.info("[app] data source: CLOUD");
      return merged;
    }
  } catch (err) {
    console.warn("[app] cloud read failed:", err?.message || err);
  }
  console.info("[app] data source: LOCAL_CACHE");
  return localData;
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
  console.info("[app] init() 시작 · readyState:", document.readyState);
  // Debug flag first so <html class="debug-mode"> is set before any DOM
  // element with .debug-only decides its visibility.
  initDebugFlag();

  // Login gate — blocks until signed in when Supabase is configured.
  // With cloud unconfigured this resolves immediately and the app behaves
  // exactly as before (LocalStorage only, no gate shown). A gate/SDK
  // failure must never brick the whole app boot, so it is caught here.
  try {
    await initAuthGate();
  } catch (err) {
    console.error("[app] auth gate error (continuing boot):", err?.message || err);
  }

  // Cloud 연결 셀프테스트 — ?cloudtest=1 일 때만 (지연 import · 평상시 0비용).
  try {
    const { isCloudTestRequested, runCloudSelfTest } = await import("./cloudSelfTest.js");
    if (isCloudTestRequested()) runCloudSelfTest({ toast });
  } catch (err) {
    console.warn("[app] cloudSelfTest load skipped:", err?.message || err);
  }

  // 데이터 이전(T5) — ?migrate=1 일 때만 (지연 import · 평상시 0비용).
  // 자동 실행은 DRY-RUN(쓰기 없음)뿐. 실제 이전은 콘솔에서 명시 호출:
  //   await window.speciesMigration.runMigration({ dryRun: false })
  try {
    const migration = await import("./migration.js");
    if (migration.isMigrationRequested()) {
      window.speciesMigration = migration;
      const rec = await migration.runMigration({ dryRun: true });
      console.info(
        "[app] 데이터 이전 DRY-RUN 완료 — 실제 이전은 콘솔에서:\n" +
        "  await window.speciesMigration.runMigration({ dryRun: false })",
        rec
      );
    }
  } catch (err) {
    console.warn("[app] migration load skipped:", err?.message || err);
  }

  cacheElements();

  // Load persisted data (LocalStorage cache); fall back to fetched seed on first visit.
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

  // T6 Phase 1 — 읽기 경로 Cloud 우선. 성공 시 Cloud 채택 + 캐시 갱신,
  // 실패/빈결과/미로그인/오프라인 → 위 LocalStorage(data) 유지.
  // storage.load() 는 위에서 그대로 폴백으로 존속한다 (제거하지 않음).
  data = await loadCloudFirst(data);

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

  initHistoryModal({
    toast,
    onOpenTransaction: id => openTransactionDetailModal(id)
  });

  initTransactionDetailModal({
    onSave:   (invoiceId, header, items) => updateInvoice(invoiceId, header, items),
    onDelete: id => deleteInvoice(id),
    onOpenAttachment: id => openAttachmentViewer(id),
    toast
  });

  initAttachmentViewer({ toast });

  initDebugPanel({
    toast,
    onReanalyze:       reanalyzeCurrent,
    onProject:         projectInvoiceSave,
    onGetSavedInvoice: getSavedInvoiceSnapshot
  });

  // IndexedDB store (attachments) — pre-open; failures are non-fatal.
  initAttachmentStore();

  wireToolbar();
  wireFilterRail();
  refreshFilterUi(rerender);
  rerender();
}

init();
