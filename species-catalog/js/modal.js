/**
 * Species-add / edit modal.
 *
 * Handles form rendering, file attach + text-paste flow, validation, and
 * exposes `openModal(id)` / `closeModal()`. Save/delete are handled by
 * callbacks passed in via `initModal({ onSave, onDelete, toast })` so this
 * module never touches persistence directly.
 */

import { state, formState } from "./state.js";
import { analyzeInvoice, parseInvoiceText } from "./vision.js";
import { enrichSpecies } from "./stats.js";
import {
  buildMonthGrid,
  makePriceRow,
  renderPriceRows,
  makeSupplierRow,
  renderSupplierRows,
  renderFreqEditor,
  rebuildFormColorChips
} from "./components.js";

// ============================================================
// Module-local element cache + wiring context
// ============================================================

const els = {};
let ctx = { onSave: null, onDelete: null, toast: null };

/** Object URL from the last-attached image, revoked on clear/replace. */
let attachedObjectUrl = null;

// ============================================================
// Init
// ============================================================

/**
 * Cache modal DOM and wire event handlers. Called once at startup.
 * @param {{onSave:Function, onDelete:Function, toast:Function}} deps
 */
export function initModal(deps) {
  ctx = deps;

  els.modal              = document.getElementById("modal");
  els.title              = document.getElementById("modalTitle");
  els.form               = document.getElementById("speciesForm");
  els.editingId          = document.getElementById("fEditingId");
  els.fName              = document.getElementById("fName");
  els.fLatin             = document.getElementById("fLatin");
  els.fCategory          = document.getElementById("fCategory");
  els.fCategoryNew       = document.getElementById("fCategoryNew");
  els.fNotes             = document.getElementById("fNotes");
  els.fMonthGrid         = document.getElementById("fMonthGrid");
  els.fColorChips        = document.getElementById("fColorChips");
  els.fColorNew          = document.getElementById("fColorNew");
  els.fColorAddBtn       = document.getElementById("fColorAddBtn");
  els.fFreqEditor        = document.getElementById("fFreqEditor");
  els.fPriceRows         = document.getElementById("fPriceRows");
  els.fPriceAdd          = document.getElementById("fPriceAdd");
  els.fSupplierRows      = document.getElementById("fSupplierRows");
  els.fSupplierAdd       = document.getElementById("fSupplierAdd");
  els.priceTpl           = document.getElementById("priceRowTemplate");
  els.supplierTpl        = document.getElementById("supplierRowTemplate");

  els.attachSection      = document.getElementById("speciesAttachSection");
  els.attachFile         = document.getElementById("fAttachFile");
  els.attachFileName     = document.getElementById("fAttachFileName");
  els.attachFileClearBtn = document.getElementById("fAttachFileClearBtn");
  els.attachPreview      = document.getElementById("fAttachPreview");
  els.attachImg          = document.getElementById("fAttachImg");
  els.attachText         = document.getElementById("fAttachText");
  els.attachParseBtn     = document.getElementById("fAttachParseBtn");
  els.attachTextClearBtn = document.getElementById("fAttachClearBtn");
  els.attachSummary      = document.getElementById("fAttachSummary");

  wireEvents();
}

function wireEvents() {
  // Backdrop / [data-close] / Escape all close the modal.
  els.modal.addEventListener("click", e => {
    if (e.target.matches("[data-close]")) closeModal();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !els.modal.hidden) closeModal();
  });

  els.form.addEventListener("submit", onSubmit);
  els.fPriceAdd.addEventListener("click",
    () => els.fPriceRows.appendChild(makePriceRow({}, els.priceTpl)));
  els.fSupplierAdd.addEventListener("click",
    () => els.fSupplierRows.appendChild(makeSupplierRow({}, els.supplierTpl)));
  els.fColorAddBtn.addEventListener("click", onAddColor);

  els.attachFile.addEventListener("change", onFileAttached);
  els.attachFileClearBtn.addEventListener("click", clearAttachedFile);
  els.attachParseBtn.addEventListener("click", onParseText);
  els.attachTextClearBtn.addEventListener("click", clearAttachedText);
}

// ============================================================
// Open / close
// ============================================================

/**
 * Open the modal, either for a new species (id=null) or editing an existing one.
 * @param {string|null} id
 */
export function openModal(id) {
  state.editingId = id ?? null;
  // Enrich the raw Species record with the computed prices + purchaseCounts
  // pulled from invoices/invoiceItems, so the modal shows what the card
  // currently shows.
  const raw = id ? state.data.species.find(s => s.id === id) : null;
  const sp = raw ? enrichSpecies(raw, state.data.invoices, state.data.invoiceItems) : null;

  els.title.textContent = sp ? "수종 수정" : "수종 추가";

  // Attach section only makes sense on new-entry; hide it during edit.
  els.attachSection.hidden = !!sp;
  clearAttachedFile();
  clearAttachedText();

  els.editingId.value = sp?.id || "";
  els.fName.value = sp?.name || "";
  els.fLatin.value = sp?.latin || sp?.scientificName || "";
  populateCategorySelect(sp?.category);
  els.fCategoryNew.value = "";
  els.fNotes.value = sp?.notes || "";

  formState.months = new Set((sp?.bloomMonths || []).map(String));
  buildMonthGrid(els.fMonthGrid, formState.months, () => {});

  formState.colors = new Set(sp?.colors || []);
  rebuildFormColorChips(els.fColorChips, state.data.colors, formState.colors);
  els.fColorNew.value = "";

  renderPriceRows(els.fPriceRows, sp?.prices || [], els.priceTpl);
  renderSupplierRows(els.fSupplierRows, sp?.suppliers || [], els.supplierTpl);
  renderFreqEditor(els.fFreqEditor, sp?.purchaseCounts);

  els.modal.hidden = false;
  els.modal.setAttribute("aria-hidden", "false");
  setTimeout(() => els.fName.focus(), 20);
}

export function closeModal() {
  els.modal.hidden = true;
  els.modal.setAttribute("aria-hidden", "true");
  state.editingId = null;
}

// ============================================================
// Event handlers
// ============================================================

function onSubmit(e) {
  e.preventDefault();
  const payload = collectForm();
  if (!payload) return;
  ctx.onSave(payload, state.editingId);
  closeModal();
}

function onAddColor() {
  const v = els.fColorNew.value.trim();
  if (!v) return;
  if (!state.data.colors.includes(v)) state.data.colors.push(v);
  formState.colors.add(v);
  rebuildFormColorChips(els.fColorChips, state.data.colors, formState.colors);
  els.fColorNew.value = "";
}

async function onFileAttached(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  clearAttachedFile();  // Drop any previous file preview / URL first

  els.attachFileName.textContent = `${file.name} · ${(file.size / 1024).toFixed(0)} KB`;
  els.attachFileClearBtn.hidden = false;

  if (file.type.startsWith("image/")) {
    attachedObjectUrl = URL.createObjectURL(file);
    els.attachImg.src = attachedObjectUrl;
    els.attachPreview.hidden = false;
  } else {
    els.attachPreview.hidden = true;
    els.attachImg.removeAttribute("src");
  }

  // Try the Vision path first (mock today). Fall through to the manual /
  // paste-text flow if it can't extract anything.
  const result = await analyzeInvoice(file);
  if (result.ok && (result.rows.length || result.supplier.name)) {
    applyExtractedToForm(result.supplier, result.rows);
    showAttachSummary(result.supplier, result.rows);
  } else {
    els.attachSummary.hidden = false;
    els.attachSummary.textContent = file.type.startsWith("image/")
      ? "✓ 이미지 첨부됨 — Vision API 미연동 상태입니다. 이미지를 보며 직접 입력하거나, 폰 OCR로 인식한 텍스트를 텍스트 붙여넣기에 넣어 자동 파싱하세요."
      : "✓ PDF 첨부됨 — 뷰어에서 텍스트를 드래그·복사해 텍스트 붙여넣기에 넣으세요.";
    els.attachSummary.classList.remove("attach-empty");
  }
}

function clearAttachedFile() {
  if (attachedObjectUrl) {
    URL.revokeObjectURL(attachedObjectUrl);
    attachedObjectUrl = null;
  }
  els.attachPreview.hidden = true;
  els.attachImg.removeAttribute("src");
  els.attachFileName.textContent = "JPG · JPEG · PNG · PDF";
  els.attachFileClearBtn.hidden = true;
  els.attachFile.value = "";
}

function clearAttachedText() {
  els.attachText.value = "";
  els.attachSummary.hidden = true;
  els.attachSummary.textContent = "";
  els.attachSummary.classList.remove("attach-empty");
}

function onParseText() {
  const text = els.attachText.value;
  if (!text.trim()) {
    els.attachSummary.hidden = false;
    els.attachSummary.textContent = "⚠ 붙여넣은 텍스트가 비어 있습니다.";
    els.attachSummary.classList.add("attach-empty");
    return;
  }
  const { supplier, rows } = parseInvoiceText(text);
  applyExtractedToForm(supplier, rows);
  showAttachSummary(supplier, rows);
}

function showAttachSummary(supplier, rows) {
  const parts = [];
  if (supplier.name) parts.push(`상호: ${supplier.name}`);
  if (supplier.region) {
    const trimmed = supplier.region.slice(0, 30) + (supplier.region.length > 30 ? "…" : "");
    parts.push(`소재지: ${trimmed}`);
  }
  if (supplier.contact) parts.push(`연락처: ${supplier.contact}`);

  els.attachSummary.hidden = false;
  if (rows.length || parts.length) {
    els.attachSummary.textContent =
      `✓ 인식 완료 — ${[`품목 ${rows.length}건`, ...parts].join(" · ")}. 아래 필드를 검토·수정하고 저장하세요.`;
    els.attachSummary.classList.remove("attach-empty");
  } else {
    els.attachSummary.textContent = "⚠ 자동 인식된 값이 없습니다. 아래 필드를 직접 입력해 주세요.";
    els.attachSummary.classList.add("attach-empty");
  }
}

// ============================================================
// Form helpers
// ============================================================

function populateCategorySelect(selected) {
  const sel = els.fCategory;
  sel.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "선택하세요";
  sel.appendChild(placeholder);
  state.data.categories.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    if (c === selected) opt.selected = true;
    sel.appendChild(opt);
  });
}

/** Read every field, validate, and return a species payload (or null on error). */
function collectForm() {
  const name = els.fName.value.trim();
  if (!name) {
    ctx.toast("수종명을 입력해 주세요");
    els.fName.focus();
    return null;
  }

  let category = els.fCategory.value;
  const newCat = els.fCategoryNew.value.trim();
  if (newCat) {
    category = newCat;
    if (!state.data.categories.includes(newCat)) state.data.categories.push(newCat);
  }
  if (!category) {
    ctx.toast("카테고리를 선택하거나 새로 입력하세요");
    return null;
  }

  const months = [...els.fMonthGrid.querySelectorAll('[aria-pressed="true"]')]
    .map(el => Number(el.textContent))
    .sort((a, b) => a - b);

  const colors = [...formState.colors];

  const prices = [...els.fPriceRows.querySelectorAll(".price-row")]
    .map(row => ({
      spec: row.querySelector(".rf-spec").value.trim(),
      unit: row.querySelector(".rf-unit").value.trim(),
      price: Number(row.querySelector(".rf-price").value)
    }))
    .filter(p => p.spec && p.unit && !Number.isNaN(p.price) && p.price >= 0);

  const suppliers = [...els.fSupplierRows.querySelectorAll(".supplier-row")]
    .map(row => ({
      name: row.querySelector(".rf-name").value.trim(),
      region: row.querySelector(".rf-region").value.trim(),
      contact: row.querySelector(".rf-contact").value.trim()
    }))
    .filter(s => s.name);

  const purchaseCounts = Array.from({ length: 12 }, (_, i) => {
    const inp = els.fFreqEditor.querySelector(`input[data-month="${i + 1}"]`);
    const v = Number(inp?.value);
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  });

  // Return a form-payload object. `latin` replaces the old `scientificName`
  // key; `prices` and `purchaseCounts` are still collected here — app.js
  // will convert them into Invoice + InvoiceItem records at save time
  // (this module intentionally stays free of persistence concerns).
  return {
    name,
    latin: els.fLatin.value.trim(),
    category,
    bloomMonths: months,
    colors,
    prices,
    suppliers,
    purchaseCounts,
    notes: els.fNotes.value.trim()
  };
}

/**
 * Merge Vision/parser output into the currently-open form:
 *   - species name (if the field is still empty)
 *   - price rows (empty seed rows are replaced, existing user rows kept)
 *   - first supplier row (empty seed row is filled, otherwise a new row appended)
 */
function applyExtractedToForm(supplier, rows) {
  const firstRow = rows[0];
  if (firstRow && !els.fName.value.trim()) els.fName.value = firstRow.name;

  // Drop empty seed price rows before appending extracted ones.
  [...els.fPriceRows.querySelectorAll(".price-row")].forEach(row => {
    const spec = row.querySelector(".rf-spec").value.trim();
    const unit = row.querySelector(".rf-unit").value.trim();
    const price = row.querySelector(".rf-price").value.trim();
    if (!spec && !unit && !price) row.remove();
  });
  rows.forEach(r => els.fPriceRows.appendChild(makePriceRow(r, els.priceTpl)));
  if (!els.fPriceRows.querySelector(".price-row")) {
    els.fPriceRows.appendChild(makePriceRow({}, els.priceTpl));
  }

  if (supplier.name || supplier.region || supplier.contact) {
    const first = els.fSupplierRows.querySelector(".supplier-row");
    const isEmpty = first
      && !first.querySelector(".rf-name").value.trim()
      && !first.querySelector(".rf-region").value.trim()
      && !first.querySelector(".rf-contact").value.trim();
    const target = isEmpty
      ? first
      : els.fSupplierRows.appendChild(makeSupplierRow({}, els.supplierTpl));
    target.querySelector(".rf-name").value = supplier.name || "";
    target.querySelector(".rf-region").value = supplier.region || "";
    target.querySelector(".rf-contact").value = supplier.contact || "";
  }
}
