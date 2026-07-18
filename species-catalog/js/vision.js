/**
 * OCR / invoice-analysis module.
 *
 * Three entry points:
 *   analyzeInvoice(file)      — Real OpenAI Vision, via same-origin proxy.
 *   analyzeInvoiceMock(file)  — Deterministic sample used by tests + demo.
 *   parseInvoiceText(text)    — Regex parser for pasted 명세서 text.
 *
 * `analyzeInvoice()` never touches the OpenAI API key directly — it POSTs
 * the file (as base64 JSON) to `/api/analyze-invoice`, which is served by
 * `species-catalog/server/proxy.mjs`. The proxy reads OPENAI_API_KEY from
 * `.env` and forwards to the Responses API. The browser only sees the
 * proxy's response, which is shaped to match `analyzeInvoiceMock()`.
 */

// ============================================================
// Regex constants — 거래명세서 layouts vary a lot, hence the length.
// ============================================================

// 조경 규격 관용 표기: R6, H1.5, B10, W2, 3분, 5포트, 2주 …
const SPEC_RE =
  /(?:R\s?\d+(?:\.\d+)?|H\s?\d+(?:\.\d+)?|B\s?\d+(?:\.\d+)?|W\s?\d+(?:\.\d+)?|\d+\s?(?:분|포트|주|본|치|㎝|cm|㎜|mm|m))/gi;

// 가격: 45,000 · 12000 · 45,000원 · 50원 · 100.- · 500.- (거래명세서 관례)
const PRICE_RE =
  /\d{1,3}(?:,\d{3})+(?:\s?원)?|\d{4,}(?:\s?원)?|\d{1,4}\s*원|\d{1,4}\s*\.\s*[-–]/g;

const PHONE_RE_G = /0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/g;
const PHONE_TEST_RE = /0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/;
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
  "농원", "수목원", "원예", "농장", "조합", "산업",
  "㈜", "주식회사", "회사", "상사", "화훼", "너서리", "널서리", "팜"
];
const BIZ_KEYWORD_RE =
  /(?:상\s*호|업체명|공급자|공급업체|사업자명)\s*[:.\-–]?\s*([가-힣A-Za-z0-9()\s㈜]{2,40})/;
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
  "발행", "청구", "송장", "인수자", "잔금", "전잔금", "입금", "본사"
]);
const DATE_LINE_RE = /(?:\d{2,4}\s*년|\d{1,2}\s*월|\d{1,2}\s*일)/;
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
 * Analyze an invoice image or PDF via the same-origin `/api/analyze-invoice`
 * proxy (see `species-catalog/server/proxy.mjs`).
 *
 * The proxy forwards the file to the OpenAI Responses API and returns a
 * JSON payload with the same shape as {@link analyzeInvoiceMock}, so the
 * wizard code path is identical for real and mock responses.
 *
 * Throws with a human-readable Korean message on:
 *   • network / connection failure  (proxy not running)
 *   • timeout                      (default 60s)
 *   • non-2xx proxy response       (message copied from proxy body)
 *   • proxy body with `ok:false`   (OpenAI or config error surfaced)
 *
 * The API key is **never** in browser code — it lives only in `.env`
 * consumed by the proxy.
 *
 * @param {File} file
 * @param {{timeoutMs?:number, endpoint?:string}} [opts]
 * @returns {Promise<AnalyzeInvoiceMockResult>}
 */
export async function analyzeInvoice(file, opts = {}) {
  if (!file) throw new Error("파일이 선택되지 않았습니다.");
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 60000;
  const endpoint  = opts.endpoint || "/api/analyze-invoice";

  const dataBase64 = await fileToBase64(file);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filename: file.name || "",
        mimeType: file.type || "",
        dataBase64
      }),
      signal: controller.signal
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`분석 요청 시간이 초과되었습니다 (${Math.round(timeoutMs / 1000)}초).`);
    }
    // TypeError from fetch usually means the proxy is not reachable.
    throw new Error(
      `Vision 프록시(${endpoint})에 연결할 수 없습니다. ` +
      "'node species-catalog/server/proxy.mjs' 로 프록시를 실행 중인지 확인하세요."
    );
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try { data = await res.json(); } catch { /* body was not JSON */ }

  if (!res.ok) {
    const msg = data?.message || data?.error || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  if (!data || data.ok === false) {
    throw new Error(data?.message || data?.error || "알 수 없는 오류입니다.");
  }
  return data;
}

/** File → base64 (strip the "data:...;base64," prefix). */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("파일을 읽을 수 없습니다."));
    fr.onload = () => {
      const s = String(fr.result || "");
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    fr.readAsDataURL(file);
  });
}

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

function detectSupplier(text) {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const head = lines.slice(0, 20);
  const headText = head.join("\n");

  // 상호 — labelled first, then any line ending in a business suffix.
  let name = "";
  const bizKey = headText.match(BIZ_KEYWORD_RE);
  if (bizKey) {
    name = trimAfterKnownFields(bizKey[1].replace(/\s+/g, " ").trim());
  }
  if (!name) {
    for (const l of head) {
      if (BIZ_SUFFIX_KEYWORDS.some(k => l.includes(k))) {
        if (PHONE_TEST_RE.test(l)) continue;
        if (HEADER_LINE_RE.test(l)) continue;
        const candidate = trimAfterKnownFields(
          l.replace(/[·]+/g, " ").replace(/\s+/g, " ").trim()
        );
        if (candidate.length >= 2 && candidate.length <= 30) {
          name = candidate;
          break;
        }
      }
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
