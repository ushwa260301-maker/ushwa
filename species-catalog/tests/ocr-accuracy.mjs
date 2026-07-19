#!/usr/bin/env node
/**
 * OCR 정확도 코퍼스 러너.
 *
 *   node species-catalog/tests/ocr-accuracy.mjs
 *
 * 이 폴더의 `ocr-corpus/*.json` fixture 를 순회하며:
 *   1. normalizeOcrText(input.ocr)  — vision.js pure export
 *   2. parseInvoiceText(normalized) — vision.js pure export
 *   3. extractInvoiceDate / extractInvoiceNumber — vision.js
 *   4. matchSpecies(name, seedSpecies) — matcher.js (optional)
 *
 * 위 결과를 fixture 의 `expect` 와 비교해 필드별 pass/fail 을 집계하고
 * 최종 accuracy % 를 리포트합니다. Fail 시 각 필드의 diff 도 함께 출력.
 *
 * 목표: 전체 fixture 평균 인식률 ≥ 95%.
 *
 * 필드별 채점:
 *   supplier.name    == exact
 *   supplier.region  substring 매치 (expect 가 짧게 정의된 경우 흡수)
 *   supplier.contact 숫자만 비교 (하이픈/공백 차이 무시)
 *   invoiceDate      YYYY-MM-DD exact
 *   invoiceNumber    exact
 *   rows[i].name     exact
 *   rows[i].spec     exact
 *   rows[i].unitPrice exact
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const CORPUS_DIR = path.join(__dirname, "ocr-corpus");
const VISION_URL = pathToFileURL(path.join(__dirname, "..", "js", "vision.js")).href;

const {
  normalizeOcrText,
  parseInvoiceText,
  extractInvoiceDate,
  extractInvoiceNumber
} = await import(VISION_URL);

// ============================================================
// Load fixtures
// ============================================================

function loadFixtures() {
  const files = fs.readdirSync(CORPUS_DIR)
    .filter(f => f.endsWith(".json"))
    .sort();
  return files.map(f => {
    const p = path.join(CORPUS_DIR, f);
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    j._file = f;
    return j;
  });
}

// ============================================================
// Field-level comparators
// ============================================================

const cmp = {
  exact: (got, want) => String(got ?? "").trim() === String(want ?? "").trim(),
  substring: (got, want) => {
    const g = String(got ?? "").replace(/\s+/g, " ").trim();
    const w = String(want ?? "").replace(/\s+/g, " ").trim();
    return !!w && g.includes(w);
  },
  digitsEqual: (got, want) => {
    const dg = String(got ?? "").replace(/\D/g, "");
    const dw = String(want ?? "").replace(/\D/g, "");
    return !!dw && dg === dw;
  },
  numberEqual: (got, want) => Number(got) === Number(want)
};

// ============================================================
// Runner
// ============================================================

function evaluate(fixture) {
  const norm    = normalizeOcrText(fixture.ocr);
  const parsed  = parseInvoiceText(norm);
  const dateISO = extractInvoiceDate(norm);
  const invNum  = extractInvoiceNumber(norm);

  const expected = fixture.expect || {};
  const checks = [];

  // Supplier ---------------------------------------------------
  if (expected.supplier?.name !== undefined) {
    checks.push({
      field: "supplier.name",
      pass:  cmp.exact(parsed.supplier?.name, expected.supplier.name),
      got:   parsed.supplier?.name,
      want:  expected.supplier.name
    });
  }
  if (expected.supplier?.region !== undefined) {
    checks.push({
      field: "supplier.region",
      pass:  cmp.substring(parsed.supplier?.region, expected.supplier.region),
      got:   parsed.supplier?.region,
      want:  expected.supplier.region + " (substring)"
    });
  }
  if (expected.supplier?.contact !== undefined) {
    checks.push({
      field: "supplier.contact",
      pass:  cmp.digitsEqual(parsed.supplier?.contact, expected.supplier.contact),
      got:   parsed.supplier?.contact,
      want:  expected.supplier.contact
    });
  }

  // Date / number ---------------------------------------------
  if (expected.invoiceDate !== undefined) {
    checks.push({
      field: "invoiceDate",
      pass:  cmp.exact(dateISO, expected.invoiceDate),
      got:   dateISO,
      want:  expected.invoiceDate
    });
  }
  if (expected.invoiceNumber !== undefined) {
    checks.push({
      field: "invoiceNumber",
      pass:  cmp.exact(invNum, expected.invoiceNumber),
      got:   invNum,
      want:  expected.invoiceNumber
    });
  }

  // Rows (name/spec/unitPrice) --------------------------------
  const expectedRows = expected.rows || [];
  for (let i = 0; i < expectedRows.length; i++) {
    const w = expectedRows[i];
    const g = parsed.rows?.[i] || {};
    const gUnitPrice = g.unitPrice ?? g.price;
    if (w.name !== undefined) {
      checks.push({
        field: `rows[${i}].name`,
        pass:  cmp.exact(g.name, w.name),
        got:   g.name,
        want:  w.name
      });
    }
    if (w.spec !== undefined) {
      checks.push({
        field: `rows[${i}].spec`,
        pass:  cmp.exact(g.spec, w.spec),
        got:   g.spec,
        want:  w.spec
      });
    }
    if (w.unitPrice !== undefined) {
      checks.push({
        field: `rows[${i}].unitPrice`,
        pass:  cmp.numberEqual(gUnitPrice, w.unitPrice),
        got:   gUnitPrice,
        want:  w.unitPrice
      });
    }
  }

  const passed = checks.filter(c => c.pass).length;
  const total  = checks.length;
  return {
    fixture,
    passed,
    total,
    rate: total ? passed / total : 1,
    checks
  };
}

// ============================================================
// Main
// ============================================================

const fixtures = loadFixtures();
const results  = fixtures.map(evaluate);

const totalPassed = results.reduce((a, r) => a + r.passed, 0);
const totalFields = results.reduce((a, r) => a + r.total,  0);
const overallRate = totalFields ? totalPassed / totalFields : 0;

console.log("========================================================");
console.log(`OCR Accuracy Report — ${fixtures.length} fixtures · ${totalFields} fields`);
console.log("========================================================\n");

for (const r of results) {
  const rate = (r.rate * 100).toFixed(1);
  const status = r.rate === 1 ? "✓" : r.rate >= 0.85 ? "◐" : "✗";
  console.log(`${status}  ${r.fixture._file.padEnd(38)} ${String(r.passed).padStart(2)} / ${String(r.total).padStart(2)}   ${rate.padStart(5)}%   — ${r.fixture.description}`);
  const fails = r.checks.filter(c => !c.pass);
  for (const f of fails) {
    const got  = f.got  === undefined ? "(missing)" : JSON.stringify(f.got);
    const want = JSON.stringify(f.want);
    console.log(`      · ${f.field.padEnd(24)} got=${got}  want=${want}`);
  }
}

const overallPct = (overallRate * 100).toFixed(1);
console.log("\n========================================================");
console.log(`Overall: ${totalPassed} / ${totalFields} passed  ·  ${overallPct}%`);
console.log("Target: 95% ≥  " + (overallRate >= 0.95 ? "✓ PASS" : "✗ below target"));
console.log("========================================================");

process.exit(overallRate >= 0.95 ? 0 : 1);
