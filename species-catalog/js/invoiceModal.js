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
import { analyzeInvoice } from "./vision.js";
import { matchSpecies } from "./matcher.js";
import { matchSupplier, matchSupplierFromCandidates, normSupplierName } from "./supplierMatcher.js";
import { setSession as setDebugSession, refresh as refreshDebug, clearDebugPanel, notifySaved as notifyDebugSaved } from "./debugPanel.js";

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
  items: [], // [{ name, spec, unit, quantity, unitPrice, amount, _row: HTMLElement }]
  // 공급처 매칭 결과. Phase C 는 여기까지만 — alias 기록·저장은 아직 하지 않는다.
  // { status, via, score, supplierName, pickedCandidate, source: "auto"|"user" } | null
  supplierMatch: null
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
  els.analyzingLabel   = document.getElementById("invAnalyzingLabel");
  els.analyzingBar     = document.getElementById("invAnalyzingBar");
  els.analysisResult   = document.getElementById("invAnalysisResult");
  els.analysisError    = document.getElementById("invAnalysisError");
  els.asNote           = document.getElementById("asNote");
  els.asSupplier       = document.getElementById("asSupplier");
  els.asPhone          = document.getElementById("asPhone");
  els.asAddress        = document.getElementById("asAddress");
  els.asDate           = document.getElementById("asDate");
  els.asInvoiceNumber  = document.getElementById("asInvoiceNumber");
  els.asItemCount      = document.getElementById("asItemCount");
  els.asErrorMessage   = document.getElementById("asErrorMessage");
  els.goReview         = document.getElementById("invGoReview");
  els.retryBtn         = document.getElementById("invRetryBtn");

  // Step 3
  els.invDate          = document.getElementById("invDate");
  els.invNumber        = document.getElementById("invNumber");
  els.invSupplier      = document.getElementById("invSupplier");
  els.invPhone         = document.getElementById("invPhone");
  els.invAddress       = document.getElementById("invAddress");
  els.itemCount        = document.getElementById("invItemCount");
  els.itemRows         = document.getElementById("invItemRows");
  els.addItem          = document.getElementById("invAddItem");
  els.amountWarn       = document.getElementById("invAmountWarn");
  els.supplierBadge    = document.getElementById("invSupplierBadge");
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
  els.retryBtn.addEventListener("click", () => startAnalysis());
  els.goReview.addEventListener("click", () => enterReview());
  els.addItem.addEventListener("click", () => { appendItemRow({}); syncReviewState(); });
  els.saveBtn.addEventListener("click", () => { onSaveClicked().catch(err => {
    ctx.toast && ctx.toast("저장 실패: " + (err?.message || err));
  }); });
  els.doneBtn.addEventListener("click", close);

  // Header field edits — keep session.header live and refresh debug panel.
  const bindHeader = (input, key) => input.addEventListener("input", () => {
    if (session.header) session.header[key] = input.value;
    syncReviewState();
  });
  bindHeader(els.invDate,     "invoiceDate");
  bindHeader(els.invNumber,   "invoiceNumber");
  bindHeader(els.invSupplier, "supplier");
  // 거래처를 직접 입력하는 동안에는 배지만 갱신한다 — 입력란은 덮어쓰지 않는다.
  els.invSupplier.addEventListener("input", () => refreshSupplierBadge());
  bindHeader(els.invPhone,    "supplierPhone");
  bindHeader(els.invAddress,  "supplierAddress");
}

// ============================================================
// Open / close
// ============================================================

/** Re-run the OCR analysis on the currently-selected file (used by Debug Panel [↻ OCR 재실행]). */
export function reanalyzeCurrent() {
  if (!session.file) { ctx.toast && ctx.toast("파일이 선택되지 않았습니다"); return; }
  startAnalysis();
}

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
  closePicker();
  clearDebugPanel();
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
  els.analysisError.hidden = true;
  els.retryBtn.hidden = true;
  els.goReview.hidden = false;

  els.itemRows.innerHTML = "";
  els.itemCount.textContent = "0";
  if (els.amountWarn) { els.amountWarn.hidden = true; els.amountWarn.innerHTML = ""; }
  session.supplierMatch = null;
  if (els.supplierBadge) { detachSupplierPicker(els.supplierBadge); els.supplierBadge.hidden = true; }

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
// Step 2 — Real OpenAI Vision analysis (via /api/analyze-invoice proxy)
// ============================================================

async function startAnalysis() {
  console.info("[wizard] startAnalysis ▶ file=", session.file?.name, session.file?.type, session.file?.size);
  goTo(2);
  // Show only the spinner; hide previous result / error.
  els.analyzing.hidden = false;
  els.analysisResult.hidden = true;
  els.analysisError.hidden = true;
  els.retryBtn.hidden = true;
  els.goReview.hidden = false;
  els.goReview.disabled = true;

  // Reset the progress bar for this attempt.
  if (els.analyzingBar) els.analyzingBar.value = 0;
  if (els.analyzingLabel) els.analyzingLabel.textContent = "Tesseract OCR 준비 중…";

  try {
    session.analysis = await analyzeInvoice(session.file, {
      onProgress: p => {
        if (!p) return;
        // Prefix stage into the visible label so a stalled UI is diagnosable.
        if (els.analyzingLabel && p.message) {
          els.analyzingLabel.textContent = p.stage
            ? `[${p.stage}] ${p.message}`
            : p.message;
        }
        if (els.analyzingBar   && typeof p.percent === "number") els.analyzingBar.value = p.percent;
      }
    });
    console.info("[wizard] analyzeInvoice ✓ resolved · rows=",
                 session.analysis?.rows?.length,
                 "· supplier=", session.analysis?.supplier?.name);
  } catch (err) {
    console.error("[wizard] analyzeInvoice ✗ rejected · stage=", err?._stalledStage,
                  "· message=", err?.message);
    els.analyzing.hidden = true;
    els.analysisError.hidden = false;
    const stageTag = err?._stalledStage ? ` [stage: ${err._stalledStage}]` : "";
    els.asErrorMessage.textContent = (err?.message || "알 수 없는 오류가 발생했습니다.") + stageTag;
    els.retryBtn.hidden = false;
    els.goReview.hidden = true;
    // Surface the failure envelope in the debug panel too — a developer
    // still wants to see model/latency/error even when the OCR failed.
    setDebugSession({
      analysis: { ok: false, reason: err?.message || String(err),
                  _debug: err?._debug || null },
      header:   null,
      items:    []
    });
    return;
  }

  const a = session.analysis;
  els.asNote.textContent = a.mock
    ? "⚠ Mock 데이터입니다. 실제 응답이 아닙니다."
    : `✓ OCR 분석 완료 (${a.meta?.model || "tesseract-5"})`;
  els.asSupplier.textContent      = a.supplier?.name    || "—";
  els.asPhone.textContent         = a.supplier?.contact || "—";
  els.asAddress.textContent       = a.supplier?.region  || "—";
  els.asDate.textContent          = a.invoiceDate       || "—";
  els.asInvoiceNumber.textContent = a.invoiceNumber     || "—";
  els.asItemCount.textContent     = `${a.rows?.length || 0}건`;

  els.analyzing.hidden = true;
  els.analysisResult.hidden = false;
  els.goReview.disabled = false;
}

// ============================================================
// Step 3 — Review + edit
// ============================================================

function enterReview() {
  console.info("[wizard] enterReview ▶ hasAnalysis=", !!session.analysis,
               "· rows=", session.analysis?.rows?.length ?? 0);
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

  // 공급처 매칭 — 파서가 넘긴 후보 배열을 거래처 목록 기준으로 판정한다.
  applySupplierCandidates(a.supplier?.nameCandidates || []);

  // Item rows from analysis
  els.itemRows.innerHTML = "";
  session.items = [];
  (a.rows || []).forEach(r => appendItemRow(r));
  if (session.items.length === 0) appendItemRow({});
  updateItemCount();

  goTo(3);
  syncReviewState();
}

/**
 * Step 3 의 단일 "상태 변경" 훅. `enterReview()` 와 `saveInvoice()` 결과를
 * 바꿀 수 있는 모든 입력 핸들러(품목명/규격/수량/단가/금액 편집, 헤더 변경,
 * 행 추가·삭제, 수종 선택)가 호출한다.
 *   ① 금액 정합성 경고를 다시 그리고
 *   ② 디버그 패널에 현재 세션을 밀어넣는다.
 *
 * 순서가 중요하다. 경고는 사용자에게 보여야 하는 값이고 디버그 패널은
 * 개발자 전용이다. 디버그 패널이 던지면(초기화 전 호출 등) 뒤에 있는
 * 코드가 실행되지 않으므로, 경고를 먼저 그린다.
 */
function syncReviewState() {
  renderAmountWarnings();
  setDebugSession({
    analysis: session.analysis || null,
    header:   session.header   || null,
    items:    session.items    || [],
    file:     session.file     || null
  });
}

// ============================================================
// Step 3 · 공급처 매칭 (Phase C — 표시 + 선택 결과 state 전달까지)
// ============================================================

/**
 * 거래처 목록을 지금까지 저장된 거래명세서에서 만든다.
 *
 * Supabase 의 `suppliers` 테이블을 직접 읽지 않는 이유 — `fetchAll()` 이
 * species / invoices / invoice_items / attachments 만 가져오고 suppliers 는
 * 안 가져온다. 새 네트워크 호출을 추가하는 것은 이번 범위 밖이고, 로컬
 * invoices 의 거래처 문자열이 곧 "사용자가 실제로 거래한 곳" 목록이라
 * 판정 근거로 충분하다.
 *
 * `id` 는 정규화된 이름을 그대로 쓴다. Phase D 에서 alias 를 기록할 때
 * 실제 uuid 가 필요해지면 그때 `suppliers` 로드를 붙인다.
 */
function buildSupplierList() {
  const seen = new Map();
  for (const inv of (state.data.invoices || [])) {
    const name = String(inv?.supplier || "").trim();
    if (!name) continue;
    const norm = normSupplierName(name);
    if (!norm || seen.has(norm)) continue;
    seen.set(norm, { id: norm, name, norm_name: norm });
  }
  return [...seen.values()];
}

/**
 * 파서가 넘긴 후보 배열로 공급처를 판정하고 배지를 그린다.
 * `status === "match"` 일 때만 입력란을 해석된 상호로 채운다 —
 * OCR 이 `노는` 으로 읽었어도 `귀거래향` 으로 확정되면 그것을 쓰는 것이
 * 이 기능의 목적이다. 그 외에는 파서 출력을 그대로 둔다.
 */
function applySupplierCandidates(candidates) {
  const suppliers = buildSupplierList();
  const res = matchSupplierFromCandidates(candidates, suppliers, []);

  if (res.status === "match" && res.supplier) {
    els.invSupplier.value  = res.supplier.name;
    session.header.supplier = res.supplier.name;
  }
  session.supplierMatch = toSupplierState(res, "auto");
  renderSupplierBadge(res, suppliers);
}

/**
 * 사용자가 거래처를 직접 입력하는 동안 배지만 갱신한다.
 * **입력란을 절대 덮어쓰지 않는다** — 타이핑 중 값이 바뀌면 안 된다.
 */
function refreshSupplierBadge() {
  const suppliers = buildSupplierList();
  const res = matchSupplier(els.invSupplier.value, suppliers, []);
  session.supplierMatch = toSupplierState(res, session.supplierMatch?.source === "user" ? "user" : "auto");
  renderSupplierBadge(res, suppliers);
}

/** 매칭 결과에서 저장·디버그에 필요한 부분만 뽑는다 (DOM 참조 없음). */
function toSupplierState(res, source) {
  return {
    status:          res.status,
    via:             res.via,
    score:           res.score,
    supplierName:    res.supplier?.name ?? null,
    pickedCandidate: res.pickedCandidate ?? null,
    source
  };
}

function renderSupplierBadge(res, suppliers) {
  const badge = els.supplierBadge;
  if (!badge) return;
  detachSupplierPicker(badge);

  if (!String(els.invSupplier.value || "").trim() && res.status === "new") {
    badge.hidden = true;
    return;
  }
  badge.hidden = false;

  if (res.status === "match") {
    const label = res.via === "exact" ? "기존 거래처"
                : res.via === "alias" ? "별칭 연결"
                : `자동 연결 ${pct(res.score)}`;
    setBadge(badge, "match", `✓ ${res.supplier.name}`, `${label} · via=${res.via}`);
    return;
  }
  if (res.status === "possible") {
    setBadge(badge, "possible", `후보 ${res.candidates.length} ▾`,
      res.candidates.map(c => `${c.supplier.name} ${pct(c.score)}`).join(" · "));
    attachSupplierPicker(badge, res, suppliers);
    return;
  }
  setBadge(badge, "new", "+ 새 거래처", "일치하는 기존 거래처가 없습니다");
}

function attachSupplierPicker(badge, res, suppliers) {
  badge.classList.add("clickable");
  badge.tabIndex = 0;
  badge.setAttribute("role", "button");
  badge.setAttribute("aria-haspopup", "menu");
  badge.setAttribute("aria-label", `후보 거래처 ${res.candidates.length}개 중 선택`);
  const open = e => { e.stopPropagation(); openSupplierPicker(badge, res, suppliers); };
  const key  = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(e); } };
  badge._supOpen = open;
  badge._supKey  = key;
  badge.addEventListener("click", open);
  badge.addEventListener("keydown", key);
}

function detachSupplierPicker(badge) {
  if (badge._supOpen) badge.removeEventListener("click", badge._supOpen);
  if (badge._supKey)  badge.removeEventListener("keydown", badge._supKey);
  badge._supOpen = badge._supKey = null;
  badge.classList.remove("clickable");
  badge.removeAttribute("role");
  badge.removeAttribute("tabindex");
  badge.removeAttribute("aria-haspopup");
  badge.removeAttribute("aria-label");
}

function openSupplierPicker(anchor, res, suppliers) {
  closePicker();
  const menu = document.createElement("div");
  menu.className = "species-picker-menu";
  menu.setAttribute("role", "menu");

  const header = document.createElement("div");
  header.className = "picker-header";
  header.textContent = `"${res.pickedCandidate ?? els.invSupplier.value}" 에 가까운 거래처`;
  menu.appendChild(header);

  for (const cand of res.candidates) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "picker-item";
    btn.setAttribute("role", "menuitem");
    const name  = document.createElement("span"); name.className  = "pi-name";  name.textContent  = cand.supplier.name;
    const score = document.createElement("span"); score.className = "pi-score"; score.textContent = pct(cand.score);
    btn.append(name, score);
    btn.addEventListener("click", () => {
      // 선택 결과를 입력란과 세션에 반영한다. 저장 흐름은 건드리지 않는다 —
      // header.supplier 는 기존과 똑같이 입력란에서 읽힌다.
      els.invSupplier.value   = cand.supplier.name;
      session.header.supplier = cand.supplier.name;
      session.supplierMatch = {
        status: "match", via: "user-pick", score: cand.score,
        supplierName: cand.supplier.name,
        pickedCandidate: res.pickedCandidate ?? null,
        source: "user"
      };
      setBadge(anchor, "match", `✓ ${cand.supplier.name}`, `사용자 선택 · 유사도 ${pct(cand.score)}`);
      detachSupplierPicker(anchor);
      closePicker();
      syncReviewState();
    });
    menu.appendChild(btn);
  }

  const newBtn = document.createElement("button");
  newBtn.type = "button";
  newBtn.className = "picker-item picker-new";
  newBtn.setAttribute("role", "menuitem");
  newBtn.textContent = "+ 새 거래처로 등록";
  newBtn.addEventListener("click", () => {
    session.supplierMatch = {
      status: "new", via: null, score: 0, supplierName: null,
      pickedCandidate: res.pickedCandidate ?? null, source: "user"
    };
    setBadge(anchor, "new", "+ 새 거래처", "사용자가 신규 등록 선택");
    detachSupplierPicker(anchor);
    closePicker();
    syncReviewState();
  });
  menu.appendChild(newBtn);

  const rect = anchor.getBoundingClientRect();
  menu.style.position = "fixed";
  menu.style.top  = `${rect.bottom + 4}px`;
  menu.style.left = `${Math.max(8, rect.left)}px`;
  document.body.appendChild(menu);
  currentPicker = menu;
  setTimeout(() => {
    document.addEventListener("click", onDocClickForPicker);
    document.addEventListener("keydown", onDocKeyForPicker);
  }, 0);
}

/**
 * 수량 × 단가 ≠ 금액 인 품목을 찾는다. 순수 함수 — 부작용 없음.
 *
 * 저장 대상과 같은 조건(품목명·수량·단가가 모두 있는 행)만 본다.
 * 저장되지 않을 행을 경고해도 사용자가 할 수 있는 일이 없기 때문이다.
 *
 * @param {Array<{name,quantity,unitPrice,amount}>} items
 * @returns {Array<{name,quantity,unitPrice,computed,entered,diff}>}
 */
export function checkAmounts(items) {
  return (items || [])
    .filter(it => it?.name?.trim() && Number(it.unitPrice) > 0 && Number(it.quantity) > 0)
    .map(it => {
      const quantity  = Number(it.quantity)  || 0;
      const unitPrice = Number(it.unitPrice) || 0;
      const entered   = Number(it.amount)    || 0;
      const computed  = quantity * unitPrice;
      return { name: it.name.trim(), quantity, unitPrice, computed, entered, diff: entered - computed };
    })
    .filter(r => r.diff !== 0);
}

const won = n => Number(n).toLocaleString("ko-KR");

/**
 * 금액 경고를 렌더한다. **저장을 막지 않는다** — 명세서에 실제로 계산이
 * 맞지 않게 적혀 있는 경우가 있고, 사용자가 금액을 직접 수정하면
 * (`_amountEditedByUser`) 자동 재계산이 꺼지는 것도 의도된 동작이다.
 * 경고는 그 불일치를 눈에 보이게만 한다.
 */
function renderAmountWarnings() {
  if (!els.amountWarn) return;
  const bad = checkAmounts(session.items);
  if (!bad.length) {
    els.amountWarn.hidden = true;
    els.amountWarn.innerHTML = "";
    return;
  }
  const rows = bad.map(r => `
    <div class="amount-warn-row">
      <div class="aw-name">${escapeHtml(r.name)}</div>
      <dl class="aw-figures">
        <div><dt>수량</dt><dd>${won(r.quantity)}</dd></div>
        <div><dt>단가</dt><dd>${won(r.unitPrice)}</dd></div>
        <div><dt>계산 금액</dt><dd>${won(r.computed)}</dd></div>
        <div><dt>입력 금액</dt><dd>${won(r.entered)}</dd></div>
        <div class="aw-diff"><dt>차이</dt><dd>${r.diff > 0 ? "+" : "−"}${won(Math.abs(r.diff))}</dd></div>
      </dl>
    </div>`).join("");
  els.amountWarn.innerHTML =
    `<div class="amount-warn-head">⚠ 금액 검증 필요 — ${bad.length}건</div>` +
    rows +
    `<div class="amount-warn-foot">저장은 그대로 진행됩니다. 명세서를 다시 확인해 주세요.</div>`;
  els.amountWarn.hidden = false;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
    /** Resolved by the matcher (auto for `match`) or by user pick (for `possible`). */
    speciesId: null,
    _row: rowEl,
    _amountEditedByUser: source.amount != null
  };
  session.items.push(item);

  // Live-sync input → item (+ debug panel refresh)
  nameInp.addEventListener("input", () => {
    item.name = nameInp.value;
    updateBadgeForRow(item, badge);
    syncReviewState();
  });
  specInp.addEventListener("input", () => { item.spec = specInp.value; syncReviewState(); });
  unitInp.addEventListener("input", () => { item.unit = unitInp.value; syncReviewState(); });

  qtyInp.addEventListener("input", () => {
    item.quantity = Number(qtyInp.value) || 0;
    if (!item._amountEditedByUser) recomputeAmount(item, amountInp);
    syncReviewState();
  });
  priceInp.addEventListener("input", () => {
    item.unitPrice = Number(priceInp.value) || 0;
    if (!item._amountEditedByUser) recomputeAmount(item, amountInp);
    syncReviewState();
  });
  amountInp.addEventListener("input", () => {
    item.amount = Number(amountInp.value) || 0;
    item._amountEditedByUser = true;
    syncReviewState();
  });

  removeBtn.addEventListener("click", () => {
    rowEl.remove();
    session.items = session.items.filter(x => x !== item);
    updateItemCount();
    syncReviewState();
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
 * Update the 3-tier species badge on a row after the name changes.
 *
 * Tiers (from matcher.js `matchSpecies()`):
 *   • match    → 자동 연결. Auto-fills `item.speciesId`.
 *   • possible → 사용자 선택. Badge becomes clickable; opens a candidate menu.
 *                If the user has already picked, badge shows the pick as match.
 *   • new      → 새 Species. `item.speciesId` stays null → saveInvoice creates.
 *   • unknown  → row name still empty.
 */
function updateBadgeForRow(item, badge) {
  detachPicker(badge);

  const rawName = (item.name || "").trim();
  if (!rawName) {
    badge.dataset.status = "unknown";
    badge.textContent = "이름 입력";
    badge.title = "";
    item.speciesId = null;
    item._match = null;
    return;
  }

  const result = matchSpecies(rawName, state.data.species);
  item._match = result;

  if (result.status === "match") {
    item.speciesId = result.species.id;
    setBadge(badge, "match", `✓ ${result.species.name}`,
      `${result.species.id} · 유사도 ${pct(result.score)}`);
    return;
  }

  if (result.status === "possible") {
    // Honor an existing user pick if the row-name change kept it in the candidate list.
    const picked = item.speciesId
      ? result.candidates.find(c => c.species.id === item.speciesId)
      : null;
    if (picked) {
      setBadge(badge, "match", `✓ ${picked.species.name}`,
        `사용자 선택 · 유사도 ${pct(picked.score)}`);
      return;
    }
    item.speciesId = null;
    const top = result.candidates[0];
    const more = result.candidates.length > 1 ? ` 외 ${result.candidates.length - 1}` : "";
    setBadge(badge, "possible", `? ${top.species.name}${more} · 선택`,
      `${result.candidates.length}개 후보 · 클릭해 선택 (top ${pct(result.score)})`);
    attachPicker(badge, item, result);
    return;
  }

  // status === "new"
  item.speciesId = null;
  setBadge(badge, "new", "+ 새 수종", "저장 시 새 Species 로 자동 등록됩니다");
}

function setBadge(badge, status, text, title) {
  badge.dataset.status = status;
  badge.textContent = text;
  badge.title = title;
}

function pct(score) {
  return `${Math.round(score * 100)}%`;
}

// ============================================================
// Possible-tier candidate picker (inline popover)
// ============================================================

let currentPicker = null;

function attachPicker(badge, item, result) {
  badge.classList.add("clickable");
  badge.tabIndex = 0;
  badge.setAttribute("role", "button");
  badge.setAttribute("aria-haspopup", "menu");
  badge.setAttribute("aria-label",
    `후보 수종 ${result.candidates.length}개 중 선택`);
  const opener = e => { e.stopPropagation(); openPicker(badge, item, result); };
  const keyOpener = e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPicker(badge, item, result); }
  };
  badge._pickerOpener = opener;
  badge._pickerKey    = keyOpener;
  badge.addEventListener("click",   opener);
  badge.addEventListener("keydown", keyOpener);
}

function detachPicker(badge) {
  if (badge._pickerOpener) badge.removeEventListener("click",   badge._pickerOpener);
  if (badge._pickerKey)    badge.removeEventListener("keydown", badge._pickerKey);
  badge._pickerOpener = null;
  badge._pickerKey    = null;
  badge.classList.remove("clickable");
  badge.removeAttribute("role");
  badge.removeAttribute("tabindex");
  badge.removeAttribute("aria-haspopup");
  badge.removeAttribute("aria-label");
}

function openPicker(anchor, item, result) {
  closePicker();

  const menu = document.createElement("div");
  menu.className = "species-picker-menu";
  menu.setAttribute("role", "menu");

  const header = document.createElement("div");
  header.className = "picker-header";
  header.textContent = `"${item.name}" 에 가까운 후보`;
  menu.appendChild(header);

  for (const cand of result.candidates) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "picker-item";
    btn.setAttribute("role", "menuitem");
    btn.dataset.speciesId = cand.species.id;

    const name  = document.createElement("span"); name.className  = "pi-name";  name.textContent  = cand.species.name;
    const id    = document.createElement("span"); id.className    = "pi-id";    id.textContent    = cand.species.id;
    const score = document.createElement("span"); score.className = "pi-score"; score.textContent = pct(cand.score);
    btn.append(name, id, score);

    btn.addEventListener("click", () => {
      item.speciesId = cand.species.id;
      setBadge(anchor, "match", `✓ ${cand.species.name}`,
        `사용자 선택 · 유사도 ${pct(cand.score)}`);
      detachPicker(anchor);
      closePicker();
      syncReviewState();
    });
    menu.appendChild(btn);
  }

  const newBtn = document.createElement("button");
  newBtn.type = "button";
  newBtn.className = "picker-item picker-new";
  newBtn.setAttribute("role", "menuitem");
  newBtn.textContent = "+ 새 수종으로 등록";
  newBtn.addEventListener("click", () => {
    item.speciesId = null;
    setBadge(anchor, "new", "+ 새 수종", "사용자가 신규 등록 선택");
    detachPicker(anchor);
    closePicker();
    syncReviewState();
  });
  menu.appendChild(newBtn);

  // Position under the badge.
  const rect = anchor.getBoundingClientRect();
  menu.style.position = "fixed";
  menu.style.top  = `${rect.bottom + 4}px`;
  menu.style.left = `${Math.max(8, rect.left)}px`;

  document.body.appendChild(menu);
  currentPicker = menu;

  // Close on outside click / Escape.
  setTimeout(() => {
    document.addEventListener("click", onDocClickForPicker);
    document.addEventListener("keydown", onDocKeyForPicker);
  }, 0);
}

function onDocClickForPicker(e) {
  if (currentPicker && !currentPicker.contains(e.target)) closePicker();
}
function onDocKeyForPicker(e) {
  if (e.key === "Escape") closePicker();
}
function closePicker() {
  if (currentPicker) { currentPicker.remove(); currentPicker = null; }
  document.removeEventListener("click", onDocClickForPicker);
  document.removeEventListener("keydown", onDocKeyForPicker);
}

// ============================================================
// Step 3 → Step 4 — Save
// ============================================================

async function onSaveClicked() {
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

  // Hand off to app.js. Attaches the original file (if any) + raw Vision
  // JSON so `saveInvoice()` can push them into IndexedDB and the Invoice
  // record respectively.
  els.saveBtn.disabled = true;
  try {
    const result = await ctx.onSave(session.header, validItems, {
      file:     session.file     || null,
      analysis: session.analysis || null
    });
    showSuccess(result, validItems.length);
    // Notify the Debug Panel so post-save checklist items flip green and
    // the "저장 Invoice 다운로드" button can look up the persisted record.
    if (result?.invoiceId) notifyDebugSaved(result.invoiceId);
    goTo(4);
  } finally {
    els.saveBtn.disabled = false;
  }
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
