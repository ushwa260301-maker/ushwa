/**
 * 거래 상세 (Transaction Detail) modal — view · edit · delete a single Invoice.
 *
 *   Species  →  Transaction List (historyModal)  →  Transaction Detail  →  Edit Invoice
 *
 * The modal is read-only when opened. Clicking [✎ 수정] switches it to edit
 * mode, in which every header field and item row cell becomes editable, and
 * [+ 품목 추가] / row remove buttons appear. Save persists via the
 * `onSave(invoiceId, header, items)` callback provided by app.js, which
 * rewrites the corresponding Invoice + InvoiceItem records and triggers a
 * full app rerender (so `stats.js` recomputes and Species cards refresh).
 *
 * Cancellation reverts to the last saved state. The "원본 이미지" button is
 * a stub — it just toasts a "다음 버전에서 지원 예정" message.
 *
 * The module never touches storage or Species records directly.
 */

import { state } from "./state.js";

// ============================================================
// Cache + wiring context
// ============================================================

const els = {};
let ctx = { onSave: null, onDelete: null, toast: null };

const session = {
  invoiceId: null,
  invoice: null,               // reference to the source Invoice record
  header: emptyHeader(),
  items: [],                   // Array<{ id?, speciesId, speciesName, spec, unit, quantity, unitPrice, amount, _row }>
  originalSerialized: "",      // snapshot for dirty detection
  mode: "view"                 // "view" | "edit"
};

function emptyHeader() {
  return { invoiceDate: "", invoiceNumber: "", supplier: "", supplierPhone: "", supplierAddress: "" };
}

// ============================================================
// Init
// ============================================================

/**
 * @param {{ onSave: (invoiceId, header, items) => void,
 *           onDelete: (invoiceId) => void,
 *           toast: (msg:string)=>void }} deps
 */
export function initTransactionDetailModal(deps) {
  ctx = deps || {};

  els.modal          = document.getElementById("transactionDetailModal");
  els.panel          = els.modal.querySelector(".detail-panel");
  els.invoiceIdLbl   = document.getElementById("detailInvoiceId");
  els.editBtn        = document.getElementById("detailEditBtn");
  els.deleteBtn      = document.getElementById("detailDeleteBtn");
  els.imageBtn       = document.getElementById("detailImageBtn");
  els.cancelBtn      = document.getElementById("detailCancelBtn");
  els.saveBtn        = document.getElementById("detailSaveBtn");
  els.addItemBtn     = document.getElementById("detailAddItem");
  els.itemCount      = document.getElementById("detailItemCount");
  els.itemRows       = document.getElementById("detailItemRows");
  els.itemRowTpl     = document.getElementById("detailItemRowTemplate");
  els.totalQty       = document.getElementById("detailTotalQty");
  els.totalAmount    = document.getElementById("detailTotalAmount");

  els.date       = document.getElementById("detailDate");
  els.number     = document.getElementById("detailNumber");
  els.supplier   = document.getElementById("detailSupplier");
  els.phone      = document.getElementById("detailPhone");
  els.address    = document.getElementById("detailAddress");

  wireEvents();
}

function wireEvents() {
  // Close via backdrop or [✕] / [닫기]
  els.modal.addEventListener("click", e => {
    if (e.target.matches("[data-close-detail]")) requestClose();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !els.modal.hidden) requestClose();
  });

  els.editBtn.addEventListener("click", enterEditMode);
  els.cancelBtn.addEventListener("click", cancelEdit);
  els.saveBtn.addEventListener("click", commitSave);
  els.deleteBtn.addEventListener("click", confirmDelete);
  els.imageBtn.addEventListener("click", () => {
    ctx.toast && ctx.toast("원본 이미지: 다음 버전에서 지원 예정");
  });
  els.addItemBtn.addEventListener("click", () => {
    appendItemRow({ speciesId: null, speciesName: "", spec: "", unit: "주",
                    quantity: 1, unitPrice: 0, amount: 0 });
    updateDirty();
  });

  // Header edits → dirty tracking
  for (const inp of [els.date, els.number, els.supplier, els.phone, els.address]) {
    inp.addEventListener("input", updateDirty);
  }
}

// ============================================================
// Open / close
// ============================================================

/**
 * Open the detail modal for a given Invoice id.
 * @param {string} invoiceId
 */
export function openTransactionDetailModal(invoiceId) {
  const inv = state.data.invoices.find(i => i.id === invoiceId);
  if (!inv) { ctx.toast && ctx.toast("거래를 찾을 수 없습니다"); return; }

  session.invoiceId = invoiceId;
  session.invoice   = inv;

  loadFromState();
  setMode("view");

  els.modal.hidden = false;
  els.modal.setAttribute("aria-hidden", "false");
}

/**
 * Reload the modal from state.data — used when app.js reruns save/delete
 * elsewhere while this modal is open.
 */
function loadFromState() {
  const inv = state.data.invoices.find(i => i.id === session.invoiceId);
  if (!inv) return;
  session.invoice = inv;
  session.header = {
    invoiceDate:     inv.invoiceDate     || "",
    invoiceNumber:   inv.invoiceNumber   || "",
    supplier:        inv.supplier        || "",
    supplierPhone:   inv.supplierPhone   || "",
    supplierAddress: inv.supplierAddress || ""
  };
  writeHeaderInputs();

  els.invoiceIdLbl.textContent = inv.id;

  const raw = state.data.invoiceItems.filter(it => it.invoiceId === inv.id);
  els.itemRows.innerHTML = "";
  session.items = [];
  for (const it of raw) appendItemRow(it);

  updateTotals();
  session.originalSerialized = serialize();
  updateDirty();
}

function requestClose() {
  if (session.mode === "edit" && isDirty()) {
    if (!confirm("변경사항이 저장되지 않았습니다. 그래도 닫으시겠습니까?")) return;
  }
  close();
}

function close() {
  els.modal.hidden = true;
  els.modal.setAttribute("aria-hidden", "true");
  session.invoiceId = null;
  session.invoice = null;
  session.items = [];
  els.itemRows.innerHTML = "";
}

// ============================================================
// Mode
// ============================================================

function setMode(mode) {
  session.mode = mode;
  els.panel.classList.toggle("mode-view", mode === "view");
  els.panel.classList.toggle("mode-edit", mode === "edit");

  const readonly = mode === "view";
  els.date.readOnly     = readonly;
  els.number.readOnly   = readonly;
  els.supplier.readOnly = readonly;
  els.phone.readOnly    = readonly;
  els.address.readOnly  = readonly;
  for (const item of session.items) applyReadonlyToRow(item, readonly);
}

function enterEditMode() {
  session.originalSerialized = serialize();
  setMode("edit");
  updateDirty();
  els.date.focus();
}

function cancelEdit() {
  // Revert to the snapshot by reloading from state.
  loadFromState();
  setMode("view");
}

// ============================================================
// Item rows
// ============================================================

function appendItemRow(source) {
  const row = els.itemRowTpl.content.firstElementChild.cloneNode(true);
  const nameInp   = row.querySelector(".di-name");
  const specInp   = row.querySelector(".di-spec");
  const unitInp   = row.querySelector(".di-unit");
  const qtyInp    = row.querySelector(".di-qty");
  const priceInp  = row.querySelector(".di-price");
  const amountInp = row.querySelector(".di-amount");
  const removeBtn = row.querySelector(".di-remove");

  nameInp.value   = source.speciesName || source.name || "";
  specInp.value   = source.spec  || "";
  unitInp.value   = source.unit  || "주";
  qtyInp.value    = String(source.quantity ?? 1);
  priceInp.value  = source.unitPrice ?? "";
  amountInp.value = (source.amount ?? (Number(source.quantity || 0) * Number(source.unitPrice || 0))) || "";

  const item = {
    id:         source.id || null,
    speciesId:  source.speciesId || null,
    speciesName: nameInp.value,
    spec:       specInp.value,
    unit:       unitInp.value,
    quantity:   Number(qtyInp.value)   || 0,
    unitPrice:  Number(priceInp.value) || 0,
    amount:     Number(amountInp.value) || 0,
    _row: row,
    _amountEditedByUser: source.amount != null,
    _inputs: { name: nameInp, spec: specInp, unit: unitInp, qty: qtyInp, price: priceInp, amount: amountInp }
  };
  session.items.push(item);

  // Live-sync inputs → item + dirty tracking + totals
  nameInp.addEventListener("input",   () => { item.speciesName = nameInp.value; updateDirty(); });
  specInp.addEventListener("input",   () => { item.spec  = specInp.value; updateDirty(); });
  unitInp.addEventListener("input",   () => { item.unit  = unitInp.value; updateDirty(); });
  qtyInp.addEventListener("input",    () => {
    item.quantity = Number(qtyInp.value) || 0;
    if (!item._amountEditedByUser) recomputeAmount(item);
    updateTotals(); updateDirty();
  });
  priceInp.addEventListener("input",  () => {
    item.unitPrice = Number(priceInp.value) || 0;
    if (!item._amountEditedByUser) recomputeAmount(item);
    updateTotals(); updateDirty();
  });
  amountInp.addEventListener("input", () => {
    item.amount = Number(amountInp.value) || 0;
    item._amountEditedByUser = true;
    updateTotals(); updateDirty();
  });

  removeBtn.addEventListener("click", () => {
    row.remove();
    session.items = session.items.filter(x => x !== item);
    updateItemCount();
    updateTotals();
    updateDirty();
  });

  applyReadonlyToRow(item, session.mode === "view");
  els.itemRows.appendChild(row);
  updateItemCount();
}

function applyReadonlyToRow(item, readonly) {
  const inp = item._inputs;
  inp.name.readOnly   = readonly;
  inp.spec.readOnly   = readonly;
  inp.unit.readOnly   = readonly;
  inp.qty.readOnly    = readonly;
  inp.price.readOnly  = readonly;
  inp.amount.readOnly = readonly;
}

function recomputeAmount(item) {
  const computed = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
  item.amount = computed;
  item._inputs.amount.value = computed || "";
}

// ============================================================
// Totals + dirty tracking
// ============================================================

function updateItemCount() {
  els.itemCount.textContent = String(session.items.length);
}

function updateTotals() {
  let qty = 0, amt = 0;
  for (const it of session.items) {
    qty += Number(it.quantity) || 0;
    amt += Number(it.amount) || 0;
  }
  els.totalQty.textContent = qty.toLocaleString("ko-KR");
  els.totalAmount.textContent = `${amt.toLocaleString("ko-KR")}원`;
}

function writeHeaderInputs() {
  els.date.value     = session.header.invoiceDate;
  els.number.value   = session.header.invoiceNumber;
  els.supplier.value = session.header.supplier;
  els.phone.value    = session.header.supplierPhone;
  els.address.value  = session.header.supplierAddress;
}

function readHeaderInputs() {
  return {
    invoiceDate:     els.date.value,
    invoiceNumber:   els.number.value.trim(),
    supplier:        els.supplier.value.trim(),
    supplierPhone:   els.phone.value.trim(),
    supplierAddress: els.address.value.trim()
  };
}

/** JSON serialize the current form state so we can compare for dirty tracking. */
function serialize() {
  const h = readHeaderInputs();
  const rows = session.items.map(it => ({
    name:      it.speciesName,
    speciesId: it.speciesId,
    spec:      it.spec,
    unit:      it.unit,
    quantity:  Number(it.quantity)  || 0,
    unitPrice: Number(it.unitPrice) || 0,
    amount:    Number(it.amount)    || 0
  }));
  return JSON.stringify({ h, rows });
}

function isDirty() {
  return serialize() !== session.originalSerialized;
}

function updateDirty() {
  els.saveBtn.disabled = !isDirty();
}

// ============================================================
// Save + delete
// ============================================================

function commitSave() {
  const header = readHeaderInputs();

  // Validation
  if (!header.invoiceDate) { ctx.toast("거래일을 입력하세요"); els.date.focus(); return; }
  if (!header.supplier)    { ctx.toast("거래처를 입력하세요"); els.supplier.focus(); return; }
  if (!session.items.length) { ctx.toast("품목이 최소 1건 필요합니다"); return; }

  for (const it of session.items) {
    if (!(it.speciesName || "").trim()) { ctx.toast("품목명을 입력하세요"); it._inputs.name.focus(); return; }
    if (Number(it.quantity)  < 0)       { ctx.toast("수량은 0 이상이어야 합니다"); it._inputs.qty.focus(); return; }
    if (Number(it.unitPrice) < 0)       { ctx.toast("단가는 0 이상이어야 합니다"); it._inputs.price.focus(); return; }
  }

  // Hand off to app.js — it rewrites Invoice + InvoiceItem records and reruns
  // enrichAllSpecies via ui.render, so Species stats and cards refresh.
  ctx.onSave(session.invoiceId, header, session.items.map(it => ({
    id:         it.id,
    speciesId:  it.speciesId,
    speciesName: (it.speciesName || "").trim(),
    spec:       (it.spec || "").trim(),
    unit:       (it.unit || "").trim() || "주",
    quantity:   Number(it.quantity)  || 0,
    unitPrice:  Number(it.unitPrice) || 0,
    amount:     Number(it.amount)    || (Number(it.quantity) * Number(it.unitPrice)) || 0
  })));

  // Reload from the freshly-saved state so we show canonical numbers,
  // then flip back to view mode.
  loadFromState();
  setMode("view");
  ctx.toast(`${session.invoiceId} 저장 완료`);
}

function confirmDelete() {
  const id = session.invoiceId;
  if (!id) return;
  if (!confirm(`거래 ${id} 을(를) 삭제하시겠습니까? 이 거래의 품목 이력이 모두 제거됩니다.`)) return;
  ctx.onDelete(id);
  ctx.toast(`${id} 삭제되었습니다`);
  close();
}
