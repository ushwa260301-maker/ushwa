/**
 * Debug Panel — OCR 검증 화면 for the wizard's Step 3.
 *
 * Shows 5 slices of data side-by-side so a developer can validate OCR
 * output against real invoices:
 *
 *   ① Vision Raw       — untouched provider response (session.analysis._debug.raw)
 *   ② Normalized       — session.analysis minus the _debug envelope
 *   ③ User Edit        — the wizard's current header + items (live)
 *   ④ To Be Saved      — what saveInvoice() would actually persist
 *                        (Invoice + InvoiceItems + resolved Species)
 *   ⑤ Diff             — per-field OCR ↔ User-Edit comparison, highlighted
 *
 * Above the tabs there's a Vision metadata strip (provider · model · latency ·
 * ok · confidence · timestamp · error).
 *
 * Utilities: copy OCR JSON, copy save JSON, download OCR snapshot, re-run
 * OCR (delegates back to invoiceModal), save Vision response.
 *
 * All rendering is a pull from `session` — invoiceModal calls `refresh()`
 * after every relevant input event. No storage writes; no state mutation.
 */

// ============================================================
// Cache + session
// ============================================================

const els = {};
let ctx = {
  toast:       null,
  onReanalyze: null,
  onProject:   null     // (header, items) => { invoice, items, newSpecies, reusedSpecies }
};

/** Mirrors the wizard's session slice we need for rendering. */
const session = {
  analysis: null,   // Full result from analyzeInvoice() — may include _debug
  header:   null,   // { invoiceDate, invoiceNumber, supplier, supplierPhone, supplierAddress }
  items:    []      // [{ name, spec, unit, quantity, unitPrice, amount, speciesId }]
};

// ============================================================
// Init
// ============================================================

export function initDebugPanel(deps) {
  ctx = deps || {};

  els.panel        = document.getElementById("debugPanel");
  els.provider     = document.getElementById("dbgProvider");
  els.model        = document.getElementById("dbgModel");
  els.latency      = document.getElementById("dbgLatency");
  els.ok           = document.getElementById("dbgOk");
  els.confidence   = document.getElementById("dbgConfidence");
  els.requestedAt  = document.getElementById("dbgRequestedAt");
  els.errorMsg     = document.getElementById("dbgError");

  els.tabs         = els.panel.querySelectorAll(".debug-tab");
  els.panels       = els.panel.querySelectorAll("[data-dbg-panel]");
  els.rawPre       = document.getElementById("dbgRawPanel");
  els.normalized   = document.getElementById("dbgNormalizedPanel");
  els.userEdit     = document.getElementById("dbgUserEditPanel");
  els.toSave       = document.getElementById("dbgToSavePanel");
  els.diffBody     = document.getElementById("dbgDiffBody");
  els.diffEmpty    = document.getElementById("dbgDiffEmpty");

  els.copyOcrBtn      = document.getElementById("dbgCopyOcrBtn");
  els.copySaveBtn     = document.getElementById("dbgCopySaveBtn");
  els.downloadBtn     = document.getElementById("dbgDownloadBtn");
  els.reanalyzeBtn    = document.getElementById("dbgReanalyzeBtn");
  els.saveVisionBtn   = document.getElementById("dbgSaveVisionBtn");

  wireEvents();
}

function wireEvents() {
  for (const tab of els.tabs) {
    tab.addEventListener("click", () => switchTab(tab.dataset.dbgTab));
  }
  els.copyOcrBtn.addEventListener("click", () =>
    copyText(stringify(cleanNormalized()), "OCR JSON 클립보드 복사됨"));
  els.copySaveBtn.addEventListener("click", () =>
    copyText(stringify(projectSave()), "저장 JSON 클립보드 복사됨"));
  els.downloadBtn.addEventListener("click", downloadSnapshot);
  els.reanalyzeBtn.addEventListener("click", () => {
    if (ctx.onReanalyze) ctx.onReanalyze();
    else if (ctx.toast) ctx.toast("재실행 핸들러가 없습니다");
  });
  els.saveVisionBtn.addEventListener("click", downloadVisionRaw);
}

// ============================================================
// Public API — called by invoiceModal on transitions + edits
// ============================================================

/**
 * Point the debug panel at the wizard's current session slice.
 *
 * @param {{analysis:object|null, header:object|null, items:Array<object>}} snapshot
 */
export function setSession({ analysis = null, header = null, items = [] } = {}) {
  session.analysis = analysis;
  session.header   = header;
  session.items    = items;
  refresh();
}

/**
 * Re-render every panel + the diff table from the current session.
 * invoiceModal calls this after each input change.
 */
export function refresh() {
  renderMeta();
  renderRawPanel();
  renderNormalizedPanel();
  renderUserEditPanel();
  renderToSavePanel();
  renderDiffPanel();
}

/** Reset every visible field — used when the wizard closes. */
export function clearDebugPanel() {
  session.analysis = null;
  session.header   = null;
  session.items    = [];
  refresh();
}

// ============================================================
// Meta strip
// ============================================================

function renderMeta() {
  const a = session.analysis;
  const d = a?._debug || null;

  els.provider.textContent    = d?.provider    ?? (a ? (a.mock ? "mock" : "openai") : "—");
  els.model.textContent       = d?.model       ?? a?.meta?.model ?? "—";
  els.latency.textContent     = d?.latencyMs != null ? `${d.latencyMs} ms` : "—";
  els.confidence.textContent  = d?.confidence != null ? `${Math.round(d.confidence * 100)}%` : "—";
  els.requestedAt.textContent = d?.requestedAt || "—";

  if (!a) {
    setState(els.ok,       "—",     "muted");
    setState(els.errorMsg, "—",     "muted");
    return;
  }
  const ok = a.ok !== false;
  setState(els.ok, ok ? "성공" : "실패", ok ? "ok" : "error");
  const errMsg = d?.errorMessage || (ok ? null : a?.reason) || null;
  setState(els.errorMsg, errMsg || "—", errMsg ? "error" : "muted");
}

function setState(el, text, state) {
  el.textContent = text;
  el.dataset.state = state;
}

// ============================================================
// JSON panels
// ============================================================

function renderRawPanel() {
  const raw = session.analysis?._debug?.raw;
  els.rawPre.textContent = raw ? stringify(raw)
    : "Vision Raw 데이터가 아직 없습니다. OCR 실행 후 다시 확인하세요.";
}

function renderNormalizedPanel() {
  els.normalized.textContent = session.analysis
    ? stringify(cleanNormalized())
    : "정규화된 데이터가 아직 없습니다.";
}

function renderUserEditPanel() {
  if (!session.header && !session.items?.length) {
    els.userEdit.textContent = "검토 화면에서 입력을 시작하면 여기에 표시됩니다.";
    return;
  }
  els.userEdit.textContent = stringify(userEditPayload());
}

function renderToSavePanel() {
  const projection = projectSave();
  els.toSave.textContent = projection ? stringify(projection)
    : "저장 시점의 데이터가 없습니다 (필수 필드 미입력).";
}

function renderDiffPanel() {
  const rows = buildDiffRows();
  els.diffBody.innerHTML = "";
  if (!rows.length) {
    els.diffEmpty.hidden = false;
    return;
  }
  els.diffEmpty.hidden = true;
  const frag = document.createDocumentFragment();
  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.className = `dbg-diff-row diff-${r.state}`;
    tr.innerHTML =
      `<td>${esc(r.label)}</td>` +
      `<td>${esc(r.ocr)}</td>` +
      `<td>${esc(r.now)}</td>` +
      `<td class="col-status">${esc(r.statusLabel)}</td>`;
    frag.appendChild(tr);
  }
  els.diffBody.appendChild(frag);
}

// ============================================================
// Data shape helpers
// ============================================================

function cleanNormalized() {
  const a = session.analysis;
  if (!a) return null;
  const { _debug, ...rest } = a; // strip debug envelope
  return rest;
}

function userEditPayload() {
  const items = (session.items || []).map(it => ({
    name:      it.name       ?? it.speciesName ?? "",
    speciesId: it.speciesId  ?? null,
    spec:      it.spec       ?? "",
    unit:      it.unit       ?? "",
    quantity:  toNum(it.quantity),
    unitPrice: toNum(it.unitPrice),
    amount:    toNum(it.amount)
  }));
  return { header: session.header || {}, items };
}

function projectSave() {
  if (!ctx.onProject || !session.header || !session.items?.length) return null;
  try {
    const items = session.items.map(it => ({
      name:      it.name       ?? it.speciesName ?? "",
      speciesId: it.speciesId  ?? null,
      spec:      it.spec       ?? "",
      unit:      it.unit       ?? "주",
      quantity:  toNum(it.quantity),
      unitPrice: toNum(it.unitPrice),
      amount:    toNum(it.amount)
    })).filter(it => it.name.trim());
    if (!items.length) return null;
    return ctx.onProject(session.header, items);
  } catch (err) {
    return { error: String(err?.message || err) };
  }
}

// ============================================================
// Diff computation — OCR normalized rows ↔ current user rows
// ============================================================

function buildDiffRows() {
  const a = session.analysis;
  if (!a || !session.header) return [];

  const rows = [];
  const push = (label, ocr, now) => {
    const eq = String(ocr ?? "") === String(now ?? "");
    rows.push({
      label,
      ocr: ocr ?? "—",
      now: now ?? "—",
      state: eq ? "unchanged" : "modified",
      statusLabel: eq ? "수정 없음" : "→ 사용자 수정"
    });
  };

  push("거래일",     a.invoiceDate,       session.header.invoiceDate);
  push("거래번호",   a.invoiceNumber,     session.header.invoiceNumber);
  push("거래처",     a.supplier?.name,    session.header.supplier);
  push("연락처",     a.supplier?.contact, session.header.supplierPhone);
  push("주소",       a.supplier?.region,  session.header.supplierAddress);

  const ocrRows = a.rows || [];
  const nowRows = session.items || [];
  const max = Math.max(ocrRows.length, nowRows.length);
  for (let i = 0; i < max; i++) {
    const o = ocrRows[i];
    const n = nowRows[i];
    if (o && !n) {
      rows.push(makeRowRow(i, "품목", `${o.name} · ${o.spec} · ${o.quantity}${o.unit} · ${o.unitPrice}원`, "—", "removed", "→ 삭제됨"));
      continue;
    }
    if (!o && n) {
      rows.push(makeRowRow(i, "품목", "—", `${n.name} · ${n.spec} · ${n.quantity}${n.unit} · ${n.unitPrice}원`, "added", "→ 추가됨"));
      continue;
    }
    pushItemField(rows, i, "수종명", o.name,      n.name);
    pushItemField(rows, i, "규격",   o.spec,      n.spec);
    pushItemField(rows, i, "단위",   o.unit,      n.unit);
    pushItemField(rows, i, "수량",   o.quantity,  n.quantity);
    pushItemField(rows, i, "단가",   o.unitPrice, n.unitPrice);
    pushItemField(rows, i, "금액",   o.amount,    n.amount);
  }
  return rows;
}

function pushItemField(rows, i, label, ocr, now) {
  const oStr = ocr == null || ocr === "" ? "—" : String(ocr);
  const nStr = now == null || now === "" ? "—" : String(now);
  const eq = String(ocr ?? "") === String(now ?? "");
  rows.push({
    label: `#${i + 1} ${label}`,
    ocr:   oStr,
    now:   nStr,
    state: eq ? "unchanged" : "modified",
    statusLabel: eq ? "수정 없음" : "→ 사용자 수정"
  });
}
function makeRowRow(i, label, ocr, now, state, statusLabel) {
  return { label: `#${i + 1} ${label}`, ocr, now, state, statusLabel };
}

// ============================================================
// Tab switching
// ============================================================

function switchTab(name) {
  for (const t of els.tabs) {
    const active = t.dataset.dbgTab === name;
    t.classList.toggle("active", active);
    t.setAttribute("aria-selected", active ? "true" : "false");
  }
  for (const p of els.panels) {
    p.hidden = p.dataset.dbgPanel !== name;
  }
}

// ============================================================
// Utility actions
// ============================================================

async function copyText(text, okMsg) {
  if (!text) { ctx.toast && ctx.toast("복사할 내용이 없습니다"); return; }
  try {
    await navigator.clipboard.writeText(text);
    ctx.toast && ctx.toast(okMsg);
  } catch (err) {
    // Headless / older browsers may block writeText. Fall back to a temp textarea.
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.left = "-9999px";
      document.body.appendChild(ta); ta.select();
      document.execCommand("copy");
      ta.remove();
      ctx.toast && ctx.toast(okMsg);
    } catch {
      ctx.toast && ctx.toast("클립보드 복사 실패: " + (err?.message || err));
    }
  }
}

function downloadSnapshot() {
  const snapshot = {
    exportedAt: new Date().toISOString(),
    ocr:        cleanNormalized(),
    userEdit:   userEditPayload(),
    toSave:     projectSave(),
    meta:       session.analysis?._debug || null
  };
  const name = `ocr-debug-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
  downloadJson(name, snapshot);
  ctx.toast && ctx.toast(`${name} 저장됨`);
}

function downloadVisionRaw() {
  const raw = session.analysis?._debug?.raw;
  if (!raw) { ctx.toast && ctx.toast("Vision Raw 데이터가 없습니다"); return; }
  const name = `vision-raw-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
  downloadJson(name, raw);
  ctx.toast && ctx.toast(`${name} 저장됨`);
}

function downloadJson(filename, obj) {
  const blob = new Blob([stringify(obj)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// ============================================================
// Helpers
// ============================================================

function toNum(x) { const n = Number(x); return Number.isFinite(n) ? n : 0; }
function stringify(v) { return JSON.stringify(v, null, 2); }
function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
