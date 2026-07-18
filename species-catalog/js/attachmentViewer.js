/**
 * Attachment viewer modal — original invoice image · PDF · AI-compare tabs.
 *
 *   Transaction Detail [🖼 원본 이미지]  →  openAttachmentViewer(invoiceId)
 *
 * Loads the invoice's binary from IndexedDB via `attachmentStore.js` and
 * displays it in a large left stage (image → transform-based zoom/rotate;
 * PDF → iframe). A right-side tab strip shows three views for comparison:
 *
 *   • 원본        — filename / mime / size / uploaded-at / storage path
 *   • AI 분석 결과 — Vision API JSON, read-only
 *   • 최종 저장값 — Invoice header + linked InvoiceItems (post-edit)
 *
 * Zoom, rotate, download, and open-in-new-window are toolbar actions.
 * Object URLs are revoked on close to avoid leaks.
 */

import { state } from "./state.js";
import { getAttachment } from "./attachmentStore.js";

// ============================================================
// Cache + state
// ============================================================

const els = {};
let ctx = { toast: null };

const ZOOM_STEPS = [25, 50, 75, 100, 125, 150, 200, 300, 400];
const DEFAULT_ZOOM = 100;

const session = {
  invoiceId: null,
  invoice: null,
  attachment: null,
  blob: null,
  objectUrl: null,
  zoom: DEFAULT_ZOOM,
  rotate: 0,
  isPdf: false
};

// ============================================================
// Init
// ============================================================

export function initAttachmentViewer(deps) {
  ctx = deps || {};

  els.modal       = document.getElementById("attachmentViewerModal");
  els.invoiceIdLb = document.getElementById("viewerInvoiceId");
  els.filename    = document.getElementById("viewerFilename");
  els.zoomOutBtn  = document.getElementById("viewerZoomOutBtn");
  els.zoomInBtn   = document.getElementById("viewerZoomInBtn");
  els.zoomResetBtn = document.getElementById("viewerZoomResetBtn");
  els.zoomLevel   = document.getElementById("viewerZoomLevel");
  els.rotateBtn   = document.getElementById("viewerRotateBtn");
  els.downloadBtn = document.getElementById("viewerDownloadBtn");
  els.openNewBtn  = document.getElementById("viewerOpenNewBtn");

  els.stageContainer = document.getElementById("viewerImageContainer");
  els.image          = document.getElementById("viewerImage");
  els.pdf            = document.getElementById("viewerPdfFrame");
  els.empty          = document.getElementById("viewerEmpty");

  els.metaFilename = document.getElementById("viewerMetaFilename");
  els.metaMime     = document.getElementById("viewerMetaMime");
  els.metaSize     = document.getElementById("viewerMetaSize");
  els.metaCreated  = document.getElementById("viewerMetaCreated");
  els.metaPath     = document.getElementById("viewerMetaPath");
  els.aiJson       = document.getElementById("viewerAiJson");
  els.finalJson    = document.getElementById("viewerFinalJson");

  els.tabs   = els.modal.querySelectorAll(".viewer-tab");
  els.panels = els.modal.querySelectorAll(".viewer-tab-panel");

  wireEvents();
}

function wireEvents() {
  els.modal.addEventListener("click", e => {
    if (e.target.matches("[data-close-viewer]")) close();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !els.modal.hidden) close();
  });

  els.zoomInBtn.addEventListener("click",   () => stepZoom(+1));
  els.zoomOutBtn.addEventListener("click",  () => stepZoom(-1));
  els.zoomResetBtn.addEventListener("click", () => setZoom(DEFAULT_ZOOM));
  els.rotateBtn.addEventListener("click",   () => setRotate((session.rotate + 90) % 360));
  els.downloadBtn.addEventListener("click", downloadCurrent);
  els.openNewBtn.addEventListener("click",  openInNewTab);

  for (const tab of els.tabs) {
    tab.addEventListener("click", () => switchTab(tab.dataset.viewerTab));
  }
}

// ============================================================
// Open / close
// ============================================================

/**
 * Open the viewer for a given Invoice. If the invoice has no attachment
 * the modal still opens but the stage shows an "no image" placeholder;
 * the AI / final tabs stay useful.
 *
 * @param {string} invoiceId
 */
export async function openAttachmentViewer(invoiceId) {
  const inv = state.data.invoices.find(i => i.id === invoiceId);
  if (!inv) { ctx.toast && ctx.toast("거래를 찾을 수 없습니다"); return; }

  resetSession();
  session.invoiceId  = invoiceId;
  session.invoice    = inv;
  session.attachment = inv.attachment || null;

  els.invoiceIdLb.textContent = inv.id;
  els.filename.textContent    = session.attachment?.filename || "(원본 없음)";
  fillMetaPanel();
  fillAiPanel();
  fillFinalPanel();
  switchTab("original");

  // Show modal first so layout is stable before the image loads.
  els.modal.hidden = false;
  els.modal.setAttribute("aria-hidden", "false");

  if (!session.attachment?.id) {
    showEmpty();
    return;
  }

  try {
    const record = await getAttachment(session.attachment.id);
    if (!record?.blob) { showEmpty(); return; }
    session.blob = record.blob;
    session.objectUrl = URL.createObjectURL(record.blob);
    session.isPdf = (record.mimeType || "").toLowerCase() === "application/pdf";
    if (session.isPdf) {
      els.image.parentElement.hidden = true;
      els.pdf.hidden = false;
      els.empty.hidden = true;
      els.pdf.src = session.objectUrl;
      els.rotateBtn.disabled = true;
      els.zoomInBtn.disabled = true;
      els.zoomOutBtn.disabled = true;
      els.zoomResetBtn.disabled = true;
    } else {
      els.image.parentElement.hidden = false;
      els.pdf.hidden = true;
      els.empty.hidden = true;
      els.image.src = session.objectUrl;
      els.rotateBtn.disabled = false;
      els.zoomInBtn.disabled = false;
      els.zoomOutBtn.disabled = false;
      els.zoomResetBtn.disabled = false;
      setZoom(DEFAULT_ZOOM);
      setRotate(0);
    }
  } catch (err) {
    ctx.toast && ctx.toast("원본을 불러올 수 없습니다: " + (err?.message || err));
    showEmpty();
  }
}

function close() {
  els.modal.hidden = true;
  els.modal.setAttribute("aria-hidden", "true");
  if (session.objectUrl) URL.revokeObjectURL(session.objectUrl);
  session.objectUrl = null;
  els.image.removeAttribute("src");
  els.pdf.removeAttribute("src");
}

function resetSession() {
  if (session.objectUrl) URL.revokeObjectURL(session.objectUrl);
  session.invoiceId  = null;
  session.invoice    = null;
  session.attachment = null;
  session.blob       = null;
  session.objectUrl  = null;
  session.zoom       = DEFAULT_ZOOM;
  session.rotate     = 0;
  session.isPdf      = false;
  els.image.removeAttribute("src");
  els.pdf.removeAttribute("src");
}

function showEmpty() {
  els.image.parentElement.hidden = true;
  els.pdf.hidden = true;
  els.empty.hidden = false;
  els.downloadBtn.disabled = true;
  els.openNewBtn.disabled = true;
  els.zoomInBtn.disabled = true;
  els.zoomOutBtn.disabled = true;
  els.zoomResetBtn.disabled = true;
  els.rotateBtn.disabled = true;
}

// ============================================================
// Zoom + rotate (image only)
// ============================================================

function setZoom(pct) {
  session.zoom = pct;
  els.zoomLevel.textContent = `${pct}%`;
  applyTransform();
  els.zoomInBtn.disabled  = pct >= ZOOM_STEPS[ZOOM_STEPS.length - 1];
  els.zoomOutBtn.disabled = pct <= ZOOM_STEPS[0];
}

function stepZoom(direction) {
  const idx = ZOOM_STEPS.indexOf(session.zoom);
  const nextIdx = Math.max(0, Math.min(ZOOM_STEPS.length - 1,
    (idx >= 0 ? idx : nearestStepIndex(session.zoom)) + direction));
  setZoom(ZOOM_STEPS[nextIdx]);
}

function nearestStepIndex(val) {
  let best = 0, bestDiff = Infinity;
  for (let i = 0; i < ZOOM_STEPS.length; i++) {
    const d = Math.abs(ZOOM_STEPS[i] - val);
    if (d < bestDiff) { bestDiff = d; best = i; }
  }
  return best;
}

function setRotate(deg) {
  session.rotate = deg;
  applyTransform();
}

function applyTransform() {
  const scale = session.zoom / 100;
  els.stageContainer.style.transform = `scale(${scale}) rotate(${session.rotate}deg)`;
}

// ============================================================
// Toolbar actions
// ============================================================

function downloadCurrent() {
  if (!session.objectUrl) return;
  const a = document.createElement("a");
  a.href     = session.objectUrl;
  a.download = session.attachment?.filename || "attachment";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function openInNewTab() {
  if (!session.objectUrl) return;
  window.open(session.objectUrl, "_blank", "noopener");
}

// ============================================================
// Tab switching
// ============================================================

function switchTab(name) {
  for (const t of els.tabs) {
    const active = t.dataset.viewerTab === name;
    t.classList.toggle("active", active);
    t.setAttribute("aria-selected", active ? "true" : "false");
  }
  for (const p of els.panels) {
    p.hidden = p.dataset.viewerTabPanel !== name;
  }
}

// ============================================================
// Right-side panels
// ============================================================

function fillMetaPanel() {
  const a = session.attachment;
  if (!a) {
    els.metaFilename.textContent = "—";
    els.metaMime.textContent     = "—";
    els.metaSize.textContent     = "—";
    els.metaCreated.textContent  = "—";
    els.metaPath.textContent     = "—";
    return;
  }
  els.metaFilename.textContent = a.filename || "—";
  els.metaMime.textContent     = a.mimeType || "—";
  els.metaSize.textContent     = formatBytes(a.size);
  els.metaCreated.textContent  = a.createdAt || "—";
  els.metaPath.textContent     = a.storagePath || "—";
}

function fillAiPanel() {
  const inv = session.invoice;
  const analysis = inv?.analysis || null;
  els.aiJson.textContent = analysis
    ? JSON.stringify(analysis, null, 2)
    : "이 거래에 저장된 AI 분석 결과가 없습니다.";
}

function fillFinalPanel() {
  const inv = session.invoice;
  if (!inv) { els.finalJson.textContent = "—"; return; }
  const items = state.data.invoiceItems
    .filter(it => it.invoiceId === inv.id)
    .map(({ id, invoiceId, speciesId, speciesName, spec, unit, quantity, unitPrice, amount }) => ({
      id, speciesId, speciesName, spec, unit, quantity, unitPrice, amount
    }));
  const payload = {
    invoice: {
      id:            inv.id,
      invoiceDate:   inv.invoiceDate,
      invoiceNumber: inv.invoiceNumber,
      supplier:      inv.supplier,
      supplierPhone: inv.supplierPhone,
      supplierAddress: inv.supplierAddress
    },
    items
  };
  els.finalJson.textContent = JSON.stringify(payload, null, 2);
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024)             return `${n} B`;
  if (n < 1024 * 1024)      return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
