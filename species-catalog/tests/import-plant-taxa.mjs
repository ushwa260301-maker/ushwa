#!/usr/bin/env node
/**
 * 국립수목원 도감 API → `plant_taxa` 적재 (T12-2).
 *
 *   node species-catalog/tests/import-plant-taxa.mjs --names=산수국,노각나무   # 점검만
 *   node species-catalog/tests/import-plant-taxa.mjs --names-file=names.txt
 *   node species-catalog/tests/import-plant-taxa.mjs --json=dump.json         # 저장해 둔 응답으로
 *   node species-catalog/tests/import-plant-taxa.mjs --names=산수국 --sql=out.sql
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

/** 국립수목원 OpenAPI. 경로는 `plantResourceProvider` 가 쓰는 것과 같은 서비스다. */
const API_BASE = "http://api.nature.go.kr/openapi/service/rest/PlantService";

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

async function callApi(op, params, key) {
  const qs = new URLSearchParams({ serviceKey: key, ...params });
  const res = await fetch(`${API_BASE}/${op}?${qs}`);
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
  const call = ctx.call;
  const found = await call(SEARCH_OP, { reqSearchWrd: koreanName, numOfRows: "5" });
  const no = found.map(mapSearchRow).find(Boolean);
  if (!no) return { row: null, reason: "검색 결과 없음" };

  const detail = (await call(DETAIL_OP, { reqPlantPilbkNo: no }))[0];
  const mapped = mapDetailRow(detail || {});
  if (!mapped) return { row: null, reason: "상세 응답에 도감번호 없음" };

  const row = toTaxonRow(mapped, { syncedAt: ctx.syncedAt });
  if (!row) return { row: null, reason: "학명 없음" };
  return { row, reason: "" };
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
                    "(--names=국명,… | --names-file=f | --json=dump.json) [--sql[=out.sql]] [--apply]");
      process.exit(2);
    }
    const key = process.env.KNA_SERVICE_KEY;
    if (!key) {
      console.error("✗ KNA_SERVICE_KEY 환경변수가 필요합니다. 인자로 받지 않습니다.");
      process.exit(1);
    }
    const ctx = { call: (op, p) => callApi(op, p, key), syncedAt };
    for (const name of names) {
      try {
        const { row, reason } = await fetchTaxon(name, ctx);
        row ? rows.push(row) : failures.push({ name, reason });
      } catch (err) {
        failures.push({ name, reason: err.message });
      }
    }
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

  if (rows.length) {
    const s = rows[0];
    console.log(`\n예시    : ${s.korean_name} / ${s.scientific_name}`);
    console.log(`          ${s.family} · ${s.genus} · ${s.growth_form ?? "—"} · ` +
                `${s.sunlight ?? "—"} · ${s.flowering_months?.join("~") ?? "—"}`);
    if (s.shpe_raw) console.log(`  원문   : ${s.shpe_raw.slice(0, 120)}`);
  }

  if (flags.sql) {
    const sql = toSql(rows);
    const out = typeof flags.sql === "string" ? flags.sql : "";
    out ? (fs.writeFileSync(out, sql + "\n"), console.log(`\nSQL     : ${out}`))
        : console.log("\n" + sql);
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
