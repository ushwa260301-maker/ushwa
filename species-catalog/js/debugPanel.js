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
  toast:                   null,
  onReanalyze:             null,
  onProject:               null,   // (header, items) => { invoice, items, newSpecies, reusedSpecies }
  onGetSavedInvoice:       null    // (invoiceId)   => { invoice, items, linkedSpecies } | null
};

/** Mirrors the wizard's session slice we need for rendering. */
const session = {
  analysis:    null,   // Full result from analyzeInvoice() — may include _debug
  header:      null,   // { invoiceDate, invoiceNumber, supplier, supplierPhone, supplierAddress }
  items:       [],     // [{ name, spec, unit, quantity, unitPrice, amount, speciesId }]
  file:        null,   // File / Blob (for mime-type checks in the checklist)
  lastSavedId: null    // set by invoiceModal after `saveInvoice` succeeds
};

// ============================================================
// Init
// ============================================================

export function initDebugPanel(deps) {
  ctx = deps || {};

  els.panel        = document.getElementById("debugPanel");
  els.provider     = document.getElementById("dbgProvider");
  els.model        = document.getElementById("dbgModel");
  els.httpStatus   = document.getElementById("dbgHttpStatus");
  els.latency      = document.getElementById("dbgLatency");
  els.ok           = document.getElementById("dbgOk");
  els.confidence   = document.getElementById("dbgConfidence");
  els.requestedAt  = document.getElementById("dbgRequestedAt");
  els.errorMsg     = document.getElementById("dbgError");
  els.rateValue    = document.getElementById("dbgRateValue");
  els.rateDetail   = document.getElementById("dbgRateDetail");

  els.tabs         = els.panel.querySelectorAll(".debug-tab");
  els.panels       = els.panel.querySelectorAll("[data-dbg-panel]");
  els.rawPre       = document.getElementById("dbgRawPanel");
  els.normalized   = document.getElementById("dbgNormalizedPanel");
  els.userEdit     = document.getElementById("dbgUserEditPanel");
  els.toSave       = document.getElementById("dbgToSavePanel");
  els.diffBody     = document.getElementById("dbgDiffBody");
  els.diffEmpty    = document.getElementById("dbgDiffEmpty");

  els.copyOcrBtn         = document.getElementById("dbgCopyOcrBtn");
  els.copySaveBtn        = document.getElementById("dbgCopySaveBtn");
  els.downloadBtn        = document.getElementById("dbgDownloadBtn");
  els.reanalyzeBtn       = document.getElementById("dbgReanalyzeBtn");
  els.saveVisionBtn      = document.getElementById("dbgSaveVisionBtn");
  els.downloadSavedBtn   = document.getElementById("dbgDownloadSavedBtn");

  els.checklist = document.getElementById("dbgChecklist");

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
  els.downloadSavedBtn.addEventListener("click", downloadSavedInvoice);
}

// ============================================================
// Public API — called by invoiceModal on transitions + edits
// ============================================================

/**
 * Point the debug panel at the wizard's current session slice.
 *
 * @param {{analysis:object|null, header:object|null, items:Array<object>, file?:File|null}} snapshot
 */
export function setSession({ analysis = null, header = null, items = [], file = null } = {}) {
  session.analysis    = analysis;
  session.header      = header;
  session.items       = items;
  session.file        = file;
  session.lastSavedId = null;    // fresh session — no persisted invoice yet
  refresh();
}

/**
 * Notify the panel that saveInvoice() has committed the current session to
 * LocalStorage as `invoiceId`. Post-save checklist items can now flip
 * green because we can look up the invoice via `ctx.onGetSavedInvoice`.
 */
export function notifySaved(invoiceId) {
  session.lastSavedId = invoiceId || null;
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
  renderDiffPanel();       // also updates the success-rate stat
  renderChecklist();
}

/** Reset every visible field — used when the wizard closes. */
export function clearDebugPanel() {
  session.analysis    = null;
  session.header      = null;
  session.items       = [];
  session.file        = null;
  session.lastSavedId = null;
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
  els.httpStatus.textContent  = d?.httpStatus != null ? String(d.httpStatus) : "—";
  els.latency.textContent     = d?.latencyMs != null ? `${d.latencyMs} ms` : "—";
  els.confidence.textContent  = d?.confidence != null ? `${Math.round(d.confidence * 100)}%` : "—";
  els.requestedAt.textContent = d?.requestedAt || "—";

  // HTTP status color: 2xx ok · 4xx/5xx error · null muted
  if (d?.httpStatus == null)      setState(els.httpStatus, els.httpStatus.textContent, "muted");
  else if (d.httpStatus < 300)    setState(els.httpStatus, String(d.httpStatus),        "ok");
  else                            setState(els.httpStatus, String(d.httpStatus),        "error");

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

  // Also render two thumbnails (원본 / 전처리) above the JSON block so a
  // developer can visually compare what Tesseract actually saw against the
  // upload. Injected purely from JS — the HTML shell stays unchanged.
  renderPreviewStrip(raw);
}

/** Build (or update) an image comparison strip sitting inline just before
 *  the Raw JSON pre. Idempotent — safe to call on every refresh. */
function renderPreviewStrip(raw) {
  const anchor = els.rawPre;
  if (!anchor?.parentNode) return;

  const originalUrl     = raw?.originalImage     || "";
  const preprocessedUrl = raw?.preprocessedImage || "";
  const lowConf         = Array.isArray(raw?.lowConfidenceLines) ? raw.lowConfidenceLines : [];
  const passes          = Array.isArray(raw?.passes) ? raw.passes : [];

  let strip = anchor.parentNode.querySelector(".dbg-preview-strip");
  if (!originalUrl && !preprocessedUrl && !lowConf.length && !passes.length) {
    if (strip) strip.remove();
    return;
  }

  if (!strip) {
    strip = document.createElement("div");
    strip.className = "dbg-preview-strip";
    // Inline styling so we don't need to touch modal.css.
    strip.style.cssText =
      "display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start;" +
      "margin:8px 0 12px;font-size:12px;";
    anchor.parentNode.insertBefore(strip, anchor);
  }
  strip.innerHTML = "";

  strip.appendChild(makePreviewTile("원본",       originalUrl));
  strip.appendChild(makePreviewTile("전처리 (OCR 입력)", preprocessedUrl));
  if (passes.length)  strip.appendChild(makePassesTile(passes, raw?.winningPsm));
  if (lowConf.length) strip.appendChild(makeLowConfTile(lowConf));
}

function makePreviewTile(label, dataUrl) {
  const tile = document.createElement("div");
  tile.style.cssText =
    "flex:1 1 200px;max-width:280px;display:flex;flex-direction:column;gap:4px;";
  const cap = document.createElement("div");
  cap.textContent = label + (dataUrl ? "" : " (없음)");
  cap.style.cssText = "font-weight:600;opacity:.75;";
  tile.appendChild(cap);
  if (dataUrl) {
    const img = document.createElement("img");
    img.src = dataUrl;
    img.alt = label;
    img.style.cssText =
      "max-width:100%;max-height:200px;background:#0002;border:1px dashed #8884;border-radius:4px;object-fit:contain;";
    tile.appendChild(img);
  } else {
    const holder = document.createElement("div");
    holder.textContent = "—";
    holder.style.cssText =
      "height:80px;display:flex;align-items:center;justify-content:center;" +
      "background:#0001;border:1px dashed #8883;border-radius:4px;color:#8886;";
    tile.appendChild(holder);
  }
  return tile;
}

function makePassesTile(passes, winningPsm) {
  const tile = document.createElement("div");
  tile.style.cssText =
    "flex:1 1 180px;max-width:260px;display:flex;flex-direction:column;gap:4px;";
  const cap = document.createElement("div");
  cap.textContent = "OCR pass 요약";
  cap.style.cssText = "font-weight:600;opacity:.75;";
  tile.appendChild(cap);
  const list = document.createElement("div");
  list.style.cssText =
    "display:grid;grid-template-columns:auto auto auto;gap:2px 8px;font-family:ui-monospace,monospace;font-size:11px;";
  const th = (t) => { const s = document.createElement("span"); s.textContent = t; s.style.opacity = ".55"; return s; };
  list.append(th("psm"), th("conf"), th("chars"));
  for (const p of passes) {
    const winner = String(p.psm) === String(winningPsm);
    const psmS  = document.createElement("span"); psmS.textContent = "psm=" + p.psm + (winner ? " ✓" : "");
    const confS = document.createElement("span"); confS.textContent = (p.confidence != null ? Math.round(p.confidence) + "%" : "—");
    const lenS  = document.createElement("span"); lenS.textContent  = String(p.textLength ?? 0);
    if (winner) [psmS, confS, lenS].forEach(el => el.style.fontWeight = "700");
    list.append(psmS, confS, lenS);
  }
  tile.appendChild(list);
  return tile;
}

function makeLowConfTile(lines) {
  const tile = document.createElement("div");
  tile.style.cssText =
    "flex:1 1 220px;max-width:320px;display:flex;flex-direction:column;gap:4px;";
  const cap = document.createElement("div");
  cap.textContent = `저(<60%) confidence 라인 · ${lines.length}건`;
  cap.style.cssText = "font-weight:600;opacity:.75;";
  tile.appendChild(cap);
  const box = document.createElement("div");
  box.style.cssText =
    "max-height:200px;overflow:auto;font-family:ui-monospace,monospace;font-size:11px;" +
    "background:#0001;border:1px dashed #8883;border-radius:4px;padding:6px;";
  const shown = lines.slice(0, 12);
  for (const l of shown) {
    const row = document.createElement("div");
    row.style.cssText = "padding:2px 0;border-bottom:1px dashed #8882;";
    row.textContent = `${String(l.confidence).padStart(2, " ")}% · ${l.text}`;
    box.appendChild(row);
  }
  if (lines.length > shown.length) {
    const more = document.createElement("div");
    more.textContent = `… 외 ${lines.length - shown.length}건`;
    more.style.cssText = "padding-top:4px;opacity:.6;";
    box.appendChild(more);
  }
  tile.appendChild(box);
  return tile;
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
    renderRate({ total: 0, recognized: 0, modified: 0, missing: 0 });
    return;
  }
  els.diffEmpty.hidden = true;

  let recognized = 0, modified = 0, missing = 0;
  const frag = document.createDocumentFragment();
  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.className = `dbg-diff-row field-${r.fieldState}`;
    tr.dataset.dbgField = r.key;
    tr.dataset.dbgFieldState = r.fieldState;
    tr.innerHTML =
      `<td>${esc(r.label)}</td>` +
      `<td>${esc(r.ocr)}</td>` +
      `<td>${esc(r.user)}</td>` +
      `<td>${esc(r.final)}</td>` +
      `<td class="col-status">${esc(r.statusLabel)}</td>`;
    frag.appendChild(tr);
    if      (r.fieldState === "recognized") recognized++;
    else if (r.fieldState === "modified")   modified++;
    else if (r.fieldState === "missing")    missing++;
  }
  els.diffBody.appendChild(frag);
  renderRate({ total: rows.length, recognized, modified, missing });
}

// ============================================================
// Auto-recognition rate
// ============================================================

function renderRate({ total, recognized, modified, missing }) {
  if (!total) {
    els.rateValue.textContent  = "—";
    els.rateValue.dataset.state = "none";
    els.rateDetail.textContent = "OCR 결과가 준비되면 인식률이 표시됩니다.";
    return;
  }
  const pct = Math.round((recognized / total) * 100);
  els.rateValue.textContent = `${pct}%`;
  els.rateValue.dataset.state = pct >= 90 ? "high" : pct >= 60 ? "mid" : "low";
  els.rateDetail.textContent =
    `${recognized} / ${total} 필드 자동 인식` +
    (modified ? ` · ${modified} 수정` : "") +
    (missing  ? ` · ${missing} 미인식` : "");
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

/**
 * Build the 3-way (OCR / User / Final) diff rows for the current session.
 * Each row also carries its own `fieldState`:
 *   • recognized — OCR value present and user kept it → GREEN
 *   • modified   — OCR value present but user changed it → ORANGE
 *   • missing    — OCR did not return a value → RED
 * The wizard's per-item indices are used to align OCR row ↔ user row.
 */
function buildDiffRows() {
  const a = session.analysis;
  if (!a || !session.header) return [];

  const proj = projectSave();
  const projInv = proj && !proj.error ? proj.invoice : null;
  const projItems = proj && !proj.error ? proj.items : [];

  const rows = [];
  const pushHeader = (key, label, ocr, user, final) =>
    rows.push(makeDiffRow(key, label, ocr, user, final));

  pushHeader("invoiceDate",     "거래일",     a.invoiceDate,       session.header.invoiceDate,     projInv?.invoiceDate);
  pushHeader("invoiceNumber",   "거래번호",   a.invoiceNumber,     session.header.invoiceNumber,   projInv?.invoiceNumber);
  pushHeader("supplier",        "거래처",     a.supplier?.name,    session.header.supplier,        projInv?.supplier);
  pushHeader("supplierPhone",   "연락처",     a.supplier?.contact, session.header.supplierPhone,   projInv?.supplierPhone);
  pushHeader("supplierAddress", "주소",       a.supplier?.region,  session.header.supplierAddress, projInv?.supplierAddress);

  const ocrRows = a.rows || [];
  const nowRows = session.items || [];
  const max = Math.max(ocrRows.length, nowRows.length);
  for (let i = 0; i < max; i++) {
    const o = ocrRows[i] || null;
    const n = nowRows[i] || null;
    const p = projItems[i] || null;

    if (o && !n) { rows.push(makeSpecialRow(i, "품목",
        summarizeOcr(o), "—", p ? summarizeItem(p) : "—", "missing", "→ 삭제됨")); continue; }
    if (!o && n) { rows.push(makeSpecialRow(i, "품목",
        "—", summarizeUser(n), p ? summarizeItem(p) : "—", "modified", "→ 추가됨")); continue; }

    rows.push(makeDiffRow(`#${i + 1}.name`,      `#${i + 1} 수종명`, o.name,      n.name       ?? n.speciesName, p?.speciesName));
    rows.push(makeDiffRow(`#${i + 1}.spec`,      `#${i + 1} 규격`,   o.spec,      n.spec,      p?.spec));
    rows.push(makeDiffRow(`#${i + 1}.unit`,      `#${i + 1} 단위`,   o.unit,      n.unit,      p?.unit));
    rows.push(makeDiffRow(`#${i + 1}.quantity`,  `#${i + 1} 수량`,   o.quantity,  n.quantity,  p?.quantity));
    rows.push(makeDiffRow(`#${i + 1}.unitPrice`, `#${i + 1} 단가`,   o.unitPrice, n.unitPrice, p?.unitPrice));
    rows.push(makeDiffRow(`#${i + 1}.amount`,    `#${i + 1} 금액`,   o.amount,    n.amount,    p?.amount));
  }
  return rows;
}

function makeDiffRow(key, label, ocr, user, final) {
  const ocrStr   = fmt(ocr);
  const userStr  = fmt(user);
  const finalStr = fmt(final);
  const ocrPresent = String(ocr ?? "").trim() !== "";
  let fieldState, statusLabel;
  if (!ocrPresent) {
    fieldState  = "missing";
    statusLabel = "→ OCR 미인식";
  } else if (String(ocr) === String(user ?? "")) {
    fieldState  = "recognized";
    statusLabel = "OCR 자동 인식";
  } else {
    fieldState  = "modified";
    statusLabel = "→ 사용자 수정";
  }
  return { key, label, ocr: ocrStr, user: userStr, final: finalStr, fieldState, statusLabel };
}

function makeSpecialRow(i, label, ocr, user, final, fieldState, statusLabel) {
  return {
    key:  `#${i + 1} ${label}`,
    label:`#${i + 1} ${label}`,
    ocr, user, final,
    fieldState, statusLabel
  };
}

function fmt(v) {
  if (v == null || v === "") return "—";
  return String(v);
}

function summarizeOcr(o) {
  return `${o.name || "?"} · ${o.spec || ""} · ${o.quantity || 0}${o.unit || ""} · ${o.unitPrice || 0}원`;
}
function summarizeUser(n) {
  return `${n.name || n.speciesName || "?"} · ${n.spec || ""} · ${n.quantity || 0}${n.unit || ""} · ${n.unitPrice || 0}원`;
}
function summarizeItem(p) {
  return `${p.speciesName || "?"} · ${p.spec || ""} · ${p.quantity || 0}${p.unit || ""} · ${p.unitPrice || 0}원`;
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

function downloadSavedInvoice() {
  if (!session.lastSavedId) { ctx.toast && ctx.toast("아직 저장된 거래명세서가 없습니다"); return; }
  if (!ctx.onGetSavedInvoice) { ctx.toast && ctx.toast("저장 조회 핸들러가 없습니다"); return; }
  const snapshot = ctx.onGetSavedInvoice(session.lastSavedId);
  if (!snapshot) { ctx.toast && ctx.toast("저장된 데이터를 찾을 수 없습니다"); return; }
  const name = `saved-invoice-${session.lastSavedId}.json`;
  downloadJson(name, snapshot);
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
// 실제 거래명세서 테스트 체크리스트
// ============================================================

/**
 * Compute the 10-item test checklist state from the current session.
 * Post-save items ("saved", "cardReflected", "historyReflected",
 * "statsRecomputed") flip from "pending" to "pass" once we can look
 * the freshly-persisted invoice up via `ctx.onGetSavedInvoice`.
 */
function renderChecklist() {
  if (!els.checklist) return;

  const a       = session.analysis;
  const d       = a?._debug || null;
  const rows    = a ? buildDiffRows() : [];
  const edited  = rows.some(r => r.fieldState === "modified");
  const fileMime = (session.file?.type || "").toLowerCase();

  const saved = session.lastSavedId && ctx.onGetSavedInvoice
    ? ctx.onGetSavedInvoice(session.lastSavedId)
    : null;

  const state = {
    jpg:              /image\/(?:jpeg|jpg)/.test(fileMime) ? "pass" : "pending",
    png:              /image\/png/.test(fileMime)          ? "pass" : "pending",
    pdf:              /application\/pdf/.test(fileMime)    ? "pass" : "pending",
    ocrOk:            a ? (a.ok !== false ? "pass" : "fail") : "pending",
    ocrError:         d?.errorMessage ? "pass" : (a && a.ok !== false ? "pass" : "pending"),
    edited:           edited ? "pass" : "pending",
    saved:            saved ? "pass" : "pending",
    cardReflected:    saved && saved.linkedSpecies?.length ? "pass" : "pending",
    historyReflected: saved && saved.items?.length          ? "pass" : "pending",
    statsRecomputed:  saved && saved.linkedSpecies?.length && saved.items?.length ? "pass" : "pending"
  };

  for (const li of els.checklist.querySelectorAll("li[data-dbg-check]")) {
    const key = li.dataset.dbgCheck;
    const s = state[key] || "pending";
    li.dataset.state = s;
    const icon = li.querySelector(".ck-icon");
    if (icon) icon.textContent = s === "pass" ? "✓" : s === "fail" ? "✗" : "☐";
  }
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
