/**
 * OCR / invoice-analysis module — **fully free, client-side Tesseract.js**.
 *
 * Three entry points:
 *   analyzeInvoice(file)      — Free browser OCR via Tesseract.js (+ pdf.js).
 *   analyzeInvoiceMock(file)  — Deterministic sample used by tests + demo.
 *   parseInvoiceText(text)    — Regex parser for OCR / pasted 명세서 text.
 *
 * No API keys · no proxy · no cost. Tesseract.js (Korean + English) and
 * pdf.js are loaded on-demand from public CDNs and executed entirely in
 * the user's browser, so the same static bundle works on GitHub Pages.
 *
 * `analyzeInvoice()` keeps the exact AnalyzeResult shape the wizard
 * expects (invoiceDate / invoiceNumber / supplier / rows / meta / _debug),
 * so every downstream consumer (Debug Panel, matcher, invoiceModal) is
 * unchanged.
 *
 * Bypass switches for tests / demos:
 *   • window.__OCR_MODE__ = "mock"  → returns analyzeInvoiceMock(file)
 *   • window.__OCR_MODE__ = "fail"  → throws canned error with _debug
 *   • URL query    ?ocr=mock | ?ocr=fail   — same effect
 *   • URL query    ?ocr=real          — force real OCR (default)
 */

// ============================================================
// CDN endpoints (loaded lazily, only when user actually starts an OCR run)
// ============================================================

const TESSERACT_SRC   = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
const PDFJS_SRC       = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.min.mjs";
const PDFJS_WORKER_SRC = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.worker.min.mjs";

import { preprocessForOcr, canvasToThumbnailDataUrl } from "./preprocess.js";

// Tesseract PSM constants we experiment with. Names match the upstream enum.
const PSM = { SINGLE_COLUMN: "4", SINGLE_BLOCK: "6", SPARSE_TEXT: "11" };
const PRIMARY_PSM = PSM.SINGLE_BLOCK;     // best default for tabular invoices
const RETRY_PSM   = PSM.SINGLE_COLUMN;    // fallback for column-heavy layouts
// If the primary pass' mean word confidence is below this we run a second
// pass with RETRY_PSM and keep whichever pass scored higher.
const CONFIDENCE_RETRY_THRESHOLD = 65;

// ============================================================
// Watchdog thresholds — when analyzeInvoice() stalls silently the wizard
// used to hang at "분석 중" forever. Each stage now has an idle watchdog:
// if `onProgress` doesn't fire for IDLE_TIMEOUT_MS the outer analyzer
// rejects with the last-known stage so the UI can surface it.
// ============================================================

const IDLE_TIMEOUT_MS = 15_000;       // no progress for 15s → timeout (user spec)
const CDN_LOAD_TIMEOUT_MS = 15_000;   // <script>/import() must resolve within 15s

// ============================================================
// Regex constants — 거래명세서 layouts vary a lot, hence the length.
// ============================================================

// 조경 규격 관용 표기: R6, H1.5, B10, W2, 3분, 5포트, 2주 …
const SPEC_RE =
  /(?:R\s?\d+(?:\.\d+)?|H\s?\d+(?:\.\d+)?|B\s?\d+(?:\.\d+)?|W\s?\d+(?:\.\d+)?|\d+\s?(?:분|포트|주|본|치|㎝|cm|㎜|mm|m))/gi;

// 가격: 45,000 · 12000 · 45,000원 · 50원 · 100.- · 500.- (거래명세서 관례)
const PRICE_RE =
  /\d{1,3}(?:,\d{3})+(?:\s?원)?|\d{4,}(?:\s?원)?|\d{1,4}\s*원|\d{1,4}\s*\.\s*[-–]/g;

// Token-bounded phone regex — the 0 must NOT be preceded or followed by
// another digit, otherwise embedded price sequences like `500 3200 1600000`
// look like `0 3200 1600` to the naive matcher and get flagged as phones.
const PHONE_RE_G = /(?<!\d)0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)/g;
const PHONE_TEST_RE = /(?<!\d)0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)/;
const MOBILE_PREFIX_RE = /^01[016789]/;

const PROVINCE_RE =
  /(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충청?[북남]?|충남|충북|전라?[북남]?|전남|전북|경상?[북남]?|경남|경북|제주)/;
const ADDRESS_LINE_RE = new RegExp(
  `(?:${PROVINCE_RE.source})[가-힣 \\d\\-()·]*?(?:시|군|구)[가-힣 \\d\\-()·]*?(?:동|면|리|로|길)[가-힣 \\d\\-()·]*`,
  "g"
);
const REGION_HINT_RE = new RegExp(`${PROVINCE_RE.source}[가-힣 \\d]*?[시군구]`);
const UNIT_HINT_RE = /(?:^|\s)(주|포트|본|그루|치|개|EA)(?:\s|$)/;

const BIZ_SUFFIX_KEYWORDS = [
  "농원", "수목원", "원예", "농장", "조합", "산업", "묘목원", "묘목장",
  "철쭉원", "화훼단지", "축제조합", "마을조합", "영농조합", "산림조합",
  "㈜", "주식회사", "회사", "상사", "화훼", "너서리", "널서리", "팜"
];
// Label + delimiter + inline value. Delimiter is REQUIRED so a bare "공급자"
// line doesn't scavenge the next line's own label ("공급자\n상호 : 천리포..."),
// and the capture class excludes \n so the value stays on-line.
const BIZ_KEYWORD_RE =
  /(?:상\s*호|업체명|공급자|공급업체|사업자명)[ \t]*[:.\-–][ \t]*([가-힣A-Za-z0-9()㈜ \t]{2,40})/;
const ADDRESS_KEYWORD_RE =
  /(?:주\s*소|소\s*재\s*지|사\s*업\s*장\s*소\s*재\s*지|address)\s*[:.\-–]?\s*([^\n]+)/i;
const MOBILE_KEYWORD_RE =
  /(?:핸\s*드\s*폰|휴\s*대(?:\s*폰|\s*전\s*화)|모\s*바\s*일|H\.?P|Mobile|M\.)\s*[:.\-–]?\s*(01[0-9][-.\s]?\d{3,4}[-.\s]?\d{4})/i;

const HEADER_LINE_RE =
  /^(?:상\s*호|업체명|공급자|공급업체|사업자|사업자번호|주\s*소|소\s*재\s*지|사\s*업\s*장|핸\s*드\s*폰|휴\s*대|전\s*화|TEL|Tel|FAX|Fax|팩스|대표자|담당자|발행일|일자|번호|합계|총계|부가세|VAT|세금|성\s*명|업\s*태|종\s*목|공|급)/i;
const COLUMN_HEADER_WORDS = new Set([
  "품명", "품목", "규격", "수종", "단위", "단가", "수량", "금액", "번호",
  "합계", "총계", "적요", "비고", "공급가액", "월일", "성명", "업태", "종목"
]);
const NOISE_NAMES = new Set([
  "귀하", "귀중", "원정", "일금", "이하", "이상", "위와", "아래", "계산",
  "발행", "청구", "송장", "인수자", "잔금", "전잔금", "입금", "본사",
  "거래명세서", "거래명세표", "명세서", "견적서", "발주서", "청구서", "영수증",
  "대량", "납품", "당사", "귀사", "일자"
]);
// A row is a "date-only" line when it has 년/월/일 markers OR a pure
// YYYY-MM-DD / YYYY.MM.DD / YYYY/MM/DD triple — those must never be
// treated as item rows even when they carry Korean noise next to them.
const DATE_LINE_RE = /(?:\d{2,4}\s*년|\d{1,2}\s*월|\d{1,2}\s*일|(?:19|20)\d{2}[-.\/]\d{1,2}[-.\/]\d{1,2})/;
const META_LINE_RE = /^(?:금\s*액|아\s*래|위\s*와|계\s*산|일\s*금|합\s*계|총\s*계|공\s*급\s*자|공\s*급\s*받)/;

// ============================================================
// Public API
// ============================================================

/**
 * @typedef {{name:string, region:string, contact:string}} Supplier
 * @typedef {{name:string, spec:string, unit:string, price:number}} InvoiceRow
 * @typedef {{ok:boolean, reason?:string, supplier:Supplier, rows:InvoiceRow[], meta?:object}} AnalyzeResult
 */

/**
 * Analyze an invoice (JPG · PNG · PDF) with **Tesseract.js** entirely in
 * the browser. No API keys · no proxy · no server-side cost.
 *
 * Pipeline
 *   1. Route by mode (mock / fail / real — via `window.__OCR_MODE__` or `?ocr=`).
 *   2. Load Tesseract from CDN (once, cached). PDFs also load pdf.js and
 *      render the first page to a canvas.
 *   3. Run `worker.recognize()` with Korean + English trained data.
 *   4. Normalize raw text (fragmented Hangul, spec spacing, price commas).
 *   5. Reuse {@link parseInvoiceText} to extract supplier + item rows.
 *   6. Return the exact same AnalyzeResult shape the wizard expects
 *      (invoiceDate / invoiceNumber / supplier / rows / meta / _debug),
 *      so `matcher.js`, the Debug Panel, and every downstream consumer
 *      keep working unchanged.
 *
 * @param {File} file
 * @param {{ onProgress?: (p:{stage:string,percent:number|null,message?:string}) => void, mock?: boolean }} [opts]
 * @returns {Promise<AnalyzeInvoiceMockResult>}
 */
export async function analyzeInvoice(file, opts = {}) {
  if (!file) throw new Error("파일이 선택되지 않았습니다.");

  const mode = getOcrMode(opts);
  console.info("[vision] analyzeInvoice ▶ mode=", mode, "· file=", file?.name, file?.type, file?.size);
  if (mode === "mock") return analyzeInvoiceMock(file);
  if (mode === "fail") throw makeCannedError();

  const rawOnProgress = typeof opts.onProgress === "function" ? opts.onProgress : () => {};
  const requestedAt = new Date().toISOString();
  const t0 = Date.now();

  // ---------- Stage tracking + idle watchdog ----------
  //
  // The wizard used to hang at Step 2 whenever any awaited step below
  // silently stalled (CDN never fires onload/onerror, Tesseract worker
  // hangs after `loading language traineddata`, pdf.js worker stuck).
  // We now:
  //   1. Track `currentStage` in the outer closure so we can name it.
  //   2. Race the whole flow against an IDLE watchdog — every progress
  //      event resets the timer; if IDLE_TIMEOUT_MS ms pass with no
  //      activity we reject with a stage-tagged error.
  //   3. Log every stage transition to the console so user can see
  //      exactly where a hang would have happened.
  let currentStage = "init";
  let currentMessage = "";
  const onProgress = (p) => {
    if (p && p.stage) currentStage = p.stage;
    if (p && p.message) currentMessage = p.message;
    console.info("[vision] progress ·", currentStage, "·", p?.percent ?? "-", "·", currentMessage);
    resetWatchdog();
    try { rawOnProgress(p); } catch (cbErr) {
      console.warn("[vision] onProgress callback threw:", cbErr);
    }
  };

  let watchdogTimer = null;
  let watchdogRejector = null;
  const watchdogPromise = new Promise((_res, rej) => { watchdogRejector = rej; });
  function resetWatchdog() {
    if (watchdogTimer) clearTimeout(watchdogTimer);
    watchdogTimer = setTimeout(() => {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      const err = new Error(
        `OCR 분석이 ${IDLE_TIMEOUT_MS / 1000}초 동안 응답이 없어 중단되었습니다. ` +
        `멈춘 단계: "${currentStage}"` +
        (currentMessage ? ` (${currentMessage})` : "") +
        ` · 총 ${elapsed}초 경과`
      );
      err._stalledStage = currentStage;
      console.error("[vision] watchdog ✗ idle timeout at stage:", currentStage, "·", currentMessage);
      watchdogRejector(err);
    }, IDLE_TIMEOUT_MS);
  }
  resetWatchdog();

  try {
    const result = await Promise.race([
      runOcrPipeline(file, onProgress, () => currentStage, requestedAt, t0),
      watchdogPromise
    ]);
    if (watchdogTimer) clearTimeout(watchdogTimer);
    console.info("[vision] analyzeInvoice ✓ resolved · latencyMs=",
                 Date.now() - t0, "· rows=", result?.rows?.length);
    return result;
  } catch (err) {
    if (watchdogTimer) clearTimeout(watchdogTimer);
    console.error("[vision] analyzeInvoice ✗ rejected at stage:", currentStage, "·", err?.message);
    const errOut = new Error(err?.message || String(err));
    errOut._stalledStage = err?._stalledStage || currentStage;
    errOut._debug = {
      provider:     "tesseract",
      model:        "tesseract-5 (kor+eng)",
      requestedAt,
      latencyMs:    Date.now() - t0,
      confidence:   null,
      errorMessage: errOut.message,
      httpStatus:   null,
      stalledStage: errOut._stalledStage,
      raw:          null
    };
    throw errOut;
  }
}

/** The actual OCR pipeline, extracted so `analyzeInvoice()` can race it
 *  against the idle watchdog. Every stage boundary calls `onProgress()`
 *  which both surfaces to the wizard UI and resets the watchdog timer.
 *
 *  Pipeline (v2 — quality-focused):
 *   1. Source → canvas (PDF via pdf.js, image via ImageBitmap)
 *   2. **Preprocess canvas** — 2× upscale · gray · contrast · sharpen
 *   3. Load Tesseract, create ONE reusable worker
 *   4. Recognize with PRIMARY_PSM (SINGLE_BLOCK) + preserve_interword_spaces
 *   5. If mean word confidence < CONFIDENCE_RETRY_THRESHOLD, re-recognize
 *      with RETRY_PSM (SINGLE_COLUMN) and keep the better pass
 *   6. Parse the winning pass' text
 *
 *  Preprocessing is toggleable via `?preprocess=off` for A/B comparison. */
async function runOcrPipeline(file, onProgress, getStage, requestedAt, t0) {
  // Step 1 — Prepare an image source (canvas for PDF, blob for image).
  let originalSource;
  if (isPdf(file)) {
    onProgress({ stage: "pdf", percent: 4, message: "PDF 첫 페이지 렌더링 중…" });
    originalSource = await pdfToCanvas(file);
    onProgress({ stage: "pdf-ready", percent: 7, message: "PDF 렌더링 완료" });
  } else if (isImage(file)) {
    originalSource = file;
  } else {
    throw new Error("지원하지 않는 파일 형식입니다. JPG · PNG · PDF 만 지원합니다.");
  }

  // Step 2 — Preprocess (unless user set ?preprocess=off).
  const preprocessEnabled = getPreprocessEnabled();
  let ocrSource;
  let originalThumb = "";
  let preprocessedThumb = "";
  try {
    if (preprocessEnabled) {
      onProgress({ stage: "preprocess", percent: 9, message: "이미지 전처리 중… (upscale · gray · contrast · sharpen)" });
      ocrSource = await preprocessForOcr(originalSource, { scale: 2 });
      originalThumb     = await sourceToThumbnail(originalSource, 320);
      preprocessedThumb = canvasToThumbnailDataUrl(ocrSource, { maxWidth: 320, quality: 0.6 });
    } else {
      ocrSource = originalSource;
      originalThumb = await sourceToThumbnail(originalSource, 320);
    }
  } catch (err) {
    // Preprocessing must never break OCR — fall through to raw source.
    console.warn("[vision] preprocess failed, falling back to raw source:", err?.message || err);
    ocrSource = originalSource;
  }

  // Step 3 — Load Tesseract on-demand from CDN (with CDN-load timeout).
  onProgress({ stage: "loading-tesseract", percent: 12, message: "Tesseract.js 로드 중…" });
  const Tesseract = await loadTesseract();
  onProgress({ stage: "loaded-tesseract", percent: 15, message: "언어팩(kor+eng) 준비 중…" });

  // Step 4 — Create worker + recognize. Tesseract fires its logger with
  // status changes ("loading language traineddata", "recognizing text", …)
  // which we forward as progress so the watchdog stays alive.
  let worker;
  try {
    worker = await Tesseract.createWorker(["kor", "eng"], 1, {
      logger: m => {
        if (!m || !m.status) return;
        if (m.status === "recognizing text") {
          onProgress({
            stage:   "recognizing",
            percent: 15 + Math.round((m.progress || 0) * 75),
            message: `OCR 진행 중 · ${Math.round((m.progress || 0) * 100)}%`
          });
        } else {
          onProgress({ stage: m.status, percent: null, message: m.status });
        }
      }
    });
  } catch (err) {
    throw new Error(`Tesseract worker 생성 실패 (stage=${getStage()}): ${err?.message || err}`);
  }

  // preserve_interword_spaces keeps multi-space table columns intact so
  // parseInvoiceText can still tell 품목 / 규격 / 수량 / 단가 columns
  // apart when reading a single flattened line.
  try {
    await worker.setParameters({
      tessedit_pageseg_mode:    PRIMARY_PSM,
      preserve_interword_spaces: "1"
    });
  } catch (err) {
    console.warn("[vision] setParameters failed (proceeding with defaults):", err?.message || err);
  }

  const passes = [];  // audit trail for _debug.raw

  // ---------- Primary pass ----------
  let primaryData;
  try {
    onProgress({ stage: `recognize-psm${PRIMARY_PSM}`, percent: 25,
                 message: `OCR 실행 (psm=${PRIMARY_PSM})` });
    ({ data: primaryData } = await worker.recognize(ocrSource));
  } catch (err) {
    try { await worker.terminate(); } catch { /* ignore secondary */ }
    throw new Error(`OCR 인식 실패 (stage=${getStage()}): ${err?.message || err}`);
  }
  passes.push(summarizePass(PRIMARY_PSM, primaryData));
  console.info("[vision] pass psm=" + PRIMARY_PSM + " · confidence=" +
               (primaryData.confidence ?? "n/a") + " · text.length=" +
               (primaryData.text?.length ?? 0));

  // ---------- Confidence-based retry ----------
  let winningData = primaryData;
  let winningPsm  = PRIMARY_PSM;
  const primaryConf = typeof primaryData.confidence === "number" ? primaryData.confidence : 0;
  if (primaryConf < CONFIDENCE_RETRY_THRESHOLD) {
    onProgress({ stage: `recognize-psm${RETRY_PSM}`, percent: 60,
                 message: `1차 confidence 낮음 (${Math.round(primaryConf)}%) — psm=${RETRY_PSM} 로 재시도` });
    try {
      await worker.setParameters({ tessedit_pageseg_mode: RETRY_PSM });
      const { data: retryData } = await worker.recognize(ocrSource);
      passes.push(summarizePass(RETRY_PSM, retryData));
      console.info("[vision] pass psm=" + RETRY_PSM + " · confidence=" +
                   (retryData.confidence ?? "n/a") + " · text.length=" +
                   (retryData.text?.length ?? 0));
      // Pick the pass with higher confidence. Ties: prefer primary (fewer surprises).
      if ((retryData.confidence ?? 0) > primaryConf) {
        winningData = retryData;
        winningPsm  = RETRY_PSM;
      }
    } catch (err) {
      // Retry failure is non-fatal — keep the primary result.
      console.warn("[vision] retry pass failed:", err?.message || err);
    }
  }
  try { await worker.terminate(); } catch { /* ignore — recognize already succeeded */ }

  onProgress({ stage: "postprocess", percent: 96, message: "텍스트 정규화 · 파싱 중…" });

  // Step 5 — Normalize raw text + parse.
  const rawText   = winningData.text || "";
  const normText  = normalizeOcrText(rawText);
  const parsed    = parseInvoiceText(normText);

  // Per-line low-confidence flag so Debug Panel can highlight suspect rows.
  const lowConfLines = pickLowConfidenceLines(winningData);

  // Step 6 — Build AnalyzeResult (identical shape to Mock/Vision).
  const latencyMs = Date.now() - t0;
  onProgress({ stage: "done", percent: 100, message: "완료" });

  return {
    ok: true,
    mock: false,
    reason: "",
    invoiceDate:   extractInvoiceDate(normText),
    invoiceNumber: extractInvoiceNumber(normText),
    supplier:      parsed.supplier,
    rows:          parsed.rows.map(r => ({
      name:      r.name,
      spec:      r.spec || "",
      unit:      r.unit || "주",
      quantity:  1,
      unitPrice: Number(r.price) || 0,
      amount:    Number(r.price) || 0
    })),
    meta: {
      filename: file.name || "",
      size:     file.size || 0,
      type:     file.type || "",
      model:    "tesseract-5"
    },
    _debug: {
      provider:     "tesseract",
      model:        "tesseract-5 (kor+eng)",
      requestedAt,
      latencyMs,
      confidence:   typeof winningData.confidence === "number" ? winningData.confidence / 100 : null,
      errorMessage: null,
      httpStatus:   null,   // local OCR — no HTTP round-trip
      raw: {
        text:          rawText,
        normalized:    normText,
        tesseractConfidence: winningData.confidence ?? null,
        lineCount:     Array.isArray(winningData.lines) ? winningData.lines.length : 0,
        wordCount:     Array.isArray(winningData.words) ? winningData.words.length : 0,
        // Quality-focused additions
        preprocessed:        preprocessEnabled,
        primaryPsm:          PRIMARY_PSM,
        winningPsm,
        passes,              // per-psm confidence + text length
        lowConfidenceLines:  lowConfLines,
        originalImage:       originalThumb,
        preprocessedImage:   preprocessedThumb
      }
    }
  };
}

/** Which passes ran, and how each did — for Debug Panel audit + regression. */
function summarizePass(psm, data) {
  return {
    psm,
    confidence: data?.confidence ?? null,
    textLength: data?.text?.length ?? 0,
    lineCount:  Array.isArray(data?.lines) ? data.lines.length : 0,
    wordCount:  Array.isArray(data?.words) ? data.words.length : 0
  };
}

/** Return every OCR line whose confidence is below 60 so the Debug Panel
 *  can highlight suspect rows for the user to double-check. */
function pickLowConfidenceLines(data) {
  const out = [];
  if (!Array.isArray(data?.lines)) return out;
  for (const line of data.lines) {
    if (typeof line?.confidence === "number" && line.confidence < 60) {
      const text = (line.text || "").trim();
      if (text) out.push({ text, confidence: Math.round(line.confidence) });
    }
  }
  return out;
}

/** Encode any source (File/Blob/Image/Canvas) to a small JPEG thumbnail
 *  data URL for the Debug Panel preview strip. */
async function sourceToThumbnail(source, maxWidth) {
  try {
    let bitmap, w, h;
    if (source instanceof HTMLCanvasElement) {
      return canvasToThumbnailDataUrl(source, { maxWidth });
    } else if (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) {
      bitmap = source; w = source.naturalWidth || source.width; h = source.naturalHeight || source.height;
    } else if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
      bitmap = source; w = source.width; h = source.height;
    } else if (source instanceof Blob) {
      bitmap = await createImageBitmap(source); w = bitmap.width; h = bitmap.height;
    } else {
      return "";
    }
    const s = Math.min(1, maxWidth / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * s));
    const th = Math.max(1, Math.round(h * s));
    const tc = document.createElement("canvas");
    tc.width = tw; tc.height = th;
    const ctx = tc.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "medium";
    ctx.drawImage(bitmap, 0, 0, tw, th);
    return tc.toDataURL("image/jpeg", 0.6);
  } catch (err) {
    console.warn("[vision] sourceToThumbnail failed:", err?.message || err);
    return "";
  }
}

/** Preprocessing on by default. `?preprocess=off` disables for A/B. */
function getPreprocessEnabled() {
  if (typeof window === "undefined") return true;
  try {
    const p = new URL(window.location.href).searchParams.get("preprocess");
    if (p === "off" || p === "0" || p === "false") return false;
  } catch { /* SSR-safe */ }
  return true;
}

// ============================================================
// Mode dispatch (mock · fail · real)
// ============================================================

function getOcrMode(opts) {
  if (opts?.mock) return "mock";
  const w = typeof window !== "undefined" ? window : null;
  if (w?.__OCR_MODE__ === "mock" || w?.__OCR_MODE__ === "fail" || w?.__OCR_MODE__ === "real") {
    return w.__OCR_MODE__;
  }
  if (w) {
    try {
      const p = new URL(w.location.href).searchParams.get("ocr");
      if (p === "mock" || p === "fail" || p === "real") return p;
    } catch { /* SSR-safe */ }
  }
  return "real";
}

function makeCannedError() {
  const err = new Error("테스트 강제 오류 (?ocr=fail)");
  err._debug = {
    provider:     "tesseract",
    model:        "tesseract-5 (kor+eng)",
    requestedAt:  new Date().toISOString(),
    latencyMs:    0,
    confidence:   null,
    errorMessage: err.message,
    httpStatus:   null,
    raw:          { forced: true }
  };
  return err;
}

// ============================================================
// CDN loaders (lazy)
// ============================================================

let tesseractPromise = null;
let pdfjsPromise     = null;

function loadTesseract() {
  if (typeof window !== "undefined" && window.Tesseract) return Promise.resolve(window.Tesseract);
  if (tesseractPromise) return tesseractPromise;
  // Race the <script> load against a hard timeout so a silent CDN stall
  // (neither onload nor onerror ever fires) can't hang the whole wizard.
  tesseractPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src   = TESSERACT_SRC;
    s.async = true;
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      tesseractPromise = null;
      const err = new Error(`Tesseract.js CDN 로드 시간초과 (${CDN_LOAD_TIMEOUT_MS / 1000}초) — ${TESSERACT_SRC}`);
      console.error("[vision] loadTesseract ✗ timeout:", TESSERACT_SRC);
      reject(err);
    }, CDN_LOAD_TIMEOUT_MS);
    s.onload  = () => {
      if (done) return; done = true; clearTimeout(timer);
      console.info("[vision] loadTesseract ✓ loaded");
      resolve(window.Tesseract);
    };
    s.onerror = () => {
      if (done) return; done = true; clearTimeout(timer);
      tesseractPromise = null;
      console.error("[vision] loadTesseract ✗ onerror:", TESSERACT_SRC);
      reject(new Error(`Tesseract.js CDN 로드 실패 (${TESSERACT_SRC}) — 네트워크를 확인하세요.`));
    };
    document.head.appendChild(s);
  });
  return tesseractPromise;
}

async function loadPdfjs() {
  if (pdfjsPromise) return pdfjsPromise;
  // Race dynamic import against the CDN timeout — a stuck module load
  // otherwise sits forever without ever entering .then() / .catch().
  pdfjsPromise = Promise.race([
    import(/* webpackIgnore: true */ PDFJS_SRC).then(mod => {
      const pdfjs = mod.default || mod;
      if (pdfjs.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
      console.info("[vision] loadPdfjs ✓ loaded");
      return pdfjs;
    }),
    new Promise((_r, rej) => setTimeout(
      () => rej(new Error(`pdf.js CDN 로드 시간초과 (${CDN_LOAD_TIMEOUT_MS / 1000}초) — ${PDFJS_SRC}`)),
      CDN_LOAD_TIMEOUT_MS
    ))
  ]).catch(err => {
    pdfjsPromise = null;
    console.error("[vision] loadPdfjs ✗", err?.message || err);
    throw new Error(`pdf.js CDN 로드 실패 — ${err?.message || err}`);
  });
  return pdfjsPromise;
}

// ============================================================
// File-type helpers
// ============================================================

function isPdf(file)   { return /pdf/i.test(file?.type || file?.name || ""); }
function isImage(file) { return (file?.type || "").toLowerCase().startsWith("image/"); }

async function pdfToCanvas(file) {
  const pdfjs = await loadPdfjs();
  const buf   = await file.arrayBuffer();
  const doc   = await pdfjs.getDocument({ data: buf }).promise;
  const page  = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 2.0 });
  const canvas = document.createElement("canvas");
  canvas.width  = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  return canvas;
}

// ============================================================
// Text normalization + additional field extractors
// ============================================================

/**
 * OCR clean-up before parsing. Every rule was added from a real-invoice
 * miss captured in `tests/ocr-corpus/` — see `tests/ocr-accuracy.mjs`.
 *
 *   1. Trim per-line whitespace + drop blank lines.
 *   2. Strip decorative marks (★ ✦ ► etc.) that Tesseract keeps around
 *      logo areas — they confuse supplier detection.
 *   3. Join fragmented Hangul syllables — `왕 벚 나 무` → `왕벚나무`.
 *      REQUIRES ≥3 single-char Hangul tokens (`{2,}` iterations of
 *      `[가-힣][ \t]`), so bigrams like `충남 태안군` or `3분 포트` are
 *      left alone. Under-collapse ≫ over-collapse for accuracy.
 *   4. Common Tesseract letter-vs-digit swaps after a spec marker:
 *      `R O` → `R0`, `H l` → `H1`, `B I` → `B1`.
 *   5. Fix spec spacing — `R 8` → `R8`, `H 1.2` → `H1.2`.
 *   6. Strip price commas — `35,000` → `35000`.
 *
 * @param {string} text
 * @returns {string}
 */
export function normalizeOcrText(text) {
  if (!text) return "";
  let t = String(text)
    .split(/\r?\n/)
    .map(l => l.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

  // 2. Strip decorative marks that flank logo/hero areas.
  t = t.replace(/[★☆✦✧✭✮▶►◆◇■□●○※◈]+/g, " ");

  // 3. Join runs of single-Hangul-space patterns (≥3 chars).
  //    `왕 벚 나 무` → `왕벚나무` · `충남 태안군` unchanged
  t = t.replace(/(?:[가-힣][ \t]){2,}[가-힣]/g, m => m.replace(/\s+/g, ""));

  // 4. OCR letter↔digit swaps after a spec marker letter (R/H/B/W/D).
  //    O/o → 0, l/I → 1. Only fire when the character is NOT part of
  //    a longer Latin token (so 'Rome' stays Rome, but 'R O 주' → 'R0 주').
  t = t.replace(/([RHBWDrhbwd])[ \t]*([OolI])(?![A-Za-z가-힣])/g,
    (_, l, x) => l + ({ O: "0", o: "0", l: "1", I: "1" }[x]));

  // 5. Spec spacing: `R 8` → `R8`, `H 1.2` → `H1.2`. Also accept `.` or `:`
  //    OCR sometimes inserts after the letter.
  t = t.replace(/([RHBWDrhbwd])[ \t.:]*(\d)/g, "$1$2");

  // 6. Strip price commas so downstream parser can Number() cleanly.
  t = t.replace(/(\d{1,3}(?:,\d{3})+)/g, m => m.replace(/,/g, ""));

  return t;
}

/** Extract invoice date in YYYY-MM-DD format from normalized text. */
export function extractInvoiceDate(text) {
  if (!text) return "";
  // YYYY-MM-DD · YYYY/MM/DD · YYYY.MM.DD
  const iso = text.match(/(20\d{2})[-./](\d{1,2})[-./](\d{1,2})/);
  if (iso) return `${iso[1]}-${pad2(iso[2])}-${pad2(iso[3])}`;
  // 2026년 07월 18일
  const kr = text.match(/(20\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (kr) return `${kr[1]}-${pad2(kr[2])}-${pad2(kr[3])}`;
  return "";
}

/**
 * Extract invoice number ("거래명세서 번호: TR-2026-…").
 *   1. Prefer an explicitly-labelled invoice/명세서 번호.
 *   2. Otherwise take a "번호" match but SKIP business-registration
 *      numbers (사업자등록번호 123-45-67890) and pure-digit-only tokens.
 */
export function extractInvoiceNumber(text) {
  if (!text) return "";
  // 1. Explicit Korean label — 거래명세서 번호 / 명세서 번호 / 문서 번호.
  //    (English "No." intentionally excluded — it collides with
  //    "Business Registration No. 123-45-67890" boilerplate.)
  const preferred = text.match(
    /(?:거래(?:\s*명세서)?\s*번호|명세서\s*번호|문서\s*번호)\s*[:.\-–]?\s*([A-Za-z0-9][A-Za-z0-9\-]{2,25})/i
  );
  if (preferred && /[A-Za-z]/.test(preferred[1])) return preferred[1].trim();
  // 2. Any "번호" occurrence, but skip 사업자등록번호 / 대표번호 (phones)
  //    and any candidate whose value has no letters (a pure phone/regno
  //    would come through with digits+hyphens only). matchAll iterates
  //    every hit so a bogus first match doesn't short-circuit the good one.
  const genericRe = /(?<!사업자등록\s*)(?<!등록\s*)(?<!대표)번호\s*[:.\-–]?\s*([A-Za-z0-9]+(?:-[A-Za-z0-9]+){1,4})/gi;
  for (const m of text.matchAll(genericRe)) {
    const val = m[1].trim();
    if (/[A-Za-z]/.test(val)) return val;
  }
  return "";
}

function pad2(n) { return String(n).padStart(2, "0"); }

/**
 * Parse pasted plaintext of an invoice (post-OCR or PDF-copy).
 * The primary source of extracted data in the current build.
 *
 * @param {string} text
 * @returns {{supplier:Supplier, rows:InvoiceRow[]}}
 */
export function parseInvoiceText(text) {
  return {
    supplier: detectSupplier(text),
    rows: extractCandidateRows(text)
  };
}

/**
 * Mock invoice analysis for the demo 거래명세서 등록 flow.
 *
 * Unlike `analyzeInvoice()` (which returns `ok:false` to signal that no
 * real Vision API is wired up), this function returns `ok:true` with a
 * populated result so the UI can walk through the full 4-step wizard
 * with realistic data. The returned payload carries a `mock: true`
 * marker so the wizard can label the analysis as demo content.
 *
 * The row set mixes existing seed species (왕벚나무, 산수유) with a
 * fictional one (신품종개나리) so both auto-link and auto-create
 * paths are exercised during walkthrough.
 *
 * @param {File} file
 * @returns {Promise<AnalyzeInvoiceMockResult>}
 */
export async function analyzeInvoiceMock(file) {
  // Simulated latency — the wizard shows a "분석 중..." spinner during it.
  const requestedAt = new Date().toISOString();
  const t0 = Date.now();
  await new Promise(res => setTimeout(res, 600));
  const latencyMs = Date.now() - t0;

  const today = new Date().toISOString().slice(0, 10);
  const monthNumber = today.slice(0, 7).replace("-", "");

  const supplier = {
    name: "천리포수목원",
    region: "충남 태안군 소원면 천리포1길 187",
    contact: "041-672-9982"
  };
  const rows = [
    { name: "왕벚나무",     spec: "R6",   unit: "주", quantity: 2, unitPrice: 45000, amount: 90000 },
    { name: "산수유",       spec: "R4",   unit: "주", quantity: 1, unitPrice: 22000, amount: 22000 },
    { name: "신품종개나리", spec: "H1.0", unit: "주", quantity: 3, unitPrice: 15000, amount: 45000 }
  ];

  return {
    ok: true,
    mock: true,
    reason: "Vision API 미연결 — Mock 데이터를 반환했습니다.",
    invoiceDate: today,
    invoiceNumber: `M-${monthNumber}-001`,
    supplier,
    rows,
    meta: {
      filename: file?.name || "",
      size:     file?.size || 0,
      type:     file?.type || "",
      model:    "mock"
    },
    // Provider-neutral debug envelope (see JSDoc typedef below).
    _debug: {
      provider:    "mock",
      model:       "mock",
      requestedAt,
      latencyMs,
      confidence:  null,
      errorMessage: null,
      httpStatus:  200,
      raw: {
        note: "This is a deterministic Mock. No provider call was made.",
        invoiceDate: today,
        invoiceNumber: `M-${monthNumber}-001`,
        supplier,
        rows
      }
    }
  };
}

/**
 * @typedef {Object} AnalyzeInvoiceMockResult
 * @property {boolean} ok
 * @property {boolean} mock                  — true = "이 데이터는 Mock" 표시용
 * @property {string}  reason
 * @property {string}  invoiceDate            YYYY-MM-DD
 * @property {string}  invoiceNumber
 * @property {Supplier} supplier
 * @property {Array<{name:string, spec:string, unit:string, quantity:number, unitPrice:number, amount:number}>} rows
 * @property {Object}  meta
 * @property {DebugEnvelope} [_debug]        — 개발자 검증 화면용 (Debug Panel)
 */

/**
 * Provider-neutral debug envelope. Every real analyzer (OpenAI / Claude /
 * Gemini …) MUST attach one of these so `debugPanel.js` renders the same
 * information regardless of provider. Any of the fields may be null when
 * a provider doesn't return that particular signal.
 *
 * @typedef {Object} DebugEnvelope
 * @property {string}      provider        "openai" | "anthropic" | "gemini" | "mock"
 * @property {string}      model           e.g. "gpt-4o", "claude-sonnet-5"
 * @property {string}      requestedAt     ISO-8601 request start
 * @property {number}      latencyMs       provider round-trip in ms
 * @property {number|null} confidence      0..1 overall confidence, if provided
 * @property {string|null} errorMessage    non-null on OCR failure paths
 * @property {number|null} httpStatus      proxy HTTP response code (null on network error)
 * @property {any}         raw             untouched provider response body
 */

// ============================================================
// Internal helpers
// ============================================================

function normalizePhone(p) { return p.replace(/[.\s]/g, "-"); }
function digitsOnly(p) { return p.replace(/[^\d]/g, ""); }
function normalizePrice(str) { const d = str.replace(/[^\d]/g, ""); return d ? Number(d) : null; }

/** Try to trim trailing "성명 …", "대표자 …" etc. so a captured 상호 doesn't leak into next field. */
function trimAfterKnownFields(s) {
  return s
    .split(/(?:성\s*명|대표자|사업자|주\s*소|소\s*재\s*지|사\s*업\s*장|전\s*화|TEL|FAX|팩스|핸\s*드\s*폰|휴\s*대(?:\s*폰|\s*전\s*화)|M\.\s*0)/i)[0]
    .trim();
}

/**
 * When a candidate 상호 line is pipe-delimited (`Sly o| 대림원예 |성명|문명석…`),
 * keep only the cell that carries a business suffix. OCR renders the table's
 * label/value cells as `|`-separated (or fullwidth `ㅣ`／`｜`) segments, so the
 * leading label-cell garbage and the trailing 성명/금액 cells otherwise leak
 * into the trade name. Returns the input unchanged when there is no pipe
 * separator or no suffix-bearing cell to prefer.
 */
function pickBizSuffixCell(s) {
  if (!/[|ㅣ｜]/.test(s)) return s;
  const cells = s.split(/[|ㅣ｜]/).map(c => c.trim()).filter(Boolean);
  const hit = cells.find(c => BIZ_SUFFIX_KEYWORDS.some(k => c.includes(k)));
  return hit || s;
}

/** Strip leading 법인/공백 markers (㈜, 주식회사, 유한회사) captured together with the trade name. */
function stripCorporateMarker(name) {
  return String(name || "")
    .replace(/^(?:㈜|㈐|㈔|주\s*식\s*회\s*사|유\s*한\s*회\s*사)\s*/i, "")
    .replace(/\s*(?:㈜|주\s*식\s*회\s*사|유\s*한\s*회\s*사)\s*$/i, "")
    .trim();
}

function detectSupplier(text) {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const head = lines.slice(0, 20);
  const headText = head.join("\n");

  // 상호 — labelled first, then any line ending in a business suffix,
  // finally first-line fallback for brand names that carry no suffix
  // (e.g. `허브아일랜드`). Every stage passes through `stripCorporateMarker`
  // so a captured `㈜ 담양원예` or `주식회사 XX` collapses to the trade name.
  let name = "";
  const bizKey = headText.match(BIZ_KEYWORD_RE);
  if (bizKey) {
    name = stripCorporateMarker(
      trimAfterKnownFields(bizKey[1].replace(/\s+/g, " ").trim())
    );
  }
  if (!name) {
    for (const l of head) {
      if (BIZ_SUFFIX_KEYWORDS.some(k => l.includes(k))) {
        if (PHONE_TEST_RE.test(l)) continue;
        // Fragmented OCR (`공 급 자 남 양 수 목 원`) normalizes to
        // `공급자남양수목원` — the label is glued to the value. Strip the
        // known label prefix before the header-line reject; otherwise the
        // whole line looks like a plain "공급자" header and gets skipped.
        const stripped = l.replace(
          /^(?:상\s*호|업체명|공급자|공급업체|사업자명)[ \t:.\-–]*/i, ""
        );
        if (HEADER_LINE_RE.test(stripped)) continue;
        const candidate = stripCorporateMarker(
          trimAfterKnownFields(
            pickBizSuffixCell(stripped).replace(/[·]+/g, " ").replace(/\s+/g, " ").trim()
          )
        );
        if (candidate.length >= 2 && candidate.length <= 30) {
          name = candidate;
          break;
        }
      }
    }
  }
  if (!name) {
    // First-line fallback — brand names without a business suffix
    // (e.g. `허브아일랜드 대량 납품 견적서`). Restricted to line 0 only:
    // wandering into later lines was picking up section labels like
    // `작성년월일` / `영수` / `귀하` on handwritten templates whose top
    // label (e.g. `거래명세표`) got NOISE-skipped.
    const l0 = head[0];
    if (l0
        && !HEADER_LINE_RE.test(l0)
        && !PHONE_TEST_RE.test(l0)
        && !DATE_LINE_RE.test(l0)
        && !ADDRESS_LINE_RE.test(l0)
        && !REGION_HINT_RE.test(l0)) {
      const tokens = l0.split(/\s+/);
      const cand = tokens.find(t =>
        /^[가-힣]{2,20}$/.test(t) &&
        !NOISE_NAMES.has(t) &&
        !COLUMN_HEADER_WORDS.has(t)
      );
      if (cand) name = cand;
    }
  }

  // 핸드폰 번호 — labelled first, 010-prefixed preferred, landline as last resort.
  let contact = "";
  const mobileKey = text.match(MOBILE_KEYWORD_RE);
  if (mobileKey) {
    contact = normalizePhone(mobileKey[1]);
  } else {
    const phones = [...text.matchAll(PHONE_RE_G)].map(m => m[0]);
    const mobile = phones.find(p => MOBILE_PREFIX_RE.test(digitsOnly(p)));
    contact = normalizePhone(mobile || phones[0] || "");
  }

  // 사업장 소재지 — labelled, then a full 시/도+시/군/구+동/리/로/길 chain, then a short hint.
  let region = "";
  const addrKey = headText.match(ADDRESS_KEYWORD_RE);
  if (addrKey) region = addrKey[1].replace(/\s+/g, " ").trim();
  if (!region) {
    const full = text.match(ADDRESS_LINE_RE);
    if (full && full[0]) region = full[0].replace(/\s+/g, " ").trim();
  }
  if (!region) {
    const short = text.match(REGION_HINT_RE);
    if (short) region = short[0].trim();
  }
  region = region
    .replace(PHONE_RE_G, "")
    .split(/(?:상\s*호|성\s*명|대표자|사업자|전\s*화|TEL|FAX|팩스|핸\s*드\s*폰|휴\s*대(?:\s*폰|\s*전\s*화)|M\.\s*)/i)[0]
    .replace(/[·]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { name, region, contact };
}

/** Numbers with a 원 or `.-` suffix are always prices; bare ones need ≥100. */
function extractLinePrices(line) {
  const out = [];
  for (const m of line.matchAll(PRICE_RE)) {
    const val = normalizePrice(m[0]);
    if (val == null) continue;
    const hasContext = /원|\.\s*[-–]/.test(m[0]);
    if (hasContext || val >= 100) out.push(val);
  }
  return out;
}

function extractCandidateRows(text) {
  const rows = [];
  const lines = text.split(/\r?\n/).map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean);

  for (const line of lines) {
    if (HEADER_LINE_RE.test(line)) continue;
    if (PHONE_TEST_RE.test(line)) continue;
    if (META_LINE_RE.test(line)) continue;
    if (DATE_LINE_RE.test(line)) continue;
    if (!/[가-힣]{2,}/.test(line)) continue;

    // Standalone Korean token that isn't a column header nor noise word.
    const tokens = line.split(/\s+/);
    const nameTok = tokens.find(t =>
      /^[가-힣]{2,15}$/.test(t) &&
      !COLUMN_HEADER_WORDS.has(t) &&
      !NOISE_NAMES.has(t)
    );
    if (!nameTok) continue;

    const specs = [...line.matchAll(SPEC_RE)].map(m => m[0].trim().replace(/\s+/g, ""));
    const prices = extractLinePrices(line);
    if (!specs.length && !prices.length) continue;

    const spec = specs[0] || "";
    let unit = "";
    const um = line.match(UNIT_HINT_RE);
    if (um) unit = um[1];
    if (!unit && /\d+\s?포트/.test(spec)) unit = "포트";
    if (!unit && /R\s?\d/.test(spec)) unit = "주";
    if (!unit && /H\s?\d/.test(spec)) unit = "주";

    // [수량, 단가, 금액] → middle; [단가, 금액] → min; [단가] → self.
    const sorted = [...prices].sort((a, b) => a - b);
    let price = null;
    if (sorted.length >= 3) price = sorted[Math.floor(sorted.length / 2)];
    else if (sorted.length) price = sorted[0];
    if (price == null) continue;

    rows.push({ name: nameTok, spec, unit, price });
  }

  // De-dupe on (name|spec|price).
  const seen = new Set();
  return rows.filter(r => {
    const k = `${r.name}|${r.spec}|${r.price}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
