/**
 * 거래명세서 등록 wizard — a 4-step modal that walks the user through:
 *
 *   1. 파일 업로드      Pick an image / PDF; preview shown inline.
 *   2. AI 분석 (Mock)   Call `analyzeInvoiceMock()` from vision.js and
 *                       summarize the extracted supplier + item count.
 *   3. 사용자 검토       Editable header (거래일 / 거래처 / 전화번호 /
 *                       주소 / 명세서 번호) + editable item list
 *                       (품목명 / 규격 / 단위 / 수량 / 단가 / 금액).
 *                       Each item row shows a real-time badge:
 *                         · match — links to an existing Species
 *                         · new   — will be auto-created on save
 *                         · unknown — 이름 미입력
 *   4. 완료             Success card summarising what was saved.
 *
 * The module never touches storage or state directly. `initInvoiceModal()`
 * takes a `{ onSave, toast }` context; `onSave(header, items)` is called
 * on the Step-3 저장 button and expected to return
 *   { invoiceId, newSpecies:[], reusedSpecies:[] }
 * so this module can render the success summary.
 */

import { state } from "./state.js";
import { analyzeInvoiceMock } from "./vision.js";

// ============================================================
// Module-local element cache + wiring context
// ============================================================

const els = {};
let ctx = { onSave: null, toast: null };
let attachedObjectUrl = null;

/**
 * Wizard-local session state. Reset every time the modal is opened.
 * The `items` array is the source of truth for row rendering; each row's
 * DOM element writes back into the same object as the user edits.
 */
const session = {
  step: 1,
  file: null,
  analysis: null,
  header: emptyHeader(),
  items: [] // [{ name, spec, unit, quantity, unitPrice, amount, _row: HTMLElement }]
};

function emptyHeader() {
  return {
    invoiceDate: "",
    invoiceNumber: "",
    supplier: "",
    supplierPhone: "",
    supplierAddress: ""
  };
}

// ============================================================
// Init
// ============================================================

/**
 * Cache DOM + wire event handlers. Call once at startup.
 * @param {{onSave: (header, items) => {invoiceId, newSpecies, reusedSpecies}, toast: (msg)=>void}} deps
 */
export function initInvoiceModal(deps) {
  ctx = deps;

  els.modal            = document.getElementById("invoiceModal");
  els.wizardNav        = document.getElementById("wizardNav");
  els.stepPanels       = els.modal.querySelectorAll("[data-wiz-panel]");

  // Step 1
  els.file             = document.getElementById("invFile");
  els.preview          = document.getElementById("invPreview");
  els.previewImg       = document.getElementById("invPreviewImg");
  els.pickedName       = document.getElementById("invPickedName");
  els.uploadNext       = document.getElementById("invUploadNext");

  // Step 2
  els.analyzing        = document.getElementById("invAnalyzing");
  els.analysisResult   = document.getElementById("invAnalysisResult");
  els.asSupplier       = document.getElementById("asSupplier");
  els.asPhone          = document.getElementById("asPhone");
  els.asAddress        = document.getElementById("asAddress");
  els.asDate           = document.getElementById("asDate");
  els.asInvoiceNumber  = document.getElementById("asInvoiceNumber");
  els.asItemCount      = document.getElementById("asItemCount");
  els.goReview         = document.getElementById("invGoReview");

  // Step 3
  els.invDate          = document.getElementById("invDate");
  els.invNumber        = document.getElementById("invNumber");
  els.invSupplier      = document.getElementById("invSupplier");
  els.invPhone         = document.getElementById("invPhone");
  els.invAddress       = document.getElementById("invAddress");
  els.itemCount        = document.getElementById("invItemCount");
  els.itemRows         = document.getElementById("invItemRows");
  els.addItem          = document.getElementById("invAddItem");
  els.saveBtn          = document.getElementById("invSaveBtn");
  els.itemRowTpl       = document.getElementById("invoiceItemRowTemplate");

  // Step 4
  els.successSummary   = document.getElementById("invSuccessSummary");
  els.doneBtn          = document.getElementById("invDoneBtn");

  wireEvents();
}

function wireEvents() {
  els.modal.addEventListener("click", e => {
    if (e.target.matches("[data-close-invoice]")) close();
    if (e.target.matches("[data-wiz-back]")) goTo(Number(e.target.dataset.wizBack));
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !els.modal.hidden) close();
  });

  els.file.addEventListener("change", onFilePicked);
  els.uploadNext.addEventListener("click", () => startAnalysis());
  els.goReview.addEventListener("click", () => enterReview());
  els.addItem.addEventListener("click", () => appendItemRow({}));
  els.saveBtn.addEventListener("click", onSaveClicked);
  els.doneBtn.addEventListener("click", close);
}

// ============================================================
// Open / close
// ============================================================

/** Open the wizard at Step 1 with a fresh session. */
export function openInvoiceModal() {
  resetSession();
  goTo(1);
  els.modal.hidden = false;
  els.modal.setAttribute("aria-hidden", "false");
}

function close() {
  els.modal.hidden = true;
  els.modal.setAttribute("aria-hidden", "true");
  clearAttachedPreview();
}

function resetSession() {
  session.step = 1;
  session.file = null;
  session.analysis = null;
  session.header = emptyHeader();
  session.items = [];

  els.file.value = "";
  els.uploadNext.disabled = true;
  els.pickedName.hidden = true;
  clearAttachedPreview();

  els.analyzing.hidden = true;
  els.analysisResult.hidden = true;

  els.itemRows.innerHTML = "";
  els.itemCount.textContent = "0";

  els.invDate.value = "";
  els.invNumber.value = "";
  els.invSupplier.value = "";
  els.invPhone.value = "";
  els.invAddress.value = "";

  els.successSummary.innerHTML = "";
}

function clearAttachedPreview() {
  if (attachedObjectUrl) {
    URL.revokeObjectURL(attachedObjectUrl);
    attachedObjectUrl = null;
  }
  els.preview.hidden = true;
  els.previewImg.removeAttribute("src");
}

// ============================================================
// Step navigation
// ============================================================

function goTo(step) {
  session.step = step;
  // Panels
  els.stepPanels.forEach(p => {
    p.hidden = Number(p.dataset.wizPanel) !== step;
  });
  // Nav indicator
  els.wizardNav.querySelectorAll(".wiz-step").forEach(el => {
    const s = Number(el.dataset.step);
    el.classList.toggle("active", s === step);
    el.classList.toggle("done", s < step);
  });
}

// ============================================================
// Step 1 — File pick
// ============================================================

function onFilePicked(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  session.file = file;

  clearAttachedPreview();

  if (file.type.startsWith("image/")) {
    attachedObjectUrl = URL.createObjectURL(file);
    els.previewImg.src = attachedObjectUrl;
    els.preview.hidden = false;
  }

  els.pickedName.textContent = `${file.name} · ${(file.size / 1024).toFixed(0)} KB`;
  els.pickedName.hidden = false;
  els.uploadNext.disabled = false;
}

// ============================================================
// Step 2 — Mock analysis
// ============================================================

async function startAnalysis() {
  goTo(2);
  els.analyzing.hidden = false;
  els.analysisResult.hidden = true;

  try {
    session.analysis = await analyzeInvoiceMock(session.file);
  } catch (err) {
    ctx.toast("분석 실패: " + err.message);
    goTo(1);
    return;
  }

  const a = session.analysis;
  els.asSupplier.textContent = a.supplier?.name || "—";
  els.asPhone.textContent = a.supplier?.contact || "—";
  els.asAddress.textContent = a.supplier?.region || "—";
  els.asDate.textContent = a.invoiceDate || "—";
  els.asInvoiceNumber.textContent = a.invoiceNumber || "—";
  els.asItemCount.textContent = `${a.rows?.length || 0}건`;

  els.analyzing.hidden = true;
  els.analysisResult.hidden = false;
}

// ============================================================
// Step 3 — Review + edit
// ============================================================

function enterReview() {
  const a = session.analysis || {};

  // Header defaults from analysis
  session.header = {
    invoiceDate: a.invoiceDate || new Date().toISOString().slice(0, 10),
    invoiceNumber: a.invoiceNumber || "",
    supplier: a.supplier?.name || "",
    supplierPhone: a.supplier?.contact || "",
    supplierAddress: a.supplier?.region || ""
  };
  els.invDate.value = session.header.invoiceDate;
  els.invNumber.value = session.header.invoiceNumber;
  els.invSupplier.value = session.header.supplier;
  els.invPhone.value = session.header.supplierPhone;
  els.invAddress.value = session.header.supplierAddress;

  // Item rows from analysis
  els.itemRows.innerHTML = "";
  session.items = [];
  (a.rows || []).forEach(r => appendItemRow(r));
  if (session.items.length === 0) appendItemRow({});
  updateItemCount();

  goTo(3);
}

function appendItemRow(source) {
  const rowEl = els.itemRowTpl.content.firstElementChild.cloneNode(true);
  const nameInp = rowEl.querySelector(".ii-name");
  const specInp = rowEl.querySelector(".ii-spec");
  const unitInp = rowEl.querySelector(".ii-unit");
  const qtyInp = rowEl.querySelector(".ii-qty");
  const priceInp = rowEl.querySelector(".ii-price");
  const amountInp = rowEl.querySelector(".ii-amount");
  const badge = rowEl.querySelector(".ii-species-badge");
  const removeBtn = rowEl.querySelector(".ii-remove");

  nameInp.value = source.name || "";
  specInp.value = source.spec || "";
  unitInp.value = source.unit || "주";
  qtyInp.value = String(source.quantity ?? 1);
  priceInp.value = source.unitPrice ?? "";
  amountInp.value = (source.amount ?? (Number(source.quantity || 0) * Number(source.unitPrice || 0))) || "";

  const item = {
    name: nameInp.value,
    spec: specInp.value,
    unit: unitInp.value,
    quantity: Number(qtyInp.value) || 0,
    unitPrice: Number(priceInp.value) || 0,
    amount: Number(amountInp.value) || 0,
    _row: rowEl,
    _amountEditedByUser: source.amount != null
  };
  session.items.push(item);

  // Live-sync input → item
  nameInp.addEventListener("input", () => {
    item.name = nameInp.value;
    updateBadgeForRow(item, badge);
  });
  specInp.addEventListener("input", () => { item.spec = specInp.value; });
  unitInp.addEventListener("input", () => { item.unit = unitInp.value; });

  qtyInp.addEventListener("input", () => {
    item.quantity = Number(qtyInp.value) || 0;
    if (!item._amountEditedByUser) recomputeAmount(item, amountInp);
  });
  priceInp.addEventListener("input", () => {
    item.unitPrice = Number(priceInp.value) || 0;
    if (!item._amountEditedByUser) recomputeAmount(item, amountInp);
  });
  amountInp.addEventListener("input", () => {
    item.amount = Number(amountInp.value) || 0;
    item._amountEditedByUser = true;
  });

  removeBtn.addEventListener("click", () => {
    rowEl.remove();
    session.items = session.items.filter(x => x !== item);
    updateItemCount();
  });

  updateBadgeForRow(item, badge);
  els.itemRows.appendChild(rowEl);
  updateItemCount();
}

function recomputeAmount(item, amountInp) {
  const computed = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
  item.amount = computed;
  amountInp.value = computed || "";
}

function updateItemCount() {
  els.itemCount.textContent = String(session.items.length);
}

/**
 * Update the "matches / new / unknown" badge on a row after the name changes.
 * Match is case-insensitive on trimmed name.
 */
function updateBadgeForRow(item, badge) {
  const name = (item.name || "").trim().toLowerCase();
  if (!name) {
    badge.dataset.status = "unknown";
    badge.textContent = "이름 입력";
    return;
  }
  const match = state.data.species.find(s => (s.name || "").trim().toLowerCase() === name);
  if (match) {
    badge.dataset.status = "match";
    badge.textContent = `✓ ${match.id}`;
  } else {
    badge.dataset.status = "new";
    badge.textContent = "+ 새 수종";
  }
}

// ============================================================
// Step 3 → Step 4 — Save
// ============================================================

function onSaveClicked() {
  // Sync header from DOM
  session.header = {
    invoiceDate: els.invDate.value,
    invoiceNumber: els.invNumber.value.trim(),
    supplier: els.invSupplier.value.trim(),
    supplierPhone: els.invPhone.value.trim(),
    supplierAddress: els.invAddress.value.trim()
  };

  // Validation
  if (!session.header.invoiceDate) {
    ctx.toast("거래일을 선택해 주세요");
    els.invDate.focus();
    return;
  }
  if (!session.header.supplier) {
    ctx.toast("거래처를 입력해 주세요");
    els.invSupplier.focus();
    return;
  }

  const validItems = session.items.filter(it =>
    it.name?.trim() && Number(it.unitPrice) > 0 && Number(it.quantity) > 0
  );
  if (!validItems.length) {
    ctx.toast("품목명·수량·단가가 있는 행이 최소 1건 필요합니다");
    return;
  }

  // Hand off to app.js
  const result = ctx.onSave(session.header, validItems);
  showSuccess(result, validItems.length);
  goTo(4);
}

function showSuccess(result, itemCount) {
  const invId = result?.invoiceId || "—";
  const newList = result?.newSpecies || [];
  const reusedList = result?.reusedSpecies || [];
  const parts = [];
  parts.push(`거래명세서 <strong>${invId}</strong> 생성됨`);
  parts.push(`품목 <strong>${itemCount}건</strong> 추가`);
  if (reusedList.length) {
    parts.push(`기존 수종 연결: <strong>${reusedList.length}건</strong> (${reusedList.map(s => s.name).join(", ")})`);
  }
  if (newList.length) {
    parts.push(`새 수종 자동 생성: <strong>${newList.length}건</strong> (${newList.map(s => `${s.name} · ${s.id}`).join(", ")})`);
  }
  els.successSummary.innerHTML = parts.map(p => `<div>· ${p}</div>`).join("");
}
