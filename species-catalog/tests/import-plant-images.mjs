#!/usr/bin/env node
/**
 * 표준식물목록 이미지 CSV → `plant_images` 적재 (T11-6.1).
 *
 *   node species-catalog/tests/import-plant-images.mjs <csv>              # 점검만 (기본)
 *   node species-catalog/tests/import-plant-images.mjs <csv> --sql=out.sql # upsert SQL 생성
 *   node species-catalog/tests/import-plant-images.mjs <csv> --apply       # 직접 적재
 *   node species-catalog/tests/import-plant-images.mjs <csv> --map=학명:A,국명:B,…
 *
 * 테이블은 `supabase/2026-09-21_plant_images.sql` 이 먼저 만들어 둔다.
 *
 * ## 헤더는 확인된 것만 받는다
 *
 *     학명,국명,이미지종류,이미지파일경로                      원본 내려받기
 *     scientific_name,korean_name,image_type,image_url      Supabase 적재용
 *
 * 둘 다 실제 파일에서 확인된 헤더다(2026-09-21). 이 밖의 이름은 받지 않는다 —
 * 비슷해 보이는 헤더를 넓게 받아 주면, 다른 파일을 잘못 넣었을 때 그것이
 * **적재에 성공해 버린다.** 못 맞추면 조용히 넘어가지 않고 멈추고, 실제 헤더를
 * 그대로 출력한다. 파일이 바뀌었다면 `--map` 으로 이번 한 번만 지정한다.
 *
 * ## 무엇을 바꾸고 무엇을 안 바꾸는가
 *
 *   학명   앞뒤 공백 제거 + 연속 공백 1칸. 조회 쪽 `normalizeScientificName()`
 *          과 **같은 규칙**이어야 `eq` 가 맞는다. 대소문자·명명자는 그대로 둔다.
 *   URL    앞뒤 공백만 뗀다. 재인코딩·치환 없음 — 원본이 준 주소가 정답이다.
 *   그 외   원문 그대로. 이미지 종류를 flower/leaf 로 바꾸는 일은 여기서 하지
 *          않는다(plantNormalizer 가 정확히 일치할 때만 한다).
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const TABLE = "plant_images";
export const SOURCE = "KNA_IMAGE_CSV";

// ------------------------------------------------------------
// CSV
// ------------------------------------------------------------

/** UTF-8 BOM 제거. BOM 이 붙으면 첫 헤더가 `﻿학명` 이 되어 매칭이 깨진다. */
export function stripBom(text) {
  return typeof text === "string" && text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * RFC4180 파서 — 따옴표 안의 쉼표·줄바꿈·이중따옴표를 모두 다룬다.
 *
 * 정규식 split 을 쓰지 않는 이유: 이미지 캡션이나 URL 에 쉼표가 들어오면
 * 행이 통째로 밀린다. 한 번 밀린 행은 학명 자리에 URL 이 들어가고, 그건
 * 적재 뒤에 찾기 매우 어렵다.
 *
 * @returns {string[][]} 행 배열. 빈 줄은 버린다.
 */
export function parseCsv(text) {
  const src = stripBom(String(text ?? ""));
  const rows = [];
  let row = [], field = "", quoted = false, started = false;

  const endField = () => { row.push(field); field = ""; started = false; };
  const endRow = () => {
    endField();
    // 완전히 빈 줄은 행으로 세지 않는다.
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }   // "" → 리터럴 따옴표
        else quoted = false;
      } else field += ch;
      continue;
    }

    if (ch === '"' && !started) { quoted = true; started = true; continue; }
    if (ch === ",") { endField(); continue; }
    if (ch === "\r") { if (src[i + 1] === "\n") i++; endRow(); continue; }
    if (ch === "\n") { endRow(); continue; }
    field += ch; started = true;
  }
  if (field !== "" || row.length) endRow();
  return rows;
}

// ------------------------------------------------------------
// 헤더 → 컬럼
// ------------------------------------------------------------

/** 비교용 정규화 — 대소문자·공백·밑줄·하이픈 차이를 흡수한다. */
export function normalizeHeader(h) {
  return stripBom(String(h ?? "")).trim().toLowerCase().replace(/[\s_\-.]/g, "");
}

/**
 * 컬럼별 헤더 — **실제 파일에서 확인된 이름.** (2026-09-21 확인)
 * 비교는 `normalizeHeader` 를 거치므로 BOM·앞뒤 공백 차이는 흡수된다.
 */
export const COLUMN_ALIASES = {
  scientific_name: ["학명", "scientificname"],
  korean_name:     ["국명", "koreanname"],
  image_type:      ["이미지종류", "imagetype"],
  image_url:       ["이미지파일경로", "imageurl"]
};

export const COLUMNS = Object.keys(COLUMN_ALIASES);

/**
 * 헤더 행 → `{컬럼: 인덱스}`.
 *
 * @param {string[]} header
 * @param {Record<string,string>} [override]  `--map` 으로 준 {헤더명: 컬럼}
 * @returns {{map: Record<string,number>, missing: string[], headers: string[]}}
 *   `missing` 이 비어 있지 않으면 **적재하지 않는다.**
 */
export function resolveHeaders(header, override = {}) {
  const cells = (header || []).map(normalizeHeader);
  const byOverride = new Map(
    Object.entries(override).map(([h, col]) => [normalizeHeader(h), col])
  );

  const map = {};
  for (const col of COLUMNS) {
    let idx = cells.findIndex(c => byOverride.get(c) === col);
    if (idx < 0) idx = cells.findIndex(c => COLUMN_ALIASES[col].includes(c));
    if (idx >= 0) map[col] = idx;
  }
  return {
    map,
    missing: COLUMNS.filter(c => !(c in map)),
    headers: (header || []).map(h => stripBom(String(h ?? "")).trim())
  };
}

// ------------------------------------------------------------
// 행 → 적재 레코드
// ------------------------------------------------------------

/**
 * 학명 정규화 — **공백만** 정리한다. 조회 쪽과 같은 함수를 쓴다.
 * 두 규칙이 어긋나면 에러 없이 사진만 0건이 된다.
 */
import { normalizeScientificName } from "../services/scientificName.js";
export { normalizeScientificName };

/**
 * 데이터 행들 → `plant_images` 행들.
 *
 * 건너뛰는 경우 (버리지 않고 이유와 함께 돌려준다)
 *   · URL 이 비었다        → 사진이 없는 행이다. 적재할 것이 없다.
 *   · 학명이 비었다        → 조회 키가 없으면 영원히 찾을 수 없다.
 *   · (학명, URL) 중복     → PK 충돌. 같은 배치 안에서 미리 접는다.
 */
export function toRows(dataRows, map, source = SOURCE) {
  const rows = [], skipped = [];
  const seen = new Set();

  for (const [i, r] of (dataRows || []).entries()) {
    const at = i + 2;                               // 헤더 1줄 + 1-based
    const cell = col => String(r[map[col]] ?? "").trim();

    const image_url = cell("image_url");
    if (!image_url) { skipped.push({ at, reason: "URL 없음" }); continue; }

    const scientific_name = normalizeScientificName(r[map.scientific_name]);
    if (!scientific_name) { skipped.push({ at, reason: "학명 없음", image_url }); continue; }

    const key = `${scientific_name}\u0000${image_url}`;
    if (seen.has(key)) { skipped.push({ at, reason: "중복", scientific_name }); continue; }
    seen.add(key);

    rows.push({
      scientific_name,
      korean_name: cell("korean_name"),
      image_type:  cell("image_type"),
      image_url,                                    // 원본 그대로
      source
    });
  }
  return { rows, skipped };
}

/** CSV 원문 → 적재 준비 완료. 헤더를 못 맞추면 `rows` 없이 `missing` 을 돌려준다. */
export function prepare(text, override = {}) {
  const parsed = parseCsv(text);
  if (!parsed.length) return { rows: [], skipped: [], missing: COLUMNS, headers: [], total: 0 };

  const [header, ...dataRows] = parsed;
  const { map, missing, headers } = resolveHeaders(header, override);
  if (missing.length) return { rows: [], skipped: [], missing, headers, total: dataRows.length };

  const { rows, skipped } = toRows(dataRows, map);
  return { rows, skipped, missing: [], headers, total: dataRows.length };
}

// ------------------------------------------------------------
// 출력
// ------------------------------------------------------------

const lit = v => `'${String(v).replace(/'/g, "''")}'`;

/**
 * upsert SQL. created_at 은 갱신하지 않는다 — 처음 적재 시점이 사실이다.
 * 배치로 끊는 이유는 SQL Editor 가 한 문장의 길이에 한계가 있기 때문이다.
 */
export function toSql(rows, batchSize = 500) {
  const out = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    const values = rows.slice(i, i + batchSize).map(r =>
      `  (${lit(r.scientific_name)}, ${lit(r.korean_name)}, ${lit(r.image_type)}, ` +
      `${lit(r.image_url)}, ${lit(r.source)})`).join(",\n");
    out.push(
      `insert into public.${TABLE}\n` +
      `  (scientific_name, korean_name, image_type, image_url, source)\n` +
      `values\n${values}\n` +
      `on conflict (scientific_name, image_url) do update\n` +
      `  set korean_name = excluded.korean_name,\n` +
      `      image_type  = excluded.image_type,\n` +
      `      source      = excluded.source;`);
  }
  return out.join("\n\n");
}

// ------------------------------------------------------------
// CLI
// ------------------------------------------------------------

/** PostgREST 로 직접 upsert. SDK 의존성 없이 fetch 만 쓴다. */
async function apply(rows, batchSize = 500) {
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
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify(batch)
    });
    if (!res.ok) {
      // 응답 본문에 키가 섞일 일은 없지만, 길면 잘라서 보여 준다.
      throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
    }
    done += batch.length;
    console.log(`  적재 ${done}/${rows.length}`);
  }
  return done;
}

async function main(argv) {
  const args = argv.slice(2);
  const file = args.find(a => !a.startsWith("--"));
  const flags = Object.fromEntries(args.filter(a => a.startsWith("--")).map(a => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }));

  if (!file) {
    console.error("사용법: node species-catalog/tests/import-plant-images.mjs <csv> " +
                  "[--sql[=out.sql]] [--apply] [--map=헤더:컬럼,…]");
    process.exit(2);
  }

  const override = Object.fromEntries(
    String(flags.map || "").split(",").filter(Boolean)
      .map(p => { const [h, c] = p.split(":"); return [h, c]; }));

  const text = fs.readFileSync(path.resolve(file), "utf8");
  const { rows, skipped, missing, headers, total } = prepare(text, override);

  console.log(`파일    : ${file}`);
  console.log(`헤더    : ${headers.join(" | ")}`);

  if (missing.length) {
    console.error(`\n✗ 컬럼을 찾지 못했습니다: ${missing.join(", ")}`);
    console.error("  위 헤더 중 어느 것이 그 컬럼인지 --map 으로 알려 주거나,");
    console.error("  COLUMN_ALIASES 를 실제 이름으로 고치세요. 추측으로 채우지 않습니다.");
    process.exit(1);
  }

  console.log(`데이터  : ${total}행`);
  console.log(`적재    : ${rows.length}행`);
  console.log(`건너뜀  : ${skipped.length}행` +
    (skipped.length ? ` (${[...new Set(skipped.map(s => s.reason))].join(" · ")})` : ""));
  console.log(`학명    : ${new Set(rows.map(r => r.scientific_name)).size}종`);
  if (rows.length) console.log(`예시    : ${JSON.stringify(rows[0])}`);

  if (flags.sql) {
    const out = typeof flags.sql === "string" ? flags.sql : "plant_images_upsert.sql";
    fs.writeFileSync(out, toSql(rows) + "\n", "utf8");
    console.log(`\nSQL 생성: ${out}`);
  }
  if (flags.apply) {
    console.log("");
    console.log(`적재 완료: ${await apply(rows)}행`);
  } else if (!flags.sql) {
    console.log("\n(점검만 했습니다 — 실제 적재는 --apply, SQL 파일은 --sql)");
  }
}

// import 될 때는 CLI 가 돌지 않는다 — 테스트가 위 함수들을 그대로 쓴다.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv).catch(err => { console.error(`✗ ${err.message}`); process.exit(1); });
}
