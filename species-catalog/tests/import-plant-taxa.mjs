#!/usr/bin/env node
/**
 * 국립수목원 도감 API → `plant_taxa` 적재 (T12-2).
 *
 *   node species-catalog/tests/import-plant-taxa.mjs --names=산수국,노각나무   # 점검만
 *   node species-catalog/tests/import-plant-taxa.mjs --names-file=names.txt
 *   node species-catalog/tests/import-plant-taxa.mjs --json=dump.json         # 저장해 둔 응답으로
 *   node species-catalog/tests/import-plant-taxa.mjs --names=산수국 --sql=out.sql
 *   node species-catalog/tests/import-plant-taxa.mjs --names=산수국 --sql=out.sql --no-bom
 *   node species-catalog/tests/import-plant-taxa.mjs --names=산수국 --apply
 *
 * 테이블은 `supabase/2026-09-23_plant_taxa.sql` 이 먼저 만들어 둔다.
 *
 * ## 키는 환경변수로만 받는다
 *
 *   KNA_SERVICE_KEY        국립수목원 API 키
 *   SUPABASE_URL           적재 대상
 *   SUPABASE_SERVICE_KEY   적재 키 (`--apply` 일 때만)
 *
 * **인자나 파일로 받지 않는다.** 명령줄은 셸 히스토리에 남고 파일은 커밋된다.
 * 어떤 경우에도 키를 로그에 찍지 않는다.
 *
 * ## 2단계 조회
 *
 *     국명 → plantPilbkSearch(reqSearchWrd)  → plantPilbkNo
 *          → plantPilbkInfo(reqPlantPilbkNo) → 형태·생육환경 서술
 *
 * 오퍼레이션 이름과 응답 필드명은 `services/plantProviders/plantResourceProvider.js`
 * 가 정본이다. 여기서 다시 적지 않는다 — 두 군데 적으면 갈라진다.
 *
 * ## 뽑기와 저장
 *
 * 생육형·광조건·개화월은 KNA 에 필드가 없어 서술 문장에서 뽑는다
 * (`services/knaTaxonText.js`). **원문도 함께 저장한다** — 대조할 수 없는
 * 파생값은 출처 없는 값과 같다.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { SEARCH_OP, DETAIL_OP, mapSearchRow, mapDetailRow }
  from "../services/plantProviders/plantResourceProvider.js";
import { toTaxonRow, isDisplayComplete } from "../services/knaTaxonText.js";

export const TABLE = "plant_taxa";

/**
 * 국립수목원 식물자원 API. 공공데이터포털에서 확인한 주소다 (2026-09-23).
 *
 *     https://apis.data.go.kr/1400119/PlantResource/plantPilbkSearch
 *
 * 이전 값(`http://api.nature.go.kr/openapi/service/rest/PlantService`)은
 * 근거 없이 **추측한 주소**였다. 그 주소로는 응답이 오지 않아, 타임아웃이
 * 없던 `fetch` 가 출력 한 줄 없이 매달렸다.
 */
export const API_BASE = "https://apis.data.go.kr/1400119/PlantResource";

/** 응답을 기다리는 한도. 없으면 서버가 침묵할 때 영원히 매달린다. */
export const TIMEOUT_MS = 15_000;

// ------------------------------------------------------------
// 응답 해석
// ------------------------------------------------------------

/**
 * KNA 는 XML 을 돌려준다. `item` 안의 평평한 태그만 읽으면 되므로
 * XML 파서를 끌어오지 않는다 — 중첩도 속성도 쓰지 않는 응답이다.
 *
 * @returns {object[]} item 하나당 객체 하나
 */
export function parseItems(xml) {
  const text = String(xml ?? "");
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(text))) {
    const row = {};
    const tagRe = /<([A-Za-z_][\w.-]*)>([\s\S]*?)<\/\1>/g;
    let t;
    while ((t = tagRe.exec(m[1]))) row[t[1]] = decodeXml(t[2]);
    items.push(row);
  }
  return items;
}

function decodeXml(s) {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

/**
 * 응답이 오류를 말하고 있는가.
 *
 * KNA 는 키가 틀려도 **HTTP 200** 으로 오류 본문을 준다. 그래서 상태 코드만
 * 보면 "결과 0건" 과 "키가 틀렸다" 를 구분하지 못하고, 조용히 빈 적재가 된다.
 */
export function apiError(xml) {
  const text = String(xml ?? "");
  const code = /<returnReasonCode>([^<]*)<\/returnReasonCode>/.exec(text)?.[1];
  const msg  = /<(returnAuthMsg|errMsg|resultMsg)>([^<]*)<\/\1>/.exec(text)?.[2];
  if (code && code !== "00") return `${code} ${msg || ""}`.trim();
  if (/SERVICE[_ ]?KEY|LIMITED_NUMBER|UNREGISTERED/i.test(text)) return msg || "서비스 키 오류";
  return "";
}

// ------------------------------------------------------------
// 조회
// ------------------------------------------------------------

/**
 * 서비스 키를 **한 번만** 인코딩한다.
 *
 * 공공데이터포털은 키를 이미 URL 인코딩된 형태로 내려준다(`…%2BAbC%3D`).
 * 그대로 `URLSearchParams` 에 넣으면 `%` 가 다시 `%25` 로 인코딩돼 다른
 * 문자열이 되고, 서버는 "등록되지 않은 키" 라고 답한다. 이미 인코딩된
 * 키는 먼저 풀어 준다 — 그러면 인코딩이 정확히 한 번 일어난다.
 */
export function normalizeServiceKey(key) {
  const s = String(key ?? "").trim();
  if (!/%[0-9A-Fa-f]{2}/.test(s)) return s;
  try { return decodeURIComponent(s); } catch { return s; }
}

/** 로그에 실을 주소. **키는 절대 남기지 않는다.** */
export function maskUrl(url) {
  return String(url).replace(/([?&]serviceKey=)[^&]*/i, "$1***");
}

async function callApi(op, params, key) {
  const qs = new URLSearchParams({ serviceKey: normalizeServiceKey(key), ...params });
  const url = `${API_BASE}/${op}?${qs}`;
  console.log(`  → ${maskUrl(url)}`);

  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    // 끊긴 이유를 말해 준다 — 침묵보다 낫다.
    const why = err?.name === "TimeoutError" || err?.name === "AbortError"
      ? `${TIMEOUT_MS / 1000}초 안에 응답 없음`
      : (err?.cause?.code || err?.message || "연결 실패");
    throw new Error(`${op} 요청 실패: ${why}`);
  }

  const body = await res.text();
  if (!res.ok) throw new Error(`${op} HTTP ${res.status}`);   // 본문을 싣지 않는다 — 키가 섞일 수 있다
  const err = apiError(body);
  if (err) throw new Error(`${op} 응답 오류: ${err}`);
  return parseItems(body);
}

/**
 * 국명 하나 → `plant_taxa` 행. 못 찾으면 `null` 과 이유.
 *
 * `fetchJson` 을 주입받으면 네트워크 없이 검사할 수 있다.
 */
export async function fetchTaxon(koreanName, ctx) {
  const want = String(koreanName ?? "").trim();
  const call = ctx.call;
  const limit = String(ctx.limit ?? 5);

  const found = await call(SEARCH_OP, { reqSearchWrd: want, numOfRows: limit });
  const numbers = found.map(mapSearchRow).filter(Boolean);
  if (!numbers.length) return { row: null, reason: "검색 결과 없음", candidates: 0, seen: [] };

  const seen = [];
  for (const no of numbers) {
    const detail = (await call(DETAIL_OP, { reqPlantPilbkNo: no }))[0];
    const mapped = mapDetailRow(detail || {});
    if (!mapped) { seen.push({ no, name: "" }); continue; }

    const name = String(mapped.koreanName ?? "").trim();
    seen.push({ no, name });

    // 국명이 **정확히** 같을 때만 채택한다.
    //
    // `plantPilbkSearch("산수국")` 은 떡잎산수국(`Hydrangea serrata f.
    // coreana`)을 먼저 돌려준다. 첫 결과를 그냥 받으면 **다른 분류군이
    // 조용히 들어온다** — 화면은 산수국이라 적고 값은 품종의 것이 된다.
    //
    // 부분 일치·유사도는 쓰지 않는다. "산수국" 이 "떡잎산수국" 에 들어
    // 있다는 사실은 두 식물이 같다는 뜻이 아니다.
    if (name !== want) continue;

    const row = toTaxonRow(mapped, { syncedAt: ctx.syncedAt });
    if (!row) {
      return { row: null, reason: `국명은 맞으나 학명이 없음 (도감번호 ${no})`,
               candidates: numbers.length, seen };
    }
    return { row, reason: "", candidates: numbers.length, seen };
  }

  // 못 찾았으면 **실패로 남긴다.** 비슷한 것을 대신 주지 않는다.
  const names = seen.map(s => s.name || `?(${s.no})`).join(", ");
  return { row: null, candidates: numbers.length, seen,
           reason: `"${want}" 와 국명이 정확히 일치하는 후보 없음 — 후보 ${numbers.length}건: ${names}` };
}

// ------------------------------------------------------------
// SQL
// ------------------------------------------------------------

const lit = v => {
  if (v == null) return "null";
  if (Array.isArray(v)) return v.length ? `'{${v.join(",")}}'` : "null";
  const s = String(v);
  return s === "" ? "null" : `'${s.replace(/'/g, "''")}'`;
};

/** `plant_taxa` 의 컬럼. 표에 없는 이름을 여기 적으면 적재가 통째로 실패한다. */
const COLUMNS = ["scientific_name", "korean_name", "family", "genus",
                 "growth_form", "sunlight", "flowering_months",
                 "shpe_raw", "grw_evrnt_raw", "synced_at"];

/**
 * SQL 파일 쓰기 — **UTF-8, 기본적으로 BOM 을 붙인다.**
 *
 * Node 의 기본 인코딩이 이미 utf8 이라 바이트는 원래도 정확했다. 깨진 것은
 * 읽는 쪽이다: Windows PowerShell 5.1 의 `Get-Content` 는 인코딩을 주지
 * 않으면 시스템 ANSI 코드페이지(한국어 Windows 는 CP949)로 읽는다. 그래서
 * BOM 없는 UTF-8 파일이 `산수국` → `?곗닔援?` 로 보인다.
 *
 * 파일이 멀쩡해도 **사람이 검토할 수 없으면 소용이 없다.** BOM 세 바이트가
 * 있으면 PowerShell · 메모장 · Excel 이 UTF-8 로 알아본다.
 *
 * psql 에 파일을 직접 먹일 때는 BOM 이 구문 오류가 될 수 있다 — 그때는
 * `--no-bom` 을 준다. Supabase SQL Editor 에 붙여 넣는 경로는 영향 없다.
 */
export const UTF8_BOM = "﻿";

export function writeSql(file, sql, { bom = true } = {}) {
  fs.writeFileSync(file, (bom ? UTF8_BOM : "") + sql + "\n", "utf8");
  return file;
}

export function toSql(rows, batchSize = 200) {
  const out = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    const values = rows.slice(i, i + batchSize)
      .map(r => `  (${COLUMNS.map(c => lit(r[c])).join(", ")})`).join(",\n");
    out.push(
      `insert into public.${TABLE}\n  (${COLUMNS.join(", ")})\nvalues\n${values}\n` +
      `on conflict (scientific_name) do update set\n` +
      COLUMNS.filter(c => c !== "scientific_name")
        .map(c => `      ${c} = excluded.${c}`).join(",\n") + ";");
  }
  return out.join("\n\n");
}

// ------------------------------------------------------------
// 적재
// ------------------------------------------------------------

async function apply(rows, batchSize = 200) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL · SUPABASE_SERVICE_KEY 환경변수가 필요합니다 " +
                    "(키는 인자나 파일이 아니라 환경변수로만 받는다)");
  }
  let done = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const res = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/${TABLE}`, {
      method: "POST",
      headers: {
        apikey: key, Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify(batch)
    });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
    done += batch.length;
    console.log(`  적재 ${done}/${rows.length}`);
  }
  return done;
}

// ------------------------------------------------------------
// CLI
// ------------------------------------------------------------

function readNames(flags) {
  if (flags["names-file"]) {
    return fs.readFileSync(path.resolve(flags["names-file"]), "utf8")
      .split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  }
  return String(flags.names || "").split(",").map(s => s.trim()).filter(Boolean);
}

async function main(argv) {
  const args = argv.slice(2);
  const flags = Object.fromEntries(args.filter(a => a.startsWith("--")).map(a => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }));

  const syncedAt = new Date().toISOString();
  let rows = [], failures = [];

  if (flags.json) {
    // 저장해 둔 상세 응답으로 — 네트워크 없이 뽑기 규칙만 확인할 때.
    const raw = JSON.parse(fs.readFileSync(path.resolve(flags.json), "utf8"));
    for (const d of (Array.isArray(raw) ? raw : raw.items || [])) {
      const mapped = mapDetailRow(d);
      const row = mapped && toTaxonRow(mapped, { syncedAt });
      row ? rows.push(row) : failures.push({ name: d?.plantGnrlNm || "?", reason: "학명 없음" });
    }
  } else {
    const names = readNames(flags);
    if (!names.length) {
      console.error("사용법: node species-catalog/tests/import-plant-taxa.mjs " +
                    "(--names=국명,… | --names-file=f | --json=dump.json) " +
                    "[--sql[=out.sql]] [--no-bom] [--apply]");
      process.exit(2);
    }
    const key = process.env.KNA_SERVICE_KEY;
    if (!key) {
      console.error("✗ KNA_SERVICE_KEY 환경변수가 필요합니다. 인자로 받지 않습니다.");
      process.exit(1);
    }
    const ctx = { call: (op, p) => callApi(op, p, key), syncedAt };
    console.log(`대상    : ${names.length}건 — ${names.join(", ")}`);
    console.log(`API     : ${API_BASE}\n`);

    // 호출 전에 어디까지 왔는지 알린다. 이 줄이 없으면 네트워크가 멈췄을 때
    // 화면이 완전히 비어, 멈춘 것인지 끝난 것인지 구분할 수 없다.
    for (const [i, name] of names.entries()) {
      console.log(`[${i + 1}/${names.length}] ${name} 조회 중…`);
      try {
        const { row, reason, candidates, seen } = await fetchTaxon(name, ctx);
        if (seen?.length) {
          console.log(`  후보 ${candidates}건: ${seen.map(s => `${s.name || "?"}(${s.no})`).join(", ")}`);
        }
        if (row) { rows.push(row); console.log(`  ✓ 채택 ${row.korean_name} / ${row.scientific_name}`); }
        else     { failures.push({ name, reason }); console.log(`  ✗ ${reason}`); }
      } catch (err) {
        failures.push({ name, reason: err.message });
        console.log(`  ✗ ${err.message}`);
      }
    }
    console.log("");
  }

  const complete = rows.filter(isDisplayComplete);
  console.log(`조회    : ${rows.length + failures.length}건`);
  console.log(`행      : ${rows.length}건`);
  console.log(`실패    : ${failures.length}건` +
    (failures.length ? `\n          ${failures.map(f => `${f.name} — ${f.reason}`).join("\n          ")}` : ""));
  console.log(`\n화면 기준(과·속·생육형·광조건·개화월) 충족 : ${complete.length}/${rows.length}`);

  // 무엇이 비었는지 항목별로 센다 — T12-2 는 "빈칸이면 PASS 아님" 이다.
  const missing = { family: 0, genus: 0, growth_form: 0, sunlight: 0, flowering_months: 0 };
  for (const r of rows) for (const k of Object.keys(missing)) {
    if (!r[k] || (Array.isArray(r[k]) && !r[k].length)) missing[k]++;
  }
  console.log(`빈 칸   : ${Object.entries(missing).map(([k, v]) => `${k} ${v}`).join(" · ")}`);

  // 뽑은 값과 **그 근거가 된 원문**을 나란히 보여 준다. 잘라서 보여 주면
  // 값이 비었을 때 원문이 말하지 않은 것인지 뽑기 규칙이 놓친 것인지
  // 판단할 수 없다 — 분석용 출력이며 저장 구조와는 무관하다.
  const RAW_LIMIT = 5;
  for (const s of rows.slice(0, RAW_LIMIT)) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`${s.korean_name} / ${s.scientific_name}`);
    console.log(`  과·속       : ${s.family || "—"} · ${s.genus || "—"}`);
    console.log(`  growth_form : ${s.growth_form ?? "—"}`);
    console.log(`  sunlight    : ${s.sunlight ?? "—"}`);
    console.log(`  개화월      : ${s.flowering_months?.join(", ") ?? "—"}`);
    console.log(`\n  ── shpe_raw (형태 원문) ──\n${s.shpe_raw ?? "  (비어 있음)"}`);
    console.log(`\n  ── grw_evrnt_raw (생육환경 원문) ──\n${s.grw_evrnt_raw ?? "  (비어 있음)"}`);
  }
  if (rows.length > RAW_LIMIT) console.log(`\n… 원문은 앞 ${RAW_LIMIT}건만 보여 준다`);

  if (flags.sql) {
    const sql = toSql(rows);
    const out = typeof flags.sql === "string" ? flags.sql : "";
    if (out) {
      const bom = !flags["no-bom"];
      writeSql(out, sql, { bom });
      console.log(`\nSQL     : ${out}  (UTF-8${bom ? " BOM" : ", BOM 없음"})`);
      if (bom) console.log(`          PowerShell: Get-Content .\\${path.basename(out)}`);
    } else {
      console.log("\n" + sql);
    }
  }

  if (flags.apply) {
    if (!rows.length) { console.error("\n✗ 적재할 행이 없습니다."); process.exit(1); }
    console.log(`\n${TABLE} 적재 시작`);
    console.log(`완료: ${await apply(rows)}행`);
  }

  if (!flags.sql && !flags.apply) console.log("\n(점검만 했습니다 — --sql 또는 --apply 를 주세요)");
  process.exit(failures.length && !rows.length ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main(process.argv).catch(err => { console.error("✗", err.message); process.exit(1); });
}
