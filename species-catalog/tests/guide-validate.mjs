#!/usr/bin/env node
/**
 * guide-validate — Plant Guide 데이터 검증기 (읽기 전용 CLI).
 *
 * 설계 근거: PLANT_GUIDE.md §5-3
 *
 * 도감이 수천 종으로 커질 때 잘못된 참고 데이터가 조용히 섞이는 것을 막는다.
 * OCR 코퍼스 러너(tests/ocr-accuracy.mjs)와 같은 성격이며 앱 코드와 분리돼 있다.
 *
 *   실행:  node species-catalog/tests/guide-validate.mjs
 *   종료:  ERROR 1건 이상 → exit 1 · 그 외 → exit 0
 *
 * **자동 수정하지 않는다.** 원문 보존 원칙에 따라 읽기만 하고 보고만 한다.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const GUIDE_DIR = join(HERE, "..", "data", "plant-guide");
const INDEX_PATH = join(GUIDE_DIR, "index.json");
const SUPPORTED_SCHEMA = [1];

/** 운영(Species) 전용 필드는 도감에 있으면 안 된다. */
const BANNED_FIELDS = [
  "usage", "root_type", "식용", "약용",
  "price", "prices", "unitPrice", "amount", "quantity",
  "supplier", "suppliers", "invoiceId", "purchaseCounts"
];

const errors = [];
const warns = [];

function err(where, msg)  { errors.push(`${where} — ${msg}`); }
function warn(where, msg) { warns.push(`${where} — ${msg}`); }

function readJson(path, where) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    err(where, `JSON 파싱 실패: ${e.message}`);
    return null;
  }
}

// ------------------------------------------------------------
// 1) index.json
// ------------------------------------------------------------
if (!existsSync(INDEX_PATH)) {
  err("index.json", "파일이 존재하지 않습니다");
  report();
}

const index = readJson(INDEX_PATH, "index.json");
if (!index) report();

if (!SUPPORTED_SCHEMA.includes(index.schema)) {
  err("index.json", `지원하지 않는 schema: ${JSON.stringify(index.schema)} (지원: ${SUPPORTED_SCHEMA.join(",")})`);
}
if (!Array.isArray(index.files)) {
  err("index.json", "files 가 배열이 아닙니다");
  report();
}

// ------------------------------------------------------------
// 2) 페이지 파일 · 레코드
// ------------------------------------------------------------
const seenIds = new Map();      // id → 최초 등장 위치 (파일 간 전역 중복 검사)
let totalRecords = 0;

for (const entry of index.files) {
  const label = entry?.file ? `index.files[${entry.file}]` : "index.files[?]";

  if (!entry || typeof entry.file !== "string") {
    err(label, "file 필드가 없습니다");
    continue;
  }

  const filePath = join(GUIDE_DIR, entry.file);
  if (!existsSync(filePath)) {
    err(label, "manifest 에 있으나 실제 파일이 없습니다");
    continue;
  }

  const page = readJson(filePath, entry.file);
  if (!page) continue;

  if (!Array.isArray(page.species)) {
    err(entry.file, "species 가 배열이 아닙니다");
    continue;
  }

  // manifest count 일치
  if (Number.isFinite(entry.count) && entry.count !== page.species.length) {
    err(label, `count 불일치: manifest ${entry.count} vs 실제 ${page.species.length}`);
  }

  // 추적성
  if (!page.source)      warn(entry.file, "source 가 없습니다 (추적 불가)");
  if (!page.extractedAt) warn(entry.file, "extractedAt 이 없습니다 (추적 불가)");

  const declaredPages = Array.isArray(page.pages) ? page.pages : [];
  const seenImageIdx = new Set();

  page.species.forEach((rec, i) => {
    totalRecords++;
    const at = `${entry.file}[${i}] ${rec?.name || "(이름없음)"}`;

    if (!rec || typeof rec !== "object") { err(at, "레코드가 객체가 아닙니다"); return; }

    // 필수 필드
    if (!rec.name || !String(rec.name).trim()) err(at, "name 이 비어 있습니다");

    // id — 없으면 스토어가 pg-<page>-<nn> 로 생성하므로 경고만
    if (rec.id == null) {
      warn(at, "id 가 없습니다 (로드 시 자동 생성됨)");
    } else {
      if (!/^pg-/.test(rec.id)) err(at, `id 가 pg- 네임스페이스가 아닙니다: ${rec.id}`);
      if (seenIds.has(rec.id)) err(at, `id 중복: ${rec.id} (최초 ${seenIds.get(rec.id)})`);
      else seenIds.set(rec.id, at);
    }

    // page 연결
    if (!Number.isInteger(rec.page)) {
      err(at, `page 가 정수가 아닙니다: ${JSON.stringify(rec.page)}`);
    } else if (declaredPages.length && !declaredPages.includes(rec.page)) {
      err(at, `page ${rec.page} 가 파일의 pages ${JSON.stringify(declaredPages)} 에 없습니다`);
    }

    // 개화기 범위
    const fs = rec.flowering_start, fe = rec.flowering_end;
    for (const [k, v] of [["flowering_start", fs], ["flowering_end", fe]]) {
      if (v == null) continue;
      if (!Number.isInteger(v) || v < 1 || v > 12) err(at, `${k} 가 1~12 정수가 아닙니다: ${JSON.stringify(v)}`);
    }
    if (Number.isInteger(fs) && Number.isInteger(fe) && fs > fe) {
      err(at, `flowering_start(${fs}) > flowering_end(${fe})`);
    }

    // bloomMonths 가 있으면 flowering 범위와 일치해야 한다 (정본은 flowering_*)
    if (Array.isArray(rec.bloomMonths) && Number.isInteger(fs) && Number.isInteger(fe)) {
      const expected = [];
      for (let m = fs; m <= fe; m++) expected.push(m);
      if (JSON.stringify(rec.bloomMonths) !== JSON.stringify(expected)) {
        warn(at, `bloomMonths ${JSON.stringify(rec.bloomMonths)} 가 개화기 ${fs}~${fe} 와 불일치`);
      }
    }

    // 식재밀도
    const d = rec.plant_density;
    if (d != null) {
      const ok = ["min", "mid", "max"].every(k => Number.isInteger(d[k]));
      if (!ok) err(at, `plant_density 가 {min,mid,max} 정수가 아닙니다: ${JSON.stringify(d)}`);
      else if (!(d.min <= d.mid && d.mid <= d.max)) {
        err(at, `plant_density 순서 오류: ${d.min}/${d.mid}/${d.max}`);
      }
    }

    // 금지 필드 (운영 데이터 혼입 방지)
    for (const k of BANNED_FIELDS) {
      if (k in rec) err(at, `운영 전용 필드가 포함돼 있습니다: ${k}`);
    }

    // 권장 필드 (WARN)
    if (!rec.scientific_name) warn(at, "scientific_name 이 비어 있습니다");
    for (const k of ["height", "market_size", "light", "landscape_use"]) {
      if (!rec[k]) warn(at, `${k} 가 비어 있습니다`);
    }

    // image_index 파일 내 유일성
    if (rec.image_index != null) {
      if (seenImageIdx.has(rec.image_index)) warn(at, `image_index 중복: ${rec.image_index}`);
      else seenImageIdx.add(rec.image_index);
    }
  });
}

report();

// ------------------------------------------------------------
function report() {
  const line = "=".repeat(56);
  console.log(line);
  console.log("Plant Guide Validator");
  console.log(line);
  console.log(`파일: ${Array.isArray(index?.files) ? index.files.length : 0}개 · 레코드: ${totalRecords}건 · 고유 id: ${seenIds.size}개`);

  if (errors.length) {
    console.log(`\n[ERROR] ${errors.length}건`);
    errors.forEach(e => console.log("  ✗ " + e));
  }
  if (warns.length) {
    console.log(`\n[WARN] ${warns.length}건`);
    warns.forEach(w => console.log("  ! " + w));
  }
  if (!errors.length && !warns.length) console.log("\n문제 없음.");

  console.log("\n" + line);
  console.log(errors.length ? `FAIL — ERROR ${errors.length}건` : `PASS — ERROR 0건 (WARN ${warns.length}건)`);
  console.log(line);
  process.exit(errors.length ? 1 : 0);
}
