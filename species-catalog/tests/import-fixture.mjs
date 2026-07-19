#!/usr/bin/env node
/**
 * Convert a Debug Panel download into a corpus fixture.
 *
 *   node species-catalog/tests/import-fixture.mjs <download.json> [--slug=name] [--force]
 *
 * The Debug Panel exposes two download buttons — this script accepts both:
 *   1. `↓ OCR 결과 다운로드`  → full snapshot  { ocr, userEdit, toSave, meta }
 *      • raw text lives in `meta.raw.text`
 *      • expected values come from `userEdit.header` + `userEdit.items`
 *   2. `💾 Vision 응답 저장`  → the `_debug.raw` blob itself
 *      • raw text lives in `text`
 *      • expected values must be supplied on the CLI (or blank fixture)
 *
 * The new fixture is written to `species-catalog/tests/ocr-corpus/NN-<slug>.json`
 * with the next auto-incrementing NN prefix. Run the corpus regression right
 * after (`node species-catalog/tests/ocr-accuracy.mjs`) to verify parity;
 * the fixture will fail unless the parser can reproduce the userEdit values,
 * which is exactly the signal you want when iterating on OCR rules.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const CORPUS_DIR = path.join(__dirname, "ocr-corpus");

// ------------------------------------------------------------
// CLI
// ------------------------------------------------------------
const args = process.argv.slice(2);
const positional = args.filter(a => !a.startsWith("--"));
const flags = Object.fromEntries(
  args.filter(a => a.startsWith("--")).map(a => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);

if (!positional.length) {
  console.error(
    "Usage:\n" +
    "  node species-catalog/tests/import-fixture.mjs <download.json> [--slug=name] [--desc=text] [--force]\n\n" +
    "  <download.json> — Debug Panel 다운로드 파일 (OCR 결과 or Vision 응답)\n" +
    "  --slug=<name>   — fixture id suffix (default: user-invoice)\n" +
    "  --desc=<text>   — description field (default: 실제 명세서 · YYYY-MM-DD)\n" +
    "  --force         — overwrite existing NN-slug.json if it exists"
  );
  process.exit(1);
}
const inputPath = positional[0];
if (!fs.existsSync(inputPath)) {
  console.error(`✗ 입력 파일을 찾을 수 없습니다: ${inputPath}`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(inputPath, "utf8"));

// ------------------------------------------------------------
// Auto-detect snapshot shape
// ------------------------------------------------------------
let ocrText   = null;
let header    = null;
let items     = null;

// Full Debug snapshot? { ocr, userEdit, meta }
if (raw?.meta?.raw?.text || raw?.userEdit) {
  ocrText = raw?.meta?.raw?.text ?? raw?.ocr?._debug?.raw?.text ?? null;
  header  = raw?.userEdit?.header || null;
  items   = Array.isArray(raw?.userEdit?.items) ? raw.userEdit.items : null;
}

// Vision raw only? { text, normalized, ... }
if (!ocrText && typeof raw?.text === "string") {
  ocrText = raw.text;
}

if (!ocrText) {
  console.error("✗ 원본 OCR 텍스트를 찾지 못했습니다.");
  console.error("  Debug Panel 의 '↓ OCR 결과 다운로드' 또는 '💾 Vision 응답 저장' 파일을 주세요.");
  process.exit(1);
}

// ------------------------------------------------------------
// Build expect payload
// ------------------------------------------------------------
const expect = {};
if (header?.invoiceDate)   expect.invoiceDate   = header.invoiceDate;
if (header?.invoiceNumber) expect.invoiceNumber = header.invoiceNumber;
if (header?.supplier || header?.supplierAddress || header?.supplierPhone) {
  expect.supplier = {};
  if (header.supplier)        expect.supplier.name    = header.supplier;
  if (header.supplierAddress) expect.supplier.region  = header.supplierAddress;
  if (header.supplierPhone)   expect.supplier.contact = header.supplierPhone;
}
if (items?.length) {
  expect.rows = items
    .filter(it => (it.name || "").trim() && Number(it.unitPrice) > 0)
    .map(it => {
      const r = { name: String(it.name).trim() };
      if (it.spec)     r.spec      = String(it.spec).trim();
      if (it.unitPrice != null) r.unitPrice = Number(it.unitPrice);
      return r;
    });
}

// ------------------------------------------------------------
// Pick next NN + write
// ------------------------------------------------------------
if (!fs.existsSync(CORPUS_DIR)) fs.mkdirSync(CORPUS_DIR, { recursive: true });
const existing = fs.readdirSync(CORPUS_DIR).filter(f => f.endsWith(".json"));
const nums = existing.map(f => {
  const m = f.match(/^(\d+)/);
  return m ? Number(m[1]) : 0;
});
const nextN = String(Math.max(0, ...nums) + 1).padStart(2, "0");

const slug = String(flags.slug || "user-invoice")
  .replace(/[^a-z0-9-]/gi, "-").toLowerCase()
  .replace(/-+/g, "-").replace(/^-|-$/g, "") || "user-invoice";
const desc = String(flags.desc || `실제 명세서 · ${new Date().toISOString().slice(0, 10)}`);
const id   = `${nextN}-${slug}`;
const out  = path.join(CORPUS_DIR, `${id}.json`);

if (fs.existsSync(out) && !flags.force) {
  console.error(`✗ 이미 존재합니다: ${out} — 덮어쓰려면 --force`);
  process.exit(1);
}

const fixture = {
  id,
  description: desc,
  ocr:  ocrText,
  expect
};
fs.writeFileSync(out, JSON.stringify(fixture, null, 2) + "\n", "utf8");

// ------------------------------------------------------------
// Summarize
// ------------------------------------------------------------
console.log(`✓ fixture 작성됨 · ${path.relative(process.cwd(), out)}`);
console.log(`  id           : ${id}`);
console.log(`  ocr chars    : ${ocrText.length}`);
console.log(`  expect fields:`);
const flat = [
  ["invoiceDate",     expect.invoiceDate],
  ["invoiceNumber",   expect.invoiceNumber],
  ["supplier.name",   expect.supplier?.name],
  ["supplier.region", expect.supplier?.region],
  ["supplier.contact",expect.supplier?.contact]
];
for (const [k, v] of flat) if (v != null) console.log(`    ${k.padEnd(18)} = ${JSON.stringify(v)}`);
if (expect.rows?.length) console.log(`    rows              = ${expect.rows.length}건`);
console.log(`\n다음 단계 → node species-catalog/tests/ocr-accuracy.mjs`);
