/**
 * 구매 이력 (Transaction History) modal.
 *
 * Every card is clickable — clicking opens this modal for that species.
 * The modal reads directly from `state.data.invoices` +
 * `state.data.invoiceItems` and shows:
 *
 *   • 7 auto-computed stat cards (last-date, avg/min/max price, tx count,
 *     total quantity, total amount)
 *   • Supplier / spec / date-range filters + sort
 *   • Editable-nothing table of items with 6 columns
 *   • Live table footer (row count · summed quantity · summed amount)
 *
 * No storage writes; this modal is read-only.
 */

import { state } from "./state.js";
import {
  itemsForSpecies,
  calculateAveragePrice,
  calculateMinPrice,
  calculateMaxPrice,
  calculatePurchaseFrequency,
  calculateLastPurchase
} from "./stats.js";

// ============================================================
// Cache + session
// ============================================================

const els = {};
let ctx = { toast: null, onOpenTransaction: null };

const session = {
  speciesId: null,
  species: null,
  invoicesById: new Map(),
  /** Fully-hydrated items — { ...invoiceItem, invoiceDate, supplier } */
  rows: [],
  filters: { supplier: "", spec: "", from: "", to: "", sort: "date-desc" }
};

// ============================================================
// Init
// ============================================================

export function initHistoryModal(deps) {
  ctx = deps || {};

  els.modal            = document.getElementById("historyModal");
  els.speciesName      = document.getElementById("histSpeciesName");
  els.speciesId        = document.getElementById("histSpeciesId");

  els.lastDate         = document.getElementById("histLastDate");
  els.avgPrice         = document.getElementById("histAvgPrice");
  els.minPrice         = document.getElementById("histMinPrice");
  els.maxPrice         = document.getElementById("histMaxPrice");
  els.txCount          = document.getElementById("histTxCount");
  els.totalQty         = document.getElementById("histTotalQty");
  els.totalAmount      = document.getElementById("histTotalAmount");

  els.filterSupplier   = document.getElementById("histFilterSupplier");
  els.filterSpec       = document.getElementById("histFilterSpec");
  els.filterFrom       = document.getElementById("histFilterFrom");
  els.filterTo         = document.getElementById("histFilterTo");
  els.sort             = document.getElementById("histSort");
  els.resetFilters     = document.getElementById("histResetFilters");

  els.rows             = document.getElementById("histRows");
  els.empty            = document.getElementById("histEmpty");
  els.rowCount         = document.getElementById("histRowCount");
  els.footQty          = document.getElementById("histFootQty");
  els.footAmount       = document.getElementById("histFootAmount");

  wireEvents();
}

function wireEvents() {
  els.modal.addEventListener("click", e => {
    if (e.target.matches("[data-close-history]")) close();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !els.modal.hidden) close();
  });

  const rerenderTable = () => {
    readFilterInputs();
    renderTable();
  };
  els.filterSupplier.addEventListener("change", rerenderTable);
  els.filterSpec.addEventListener("change", rerenderTable);
  els.filterFrom.addEventListener("change", rerenderTable);
  els.filterTo.addEventListener("change", rerenderTable);
  els.sort.addEventListener("change", rerenderTable);
  els.resetFilters.addEventListener("click", () => {
    session.filters = { supplier: "", spec: "", from: "", to: "", sort: "date-desc" };
    writeFilterInputs();
    renderTable();
  });
}

// ============================================================
// Open / close
// ============================================================

/**
 * Open the history modal for a given species id.
 * @param {string} speciesId
 */
export function openHistoryModal(speciesId) {
  const sp = state.data.species.find(s => s.id === speciesId);
  if (!sp) {
    ctx.toast && ctx.toast("수종을 찾을 수 없습니다");
    return;
  }
  session.speciesId = speciesId;
  session.species = sp;
  session.invoicesById = new Map(state.data.invoices.map(inv => [inv.id, inv]));
  session.rows = itemsForSpecies(speciesId, state.data.invoiceItems).map(it => {
    const inv = session.invoicesById.get(it.invoiceId);
    return {
      ...it,
      invoiceDate: inv?.invoiceDate || "",
      supplier: inv?.supplier || "—"
    };
  });
  session.filters = { supplier: "", spec: "", from: "", to: "", sort: "date-desc" };

  els.speciesName.textContent = sp.name;
  els.speciesId.textContent = (sp.id || "").toUpperCase();

  renderStats();
  populateFilterOptions();
  writeFilterInputs();
  renderTable();

  els.modal.hidden = false;
  els.modal.setAttribute("aria-hidden", "false");
}

function close() {
  els.modal.hidden = true;
  els.modal.setAttribute("aria-hidden", "true");
}

/**
 * Re-read state.data.invoices / invoiceItems and re-render stats + table
 * for the species this modal is currently open on.  Called by app.js after
 * an invoice edit or delete so the open history stays in sync.
 * No-op if the modal is currently hidden.
 */
export function refreshHistoryModal() {
  if (!session.speciesId || els.modal.hidden) return;
  openHistoryModal(session.speciesId);
}

// ============================================================
// Stat cards (computed from the FULL set of items for this species)
// ============================================================

function renderStats() {
  const items = session.rows;
  const invoices = state.data.invoices;

  const last  = calculateLastPurchase(items, invoices);
  const avg   = calculateAveragePrice(items);
  const min   = calculateMinPrice(items);
  const max   = calculateMaxPrice(items);
  const qty   = calculatePurchaseFrequency(items);
  const txCnt = new Set(items.map(it => it.invoiceId)).size;
  const total = items.reduce((a, it) => a + (Number(it.amount) || 0), 0);

  els.lastDate.textContent    = last || "—";
  els.avgPrice.textContent    = avg    != null ? fmtWon(avg)    : "—";
  els.minPrice.textContent    = min    != null ? fmtWon(min)    : "—";
  els.maxPrice.textContent    = max    != null ? fmtWon(max)    : "—";
  els.txCount.textContent     = `${txCnt}건`;
  els.totalQty.textContent    = items.length ? `${qty.toLocaleString("ko-KR")}` : "—";
  els.totalAmount.textContent = items.length ? fmtWon(total)    : "—";
}

// ============================================================
// Filter options / IO
// ============================================================

function populateFilterOptions() {
  // Suppliers — unique from this species' rows
  const suppliers = uniqueSorted(session.rows.map(r => r.supplier).filter(Boolean));
  fillSelect(els.filterSupplier, suppliers, "거래처 전체");

  // Specs — unique
  const specs = uniqueSorted(session.rows.map(r => r.spec).filter(Boolean));
  fillSelect(els.filterSpec, specs, "규격 전체");
}

function fillSelect(select, values, placeholder) {
  select.innerHTML = `<option value="">${placeholder}</option>`;
  for (const v of values) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  }
}

function uniqueSorted(arr) {
  return [...new Set(arr)].sort((a, b) => a.localeCompare(b, "ko"));
}

function readFilterInputs() {
  session.filters = {
    supplier: els.filterSupplier.value,
    spec:     els.filterSpec.value,
    from:     els.filterFrom.value,
    to:       els.filterTo.value,
    sort:     els.sort.value
  };
}

function writeFilterInputs() {
  els.filterSupplier.value = session.filters.supplier || "";
  els.filterSpec.value     = session.filters.spec || "";
  els.filterFrom.value     = session.filters.from || "";
  els.filterTo.value       = session.filters.to || "";
  els.sort.value           = session.filters.sort || "date-desc";
}

// ============================================================
// Table
// ============================================================

function applyFilters(rows, f) {
  return rows.filter(r => {
    if (f.supplier && r.supplier !== f.supplier) return false;
    if (f.spec && r.spec !== f.spec) return false;
    if (f.from && (!r.invoiceDate || r.invoiceDate < f.from)) return false;
    if (f.to && (!r.invoiceDate || r.invoiceDate > f.to)) return false;
    return true;
  });
}

function applySort(rows, sortKey) {
  const arr = rows.slice();
  switch (sortKey) {
    case "date-asc":
      return arr.sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate));
    case "price-desc":
      return arr.sort((a, b) => Number(b.unitPrice) - Number(a.unitPrice));
    case "price-asc":
      return arr.sort((a, b) => Number(a.unitPrice) - Number(b.unitPrice));
    case "qty-desc":
      return arr.sort((a, b) => Number(b.quantity) - Number(a.quantity));
    case "date-desc":
    default:
      return arr.sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));
  }
}

function renderTable() {
  const filtered = applyFilters(session.rows, session.filters);
  const sorted = applySort(filtered, session.filters.sort);

  els.rows.innerHTML = "";
  if (!sorted.length) {
    els.empty.hidden = false;
    els.rowCount.textContent = "0건";
    els.footQty.textContent = "—";
    els.footAmount.textContent = "—";
    return;
  }
  els.empty.hidden = true;

  const frag = document.createDocumentFragment();
  let sumQty = 0, sumAmount = 0;
  for (const r of sorted) {
    const tr = document.createElement("tr");
    const qty = Number(r.quantity) || 0;
    const price = Number(r.unitPrice) || 0;
    const amount = Number(r.amount) || 0;
    sumQty += qty;
    sumAmount += amount;
    tr.dataset.invoiceId = r.invoiceId;
    tr.tabIndex = 0;
    tr.setAttribute("role", "button");
    tr.setAttribute("aria-label", `${r.invoiceDate || ""} · ${r.supplier} 거래 상세 열기`);
    tr.innerHTML =
      `<td class="col-date">${esc(r.invoiceDate || "—")}</td>` +
      `<td class="col-supplier" title="${esc(r.supplier)}">${esc(r.supplier)}</td>` +
      `<td class="col-spec">${esc(r.spec || "—")} <small>/ ${esc(r.unit || "")}</small></td>` +
      `<td class="col-num">${qty.toLocaleString("ko-KR")}</td>` +
      `<td class="col-num">${fmtWon(price)}</td>` +
      `<td class="col-num">${fmtWon(amount)}</td>`;
    tr.addEventListener("click", () => ctx.onOpenTransaction && ctx.onOpenTransaction(r.invoiceId));
    tr.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        ctx.onOpenTransaction && ctx.onOpenTransaction(r.invoiceId);
      }
    });
    frag.appendChild(tr);
  }
  els.rows.appendChild(frag);
  els.rowCount.textContent = `${sorted.length}건`;
  els.footQty.textContent = sumQty.toLocaleString("ko-KR");
  els.footAmount.textContent = fmtWon(sumAmount);
}

// ============================================================
// Helpers
// ============================================================

function fmtWon(n) {
  return `${Number(n || 0).toLocaleString("ko-KR")}원`;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
