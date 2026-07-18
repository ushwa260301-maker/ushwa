#!/usr/bin/env node
/**
 * Vision proxy — keeps OPENAI_API_KEY off the browser.
 *
 * A small Node HTTP server (built-ins only, no npm install) that:
 *
 *   1. Serves the static species-catalog/ directory (index.html + css/ + js/ + data/).
 *   2. Exposes POST /api/analyze-invoice
 *        Body : { filename, mimeType, dataBase64 }
 *        Calls: OpenAI Responses API with the image / PDF.
 *        Returns Mock-compatible JSON so `js/invoiceModal.js` doesn't
 *        change: { ok, invoiceDate, invoiceNumber, supplier, rows, meta }.
 *
 * Environment (loaded from .env at repo root OR at species-catalog/.env):
 *
 *   OPENAI_API_KEY          — required
 *   OPENAI_VISION_MODEL     — default gpt-4o
 *   PROXY_PORT              — default 8787
 *   OPENAI_TIMEOUT_MS       — default 55000
 *
 * Run:
 *
 *   node species-catalog/server/proxy.mjs
 *
 * then open http://localhost:8787
 */

import http from "node:http";
import fs   from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const STATIC_ROOT = path.resolve(__dirname, "..");   // …/species-catalog

// ============================================================
// .env loader (no dependencies)
// ============================================================

function loadDotenv(envPath) {
  if (!fs.existsSync(envPath)) return false;
  const text = fs.readFileSync(envPath, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
  return true;
}

// Load from species-catalog/.env first (feature-scoped), then repo-root .env.
loadDotenv(path.resolve(STATIC_ROOT, ".env"));
loadDotenv(path.resolve(STATIC_ROOT, "..", ".env"));
loadDotenv(path.resolve(process.cwd(), ".env"));

const PORT              = Number(process.env.PROXY_PORT || 8787);
const OPENAI_API_KEY    = process.env.OPENAI_API_KEY || "";
const MODEL             = process.env.OPENAI_VISION_MODEL || "gpt-4o";
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 55000);

// ============================================================
// Prompt + JSON schema for structured output
// ============================================================

const SYSTEM_PROMPT = `당신은 한국의 종묘·수목 거래명세서를 정확히 판독하는 전문가입니다.
첨부된 이미지 또는 PDF에서 아래 필드를 추출해 JSON 스키마 그대로 반환하세요.

규칙:
- 수종명(name)은 반드시 명세서의 "품목" 열에서만 추출합니다. 파일명이나 상호에서 유추 금지.
- unitPrice 는 "단가" 열 값입니다. "공급가액" 은 amount 로 넣습니다.
- quantity·unitPrice·amount 는 반드시 숫자(정수 원 단위). 쉼표·"원" 제거.
- 값을 못 찾으면 문자열은 "", 숫자는 0 을 사용합니다.
- JSON 이외의 텍스트, 마크다운 코드 블록은 절대 포함하지 않습니다.`;

const INVOICE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    invoiceDate:   { type: "string", description: "YYYY-MM-DD (모르면 빈 문자열)" },
    invoiceNumber: { type: "string", description: "명세서 번호 (없으면 빈 문자열)" },
    supplier: {
      type: "object",
      additionalProperties: false,
      properties: {
        name:    { type: "string" },
        region:  { type: "string" },
        contact: { type: "string" }
      },
      required: ["name", "region", "contact"]
    },
    rows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name:      { type: "string" },
          spec:      { type: "string" },
          unit:      { type: "string" },
          quantity:  { type: "number" },
          unitPrice: { type: "number" },
          amount:    { type: "number" }
        },
        required: ["name", "spec", "unit", "quantity", "unitPrice", "amount"]
      }
    }
  },
  required: ["invoiceDate", "invoiceNumber", "supplier", "rows"]
};

// ============================================================
// HTTP helpers
// ============================================================

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type":  "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "access-control-allow-origin":  "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end(payload);
}

function readBody(req, limitBytes = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", chunk => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error("REQUEST_TOO_LARGE"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// ============================================================
// Static file serving
// ============================================================

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".mjs":  "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".ico":  "image/x-icon",
  ".webp": "image/webp",
  ".txt":  "text/plain; charset=utf-8",
  ".md":   "text/markdown; charset=utf-8"
};

function serveStatic(req, res) {
  try {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);
    let rel = urlPath.replace(/^\/+/, "");
    if (rel === "" || rel.endsWith("/")) rel += "index.html";

    // Reject path traversal — resolved path must stay under STATIC_ROOT.
    const resolved = path.resolve(STATIC_ROOT, rel);
    if (!resolved.startsWith(STATIC_ROOT + path.sep) && resolved !== STATIC_ROOT) {
      json(res, 403, { ok: false, error: "forbidden" });
      return;
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      json(res, 404, { ok: false, error: "not_found", path: urlPath });
      return;
    }
    const ext = path.extname(resolved).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";
    res.writeHead(200, {
      "content-type":  type,
      "content-length": fs.statSync(resolved).size,
      "cache-control": "no-cache"
    });
    fs.createReadStream(resolved).pipe(res);
  } catch (err) {
    json(res, 500, { ok: false, error: "static_error", message: err.message });
  }
}

// ============================================================
// OpenAI call
// ============================================================

async function callOpenAI({ dataBase64, mimeType }) {
  const requestedAt = new Date().toISOString();
  const t0 = Date.now();
  const isPdf = (mimeType || "").toLowerCase() === "application/pdf";
  const dataUrl = `data:${mimeType || (isPdf ? "application/pdf" : "image/png")};base64,${dataBase64}`;

  const userContent = [
    { type: "input_text", text: "이 거래명세서에서 필드를 정확히 추출해 지정된 JSON 스키마로 반환하세요." }
  ];
  if (isPdf) {
    userContent.push({ type: "input_file", filename: "invoice.pdf", file_data: dataUrl });
  } else {
    userContent.push({ type: "input_image", image_url: dataUrl, detail: "high" });
  }

  const requestBody = {
    model: MODEL,
    input: [
      { role: "system", content: [{ type: "input_text", text: SYSTEM_PROMPT }] },
      { role: "user",   content: userContent }
    ],
    text: {
      format: {
        type:   "json_schema",
        name:   "invoice_extraction",
        strict: true,
        schema: INVOICE_JSON_SCHEMA
      }
    }
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  let response, textOut;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${OPENAI_API_KEY}`,
        "content-type":  "application/json"
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    textOut = await response.text();
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error(`OpenAI 요청 시간이 초과되었습니다 (${OPENAI_TIMEOUT_MS}ms).`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  const latencyMs = Date.now() - t0;
  if (!response.ok) {
    const err = new Error(`OpenAI ${response.status}: ${textOut.slice(0, 600)}`);
    err._debug = { provider: "openai", model: MODEL, requestedAt, latencyMs,
                   confidence: null, errorMessage: err.message, raw: safeJson(textOut) };
    throw err;
  }
  const data = JSON.parse(textOut);
  const parsed = extractStructured(data);
  return {
    parsed,
    debug: {
      provider:     "openai",
      model:        MODEL,
      requestedAt,
      latencyMs,
      confidence:   null,           // Responses API 는 아직 confidence 를 반환하지 않음
      errorMessage: null,
      raw:          data
    }
  };
}

/** Best-effort JSON parse — falls back to a `{text}` wrapper. */
function safeJson(text) {
  try { return JSON.parse(text); } catch { return { text }; }
}

/**
 * Pull the JSON body out of a Responses-API result, tolerating either the
 * flat `output_text` convenience field or the nested `output[].content[]`
 * layout.
 */
function extractStructured(res) {
  if (typeof res?.output_text === "string" && res.output_text.trim()) {
    return JSON.parse(res.output_text);
  }
  const parts = Array.isArray(res?.output) ? res.output : [];
  for (const part of parts) {
    for (const c of part?.content || []) {
      if ((c?.type === "output_text" || c?.type === "output_json") && typeof c.text === "string") {
        return JSON.parse(c.text);
      }
      if (c?.type === "output_json" && c.json) {
        return c.json;
      }
    }
  }
  throw new Error("OpenAI 응답에서 JSON을 추출할 수 없습니다.");
}

// ============================================================
// Router
// ============================================================

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin":  "*",
      "access-control-allow-methods": "POST, GET, OPTIONS",
      "access-control-allow-headers": "content-type"
    });
    res.end();
    return;
  }

  const url = req.url || "/";

  if (req.method === "GET" && (url === "/__health" || url === "/api/health")) {
    json(res, 200, {
      ok: true,
      service: "species-catalog · vision-proxy",
      model:   MODEL,
      apiKey:  OPENAI_API_KEY ? "configured" : "missing"
    });
    return;
  }

  if (req.method === "POST" && url.startsWith("/api/analyze-invoice")) {
    await handleAnalyzeInvoice(req, res);
    return;
  }

  if (req.method === "GET") {
    serveStatic(req, res);
    return;
  }

  json(res, 404, { ok: false, error: "not_found" });
});

async function handleAnalyzeInvoice(req, res) {
  if (!OPENAI_API_KEY) {
    json(res, 500, {
      ok: false,
      error:   "OPENAI_API_KEY_MISSING",
      message: "환경변수 OPENAI_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요."
    });
    return;
  }

  let body;
  try {
    const buf = await readBody(req);
    body = JSON.parse(buf.toString("utf8"));
  } catch (err) {
    const code = err?.message === "REQUEST_TOO_LARGE" ? 413 : 400;
    json(res, code, { ok: false, error: err?.message || "invalid_body" });
    return;
  }

  const { filename, mimeType, dataBase64 } = body || {};
  if (!dataBase64 || typeof dataBase64 !== "string") {
    json(res, 400, { ok: false, error: "missing_dataBase64" });
    return;
  }

  try {
    const { parsed, debug } = await callOpenAI({ dataBase64, mimeType });
    const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
    json(res, 200, {
      ok:            true,
      mock:          false,
      invoiceDate:   String(parsed.invoiceDate   || ""),
      invoiceNumber: String(parsed.invoiceNumber || ""),
      supplier: {
        name:    String(parsed.supplier?.name    || ""),
        region:  String(parsed.supplier?.region  || ""),
        contact: String(parsed.supplier?.contact || "")
      },
      rows: rows.map(r => {
        const quantity  = Number(r.quantity)  || 0;
        const unitPrice = Number(r.unitPrice) || 0;
        const declared  = Number(r.amount);
        const amount    = Number.isFinite(declared) && declared > 0 ? declared : quantity * unitPrice;
        return {
          name:      String(r.name || ""),
          spec:      String(r.spec || ""),
          unit:      String(r.unit || ""),
          quantity,
          unitPrice,
          amount
        };
      }),
      meta: {
        filename: String(filename || ""),
        mimeType: String(mimeType || ""),
        model:    MODEL
      },
      // Provider-neutral envelope consumed by the debug panel. See
      // `js/vision.js` DebugEnvelope typedef.
      _debug: debug
    });
  } catch (err) {
    json(res, 502, {
      ok:      false,
      error:   "openai_error",
      message: err?.message || String(err),
      _debug:  err?._debug || null
    });
  }
}

server.listen(PORT, () => {
  const state = OPENAI_API_KEY ? "ready" : "MISSING OPENAI_API_KEY (see .env)";
  console.log(`[vision-proxy] http://localhost:${PORT}  ·  model=${MODEL}  ·  ${state}`);
  console.log(`[vision-proxy] serving  ${STATIC_ROOT}`);
});
