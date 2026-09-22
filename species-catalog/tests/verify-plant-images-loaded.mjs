#!/usr/bin/env node
/**
 * 적재 후 검증 — `plant_images` 가 CSV 를 손실 없이 담았는가 (T11-6.3).
 *
 *   SUPABASE_URL=… SUPABASE_SERVICE_KEY=… \
 *   node species-catalog/tests/verify-plant-images-loaded.mjs \
 *        --report=report.json [--csv=plant_images.csv]
 *
 * ## 쓰기를 하지 않는다
 *
 * DB 로 나가는 요청은 `GET` 뿐이다(`fetchRows`). 이 파일에 POST·PATCH·DELETE
 * 경로가 없다. 적재는 `import-plant-images.mjs` 가, 사전 대조는
 * `verify-plant-images.mjs` 가 한다 — 세 가지 일을 한 파일에 두면 "검증만
 * 돌린다"는 말이 보증되지 않는다.
 *
 * ## 기댓값을 지어내지 않는다
 *
 * A~H 의 기댓값은 전부 `report.json` 에서 읽는다. 여기에 4763 같은 숫자를
 * 적어 두면, 다른 CSV 를 적재했을 때도 그 숫자로 판정해 **틀린 PASS** 가
 * 나온다. 기댓값의 출처는 적재 전에 실측한 보고서 하나뿐이다.
 *
 * ## 같은 파일인지 먼저 확인한다
 *
 * `--csv` 를 주면 SHA256 을 다시 계산해 `dataset.hash.value` 와 비교한다.
 * 다르면 **검증한 파일과 적재한 파일이 다르다** — 그 경우 아래 숫자가 전부
 * 맞아도 의미가 없다. 맞은 것은 다른 데이터에 대한 기댓값일 뿐이다.
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import { canonicalKey, normalizeScientificName } from "../services/scientificName.js";

export const TABLE = "plant_images";
export const COLUMNS = "scientific_name, korean_name, image_url";
export const ALLOWED_HOST = /(^|\.)nature\.go\.kr$/i;

/** 계약이 바뀌면 여기서 멈춘다 — 모르는 major 를 반쯤 해석하지 않는다. */
export const EXPECTED_SCHEMA = { name: "plant-image-review", major: 4 };

/** 적재 후 샘플 조회 대상. 실제 CSV 에서 확인된 학명만 쓴다. */
export const SAMPLES = [
  { name: "Stipa tenuissima Trin.",           want: "사진이 1건 이상" },
  { name: "Spiraea thunbergii 'Mount Fuji'",  want: "품종 사진이 품종에 남아 있음" },
  { name: "Lavandula angustifolia Mill.",     want: "명명자를 떼면 우리 표기와 이어짐" }
];

// ------------------------------------------------------------
// 읽기
// ------------------------------------------------------------

/**
 * 테이블 전량을 GET 으로 읽는다. PostgREST 기본 `max-rows` 가 1000 이라
 * 페이지네이션이 필수다 — 이걸 놓치면 1,000행만 보고 "손실 3,763행"이라고
 * 보고하게 된다.
 */
export async function fetchRows(base, key, pageSize = 1000, table = TABLE) {
  const url = String(base).replace(/\/+$/, "");
  const out = [];
  for (let offset = 0; ; offset += pageSize) {
    const res = await fetch(
      `${url}/rest/v1/${table}?select=${encodeURIComponent(COLUMNS)}` +
      `&order=scientific_name&limit=${pageSize}&offset=${offset}`,
      { method: "GET", headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
    const batch = await res.json();
    out.push(...batch);
    if (batch.length < pageSize) break;
  }
  return out;
}

// ------------------------------------------------------------
// 집계 — DB 에서 받은 행으로 A~H 를 센다
// ------------------------------------------------------------

/**
 * `count(distinct …)` 를 SQL 로 내지 않는 이유: PostgREST 로는 뷰나 RPC 없이
 * 불가능하고, 그걸 만들면 **검증을 위해 DB 를 바꾸는** 셈이 된다. 4,763행의
 * 두 컬럼은 ~150 KiB 라 받아서 세는 편이 싸고, 무엇보다 아무것도 만들지 않는다.
 */
export function measure(rows) {
  const names = new Set(), urls = new Map(), pairs = new Set();
  let empty = 0, malformed = 0, pairDup = 0, emptyKorean = 0;
  const offsiteHosts = {};

  for (const r of rows) {
    const name = String(r.scientific_name ?? "");
    const url  = String(r.image_url ?? "");
    names.add(name);
    if (!String(r.korean_name ?? "").trim()) emptyKorean++;

    const pair = `${name}\u0000${url}`;
    if (pairs.has(pair)) pairDup++; else pairs.add(pair);

    if (!url.trim()) { empty++; continue; }
    let owners = urls.get(url);
    if (!owners) urls.set(url, owners = new Set());
    owners.add(name);

    let host = "";
    try { host = new URL(url).hostname; } catch { malformed++; continue; }
    if (!/^https?:$/i.test(new URL(url).protocol)) { malformed++; continue; }
    if (!ALLOWED_HOST.test(host)) offsiteHosts[host] = (offsiteHosts[host] || 0) + 1;
  }

  const shared = [...urls.entries()].filter(([, v]) => v.size > 1)
    .map(([url, v]) => ({ url, names: [...v] }));

  return {
    total: rows.length,
    distinctNames: names.size,
    distinctUrls: urls.size,
    sharedCount: shared.length,
    shared,
    pairDup, empty, malformed, emptyKorean,
    offsiteHosts,
    offsiteCount: Object.values(offsiteHosts).reduce((a, b) => a + b, 0)
  };
}

/**
 * A~H 판정. 기댓값은 전부 보고서에서 온다.
 *
 * A 의 기댓값으로 `csvValidRows` 를 쓴다 — `csvRows` 는 건너뛴 행(빈 URL 등)을
 * 포함하고, 그 행들은 애초에 적재되지 않는다. 오늘 두 값이 같더라도 다음번
 * CSV 에 빈 URL 이 하나라도 있으면 `csvRows` 기준은 반드시 실패한다.
 */
export function judge(m, report) {
  const src = report?.source || {};
  const url = report?.url || {};
  const expectedRows = src.csvValidRows ?? src.csvRows;

  return [
    { id: "A", label: "COUNT(*)",                        actual: m.total,         expected: expectedRows },
    { id: "B", label: "COUNT(DISTINCT scientific_name)", actual: m.distinctNames, expected: src.csvNames },
    { id: "C", label: "COUNT(DISTINCT image_url)",       actual: m.distinctUrls,  expected: url.distinct },
    { id: "D", label: "공유 URL 개수",                    actual: m.sharedCount,   expected: url.sharedCount },
    { id: "E", label: "(scientific_name, image_url) 중복", actual: m.pairDup,     expected: 0 },
    { id: "F", label: "빈 URL",                           actual: m.empty,         expected: 0 },
    { id: "G", label: "malformed URL",                    actual: m.malformed,     expected: 0 },
    { id: "H", label: "offsite host",                     actual: m.offsiteCount,  expected: 0 }
  ].map(c => ({ ...c, pass: c.expected !== undefined && c.actual === c.expected }));
}

/** 사전 조건 — 보고서가 이 검증에 쓸 수 있는 것인가. */
export function checkPreconditions(report, csvHash) {
  const out = [];
  const s = report?.schema;
  out.push({
    label: `schema ${EXPECTED_SCHEMA.name} major ${EXPECTED_SCHEMA.major}`,
    detail: s ? `${s.name}/${s.major}.${s.minor}` : "(없음)",
    pass: s?.name === EXPECTED_SCHEMA.name && s?.major === EXPECTED_SCHEMA.major
  });
  const algo = report?.dataset?.hash?.algorithm;
  out.push({ label: "dataset.hash.algorithm = sha256", detail: algo || "(없음)",
             pass: algo === "sha256" });
  const value = report?.dataset?.hash?.value || "";
  out.push({ label: "dataset.hash.value 존재", detail: value.slice(0, 12) + "…",
             pass: /^[0-9a-f]{64}$/.test(value) });
  if (csvHash) {
    out.push({
      label: "CSV SHA256 일치", pass: csvHash === value,
      detail: csvHash === value ? "같은 파일" : `적재본 ${csvHash.slice(0, 12)}… ≠ 보고서 ${value.slice(0, 12)}…`
    });
  } else {
    out.push({ label: "CSV SHA256 일치", pass: false,
               detail: "--csv 를 주지 않아 확인하지 못함 — 같은 파일인지 알 수 없다" });
  }
  return out;
}

/**
 * 샘플 조회. 학명을 **원문 그대로** 찾고, 못 찾으면 canonical 이 같은 행을 센다.
 * 두 숫자를 나눠 보여 주는 이유는 "적재가 안 됐다"와 "표기가 다르다"가 다른
 * 사고이기 때문이다.
 */
export function sampleCheck(rows, samples = SAMPLES) {
  const byRaw = new Map(), byCanon = new Map();
  for (const r of rows) {
    const raw = normalizeScientificName(r.scientific_name);
    const can = canonicalKey(r.scientific_name);
    (byRaw.get(raw) ?? byRaw.set(raw, []).get(raw)).push(r);
    (byCanon.get(can) ?? byCanon.set(can, []).get(can)).push(r);
  }
  return samples.map(s => {
    const raw = byRaw.get(normalizeScientificName(s.name)) || [];
    const can = byCanon.get(canonicalKey(s.name)) || [];
    return { ...s, rawHits: raw.length, canonicalHits: can.length,
             url: raw[0]?.image_url || can[0]?.image_url || "", pass: raw.length > 0 };
  });
}

// ------------------------------------------------------------
// CLI
// ------------------------------------------------------------

function line(ok) { return ok ? "PASS" : "FAIL"; }

async function main(argv) {
  const flags = Object.fromEntries(argv.slice(2).filter(a => a.startsWith("--")).map(a => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }));
  if (typeof flags.report !== "string") {
    console.error("사용법: node …/verify-plant-images-loaded.mjs --report=report.json [--csv=plant_images.csv]");
    process.exit(2);
  }

  const report = JSON.parse(fs.readFileSync(path.resolve(flags.report), "utf8"));
  const csvHash = typeof flags.csv === "string"
    ? createHash("sha256").update(fs.readFileSync(path.resolve(flags.csv))).digest("hex")
    : "";

  console.log(`보고서  : ${flags.report}`);
  console.log(`CSV     : ${flags.csv || "(주지 않음)"}\n`);

  console.log("── 사전 조건 ────────────────────────────────");
  const pre = checkPreconditions(report, csvHash);
  for (const p of pre) console.log(`  [${line(p.pass)}] ${p.label.padEnd(36)} ${p.detail || ""}`);
  if (pre.some(p => !p.pass)) {
    console.error("\n✗ 사전 조건 실패 — 적재 검증을 진행하지 않습니다.");
    console.error("  기댓값의 근거가 없는 상태에서 통과를 보고하면 틀린 PASS 가 됩니다.");
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL · SUPABASE_SERVICE_KEY 환경변수가 필요합니다");

  const rows = await fetchRows(url, key);
  console.log(`\nplant_images: ${rows.length}행 (GET /rest/v1/${TABLE})\n`);

  const m = measure(rows);
  const checks = judge(m, report);

  console.log("── 적재 완료 조건 A~H ───────────────────────");
  for (const c of checks) {
    console.log(`  ${c.id}. [${line(c.pass)}] ${c.label.padEnd(34)} ` +
                `실제 ${String(c.actual).padStart(6)}  기대 ${String(c.expected).padStart(6)}`);
  }
  if (m.sharedCount) {
    console.log(`\n  공유 URL ${m.sharedCount}건:`);
    for (const s of m.shared.slice(0, 10)) console.log(`    ${s.url}\n      ${s.names.join(" · ")}`);
  }
  if (m.offsiteCount) {
    console.log(`\n  nature.go.kr 외 호스트:`);
    for (const [h, n] of Object.entries(m.offsiteHosts)) console.log(`    ${h} — ${n}건`);
  }
  if (m.emptyKorean) console.log(`\n  ⚠ 국명이 빈 행 ${m.emptyKorean}건 (완료 조건은 아니지만 캡션이 빈다)`);

  console.log("\n── 샘플 조회 ────────────────────────────────");
  const samples = sampleCheck(rows);
  for (const s of samples) {
    console.log(`  [${line(s.pass)}] ${s.name}`);
    console.log(`        원문 ${s.rawHits}건 · canonical ${s.canonicalHits}건 — ${s.want}`);
    if (s.url) console.log(`        ${s.url}`);
  }

  const ok = checks.every(c => c.pass);
  console.log("\n" + "=".repeat(52));
  console.log(`T11-6.3 ${ok ? "PASS" : "FAIL"}  —  A~H ${checks.filter(c => c.pass).length}/${checks.length}` +
              ` · 샘플 ${samples.filter(s => s.pass).length}/${samples.length}`);
  console.log("=".repeat(52));
  console.log("이 검증은 GET 만 사용했습니다 — INSERT/UPDATE/DELETE 를 수행하지 않았습니다.");
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv).catch(err => { console.error(`✗ ${err.message}`); process.exit(1); });
}
