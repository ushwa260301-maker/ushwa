#!/usr/bin/env node
/**
 * 이미지 CSV ↔ `species` 대조 — **읽기 전용 검증** (T11-6.1).
 *
 *   node species-catalog/tests/verify-plant-images.mjs <csv> --species=export.json
 *   node species-catalog/tests/verify-plant-images.mjs <csv> --live
 *   … --json=report.json      기계가 읽을 형태로도 저장
 *
 * ## 쓰기를 하지 않는다
 *
 * DB 로 나가는 요청은 `GET` 하나뿐이다(`fetchSpecies`). INSERT·UPDATE·DELETE
 * 경로가 이 파일에 없다 — 적재는 `import-plant-images.mjs` 가 따로 한다.
 * 두 일을 한 파일에 두면 "검증만 돌린다"는 말이 보증되지 않는다.
 *
 * ## 무엇을 대조하는가
 *
 * `species` 에 `scientific_name` 컬럼은 **없다.** 학명은 `latin` 컬럼이다
 * (`supabase/schema.sql`). 그래서 대조 키는 `csv.scientific_name ↔ species.latin`
 * 이고, 없는 컬럼을 가정하지 않는다.
 *
 * ## 표기 차이는 단계로 좁힌다
 *
 * 완전 일치에서 시작해 한 겹씩 느슨하게 풀면서, **어느 겹에서 처음 맞았는지**
 * 를 그 항목의 차이로 본다. 그래야 "왜 안 맞았는가" 에 답할 수 있다.
 * 마지막 겹까지 풀어도 안 맞으면 문자열로 설명되지 않는 것 —
 * 동의어·학명 변경 후보로 따로 센다.
 *
 * ⚠ 이 단계의 느슨한 일치는 **보고용**이다. 실제 사진 연결은 언제나 완전
 *   일치다(plantImageProvider). 여기서 맞았다고 사진이 붙지 않는다.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parseCsv, prepare, normalizeScientificName } from "./import-plant-images.mjs";

const MAX_LIST = 30;

// ------------------------------------------------------------
// 표기 정규화 사다리 — 위에서 아래로 한 겹씩 더 푼다
// ------------------------------------------------------------

const QUOTES = /['‘’ʼ`´"“”]/g;

/** 따옴표 문자 통일. `'Mount Fuji'` 와 `’Mount Fuji’` 는 같은 품종명이다. */
const unifyQuotes = s => s.replace(QUOTES, "'");

/** 교배종 기호. 홀로 선 `x`·`X` 만 `×` 로 본다 — 종소명의 x 를 건드리지 않는다. */
const unifyHybrid = s => s.replace(/(^|\s)[xX×✕](\s)/g, "$1×$2");

/** `'…'` 안은 품종명이다. 떼고 비교하면 품종↔원종 차이를 잡아낸다. */
const stripCultivar = s => normalizeScientificName(s.replace(/'[^']*'/g, " "));

/** 앞 두 토큰만 = 속명 + 종소명. 뒤에 붙은 명명자를 떨어뜨린다. */
const binomial = s => normalizeScientificName(s).split(" ").slice(0, 2).join(" ");

/**
 * 누적 사다리. 각 단계는 **이전 단계 위에** 한 겹을 더 푼다.
 * `label` 이 곧 "무엇이 달랐는가" 의 답이다.
 */
/**
 * 0번은 `normalizeScientificName` 이다 — Provider 가 실제로 쓰는 비교와 **같다.**
 * 그래서 "완전 일치" 로 센 것은 곧 실제로 사진이 붙을 것들이다. 공백 차이는
 * 여기서 이미 흡수되므로 별도 겹을 두지 않고, [3] 에서 몇 건이 공백 정리
 * 덕에 맞았는지만 따로 센다.
 */
export const LADDER = [
  { label: "완전 일치",    fn: s => normalizeScientificName(s) },
  { label: "대소문자",     fn: s => normalizeScientificName(s).toLowerCase() },
  { label: "따옴표",       fn: s => unifyQuotes(normalizeScientificName(s)).toLowerCase() },
  { label: "교배종 기호",   fn: s => unifyHybrid(unifyQuotes(normalizeScientificName(s))).toLowerCase() },
  { label: "품종명",       fn: s => stripCultivar(unifyHybrid(unifyQuotes(normalizeScientificName(s)))).toLowerCase() },
  { label: "저자명",       fn: s => binomial(stripCultivar(unifyHybrid(unifyQuotes(normalizeScientificName(s))))).toLowerCase() }
];

/** 원문이 정규화로 실제로 바뀌는지 — 안 바뀌면 그 겹은 차이의 원인이 아니다. */
function describeDiff(csvName, spName, level) {
  const reasons = [];
  const c = String(csvName), s = String(spName);
  if (normalizeScientificName(c) !== c || normalizeScientificName(s) !== s) reasons.push("공백");
  if (normalizeScientificName(c).toLowerCase() === normalizeScientificName(s).toLowerCase()
      && normalizeScientificName(c) !== normalizeScientificName(s)) reasons.push("대소문자");
  if (QUOTES.test(c) || QUOTES.test(s)) { QUOTES.lastIndex = 0; reasons.push("따옴표"); }
  const cCv = /'[^']*'/.test(c), sCv = /'[^']*'/.test(s);
  if (cCv !== sCv) reasons.push("품종명");
  /**
   * 품종명이 한쪽에만 있으면 토큰 수는 그것 때문에 달라진다 — 그걸 저자명
   * 차이로도 세면 없는 원인을 하나 더 보고하게 된다. 품종명을 떼고도 남는
   * 토큰 차이만 저자명으로 본다.
   */
  const cBare = stripCultivar(c), sBare = stripCultivar(s);
  if (binomial(cBare).toLowerCase() === binomial(sBare).toLowerCase()
      && cBare.split(" ").length !== sBare.split(" ").length) {
    reasons.push("저자명");
  }
  if (/[×✕]|(^|\s)[xX](\s)/.test(c) !== /[×✕]|(^|\s)[xX](\s)/.test(s)) reasons.push("교배종 기호");
  // 사다리가 말해 준 겹은 언제나 포함한다 — 위 휴리스틱이 놓쳐도.
  if (!reasons.includes(LADDER[level].label)) reasons.push(LADDER[level].label);
  return [...new Set(reasons)].join(" · ");
}

// ------------------------------------------------------------
// species 읽기 — GET 뿐
// ------------------------------------------------------------

/** 파일에서. 앱 내보내기(`{species:[…]}`) · 배열 · CSV 를 받는다. */
export function speciesFromFile(file) {
  const text = fs.readFileSync(file, "utf8");
  if (path.extname(file).toLowerCase() === ".csv") {
    const rows = parseCsv(text);
    const head = rows[0].map(h => h.trim().toLowerCase());
    const iLatin = head.findIndex(h => ["latin", "scientific_name", "학명"].includes(h));
    const iName  = head.findIndex(h => ["name", "korean_name", "국명"].includes(h));
    const iId    = head.indexOf("id");
    if (iLatin < 0) throw new Error(`학명 컬럼을 찾지 못했습니다: ${rows[0].join(" | ")}`);
    return rows.slice(1).map(r => ({
      id: iId >= 0 ? r[iId] : "", name: iName >= 0 ? r[iName] : "", latin: r[iLatin]
    }));
  }
  const parsed = JSON.parse(text);
  const list = Array.isArray(parsed) ? parsed
             : Array.isArray(parsed?.species) ? parsed.species
             : Array.isArray(parsed?.data?.species) ? parsed.data.species : null;
  if (!list) throw new Error("species 배열을 찾지 못했습니다 (배열 · {species:[…]} · {data:{species:[…]}})");
  return list.map(s => ({
    id: s.id ?? "", name: s.name ?? "", latin: s.latin ?? s.scientific_name ?? ""
  }));
}

/** PostgREST 에서. **GET 만** 보낸다. */
export async function fetchSpecies(base, key, pageSize = 1000) {
  const url = String(base).replace(/\/+$/, "");
  const out = [];
  for (let offset = 0; ; offset += pageSize) {
    const res = await fetch(
      `${url}/rest/v1/species?select=id,name,latin&order=id&limit=${pageSize}&offset=${offset}`,
      { method: "GET", headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
    const batch = await res.json();
    out.push(...batch);
    if (batch.length < pageSize) break;
  }
  return out;
}

// ------------------------------------------------------------
// 대조
// ------------------------------------------------------------

const pct = (a, b) => b ? `${(a / b * 100).toFixed(1)}%` : "0.0%";

export function compare(csvRows, speciesRows) {
  // --- CSV 쪽 집계 ---------------------------------------------------
  const byName = new Map();                       // 학명 → 행들
  for (const r of csvRows) {
    if (!byName.has(r.scientific_name)) byName.set(r.scientific_name, []);
    byName.get(r.scientific_name).push(r);
  }

  const pkSeen = new Set(), pkDup = [];
  for (const r of csvRows) {
    const k = `${r.scientific_name}\u0000${r.image_url}`;
    if (pkSeen.has(k)) pkDup.push(r); else pkSeen.add(k);
  }

  const multi = [...byName.entries()].filter(([, v]) => v.length > 1)
    .map(([name, v]) => ({ name, count: v.length }))
    .sort((a, b) => b.count - a.count);

  const typeCount = {};
  for (const r of csvRows) typeCount[r.image_type || "(빈값)"] = (typeCount[r.image_type || "(빈값)"] || 0) + 1;

  // --- species 쪽 ----------------------------------------------------
  const spNamed = speciesRows.filter(s => normalizeScientificName(s.latin));
  const spNoLatin = speciesRows.length - spNamed.length;

  // 사다리 단계별 색인
  const spIndex = LADDER.map(({ fn }) => {
    const m = new Map();
    for (const s of spNamed) {
      const k = fn(s.latin);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(s);
    }
    return m;
  });

  // 원문 그대로의 색인 — 공백 정리가 실제로 기여한 몫을 세기 위한 것.
  const rawIndex = new Set(spNamed.map(s => String(s.latin)));

  const csvNames = [...byName.keys()];
  const exact = [], nearMiss = [], onlyCsv = [];
  const matchedSpecies = new Set();
  let whitespaceHelped = 0;

  for (const name of csvNames) {
    const hitExact = spIndex[0].get(LADDER[0].fn(name));
    if (hitExact?.length) {
      if (!rawIndex.has(name)) whitespaceHelped++;
      exact.push({ name, species: hitExact.map(s => s.id) });
      hitExact.forEach(s => matchedSpecies.add(s.id));
      continue;
    }
    let found = null;
    for (let i = 1; i < LADDER.length; i++) {
      const hit = spIndex[i].get(LADDER[i].fn(name));
      if (hit?.length) { found = { level: i, hit }; break; }
    }
    if (found) {
      nearMiss.push({
        csv: name,
        species: found.hit[0].latin,
        speciesId: found.hit[0].id,
        speciesName: found.hit[0].name,
        others: found.hit.length - 1,
        diff: describeDiff(name, found.hit[0].latin, found.level)
      });
      found.hit.forEach(s => matchedSpecies.add(s.id));
    } else {
      onlyCsv.push(name);
    }
  }

  const onlySpecies = spNamed.filter(s => !matchedSpecies.has(s.id));

  // --- URL ------------------------------------------------------------
  const url = { empty: [], http: 0, https: 0, other: [], offsite: [] };
  for (const r of csvRows) {
    const u = r.image_url;
    if (!u) { url.empty.push(r.scientific_name); continue; }
    if (/^https:\/\//i.test(u)) url.https++;
    else if (/^http:\/\//i.test(u)) url.http++;
    else { url.other.push(u); continue; }
    let host = "";
    try { host = new URL(u).hostname; } catch { url.other.push(u); continue; }
    if (!/(^|\.)nature\.go\.kr$/i.test(host)) url.offsite.push(host);
  }
  const offsiteHosts = {};
  for (const h of url.offsite) offsiteHosts[h] = (offsiteHosts[h] || 0) + 1;

  return {
    csv: { rows: csvRows.length, names: csvNames.length, pkDup, multi, typeCount },
    species: { rows: speciesRows.length, named: spNamed.length, noLatin: spNoLatin },
    exact, nearMiss, onlyCsv, onlySpecies, whitespaceHelped,
    url: { ...url, offsiteHosts }
  };
}

// ------------------------------------------------------------
// 보고
// ------------------------------------------------------------

function report(r, skipped) {
  const L = (list, f = x => x) =>
    list.slice(0, MAX_LIST).map(x => `    · ${f(x)}`).join("\n") +
    (list.length > MAX_LIST ? `\n    … 외 ${list.length - MAX_LIST}건` : "");

  console.log(`\n[1] CSV 총 행 수`);
  console.log(`  데이터 행     : ${r.csv.rows + skipped.length}`);
  console.log(`  유효 행       : ${r.csv.rows}`);
  console.log(`  제외 행       : ${skipped.length}` +
    (skipped.length ? ` (${[...new Set(skipped.map(s => s.reason))].join(" · ")})` : ""));
  console.log(`  고유 학명     : ${r.csv.names}`);

  const pkDup = skipped.filter(s => s.reason === "중복");
  console.log(`\n[2] CSV scientific_name 중복`);
  console.log(`  ※ 한 식물에 사진이 여러 장인 것은 정상이다. 문제는 (학명, URL) 중복이다.`);
  console.log(`  학명 중복(사진 여러 장) : ${r.csv.multi.length}종`);
  console.log(`  (학명, URL) 중복        : ${pkDup.length}행` +
    (pkDup.length ? " ← 적재 전에 접힌다 (upsert 대상 아님)" : " — 중복 없음"));
  if (pkDup.length) console.log(L(pkDup, x => `${x.at}행 · ${x.scientific_name}`));

  const denom = r.csv.names;
  console.log(`\n[3] 정확 매칭`);
  console.log(`  CSV 고유 학명 : ${denom}`);
  console.log(`  species 매칭  : ${r.exact.length}`);
  console.log(`  매칭률        : ${pct(r.exact.length, denom)}`);
  console.log(`  ↳ 공백 정리 덕 : ${r.whitespaceHelped}종 (원문 그대로였다면 안 맞았을 것)`);
  console.log(`  (느슨히 풀면  : ${r.exact.length + r.nearMiss.length} · ${pct(r.exact.length + r.nearMiss.length, denom)})`);

  console.log(`\n[4] CSV에만 존재하는 식물`);
  console.log(`  총 ${r.onlyCsv.length}종  — 모든 표기 차이를 풀어도 안 맞음`);
  console.log(`  ※ 동의어·학명 변경 가능성은 문자열로 판정할 수 없다. 이 목록이 그 후보다.`);
  if (r.onlyCsv.length) console.log(L(r.onlyCsv));

  console.log(`\n[5] species에만 존재하는 식물`);
  console.log(`  총 ${r.onlySpecies.length}종 (latin 비어 있는 ${r.species.noLatin}종은 제외)`);
  if (r.onlySpecies.length) console.log(L(r.onlySpecies, s => `${s.id} · ${s.name} · ${s.latin}`));

  console.log(`\n[6] 학명 표기 차이 후보  (${r.nearMiss.length}건)`);
  console.log(`  ※ 보고용이다. 실제 사진 연결은 언제나 완전 일치다.`);
  for (const m of r.nearMiss.slice(0, MAX_LIST)) {
    console.log(`  CSV     : ${m.csv}`);
    console.log(`  species : ${m.species}   (${m.speciesId} · ${m.speciesName})` +
      (m.others ? `  외 ${m.others}건` : ""));
    console.log(`  차이    : ${m.diff}\n`);
  }
  if (r.nearMiss.length > MAX_LIST) console.log(`  … 외 ${r.nearMiss.length - MAX_LIST}건`);

  console.log(`\n[7] 이미지 중복 (같은 학명에 여러 URL)`);
  console.log(`  해당 종 : ${r.csv.multi.length}`);
  if (r.csv.multi.length) console.log(L(r.csv.multi, x => `${x.name} — ${x.count}장`));

  console.log(`\n[8] image_type 분포`);
  for (const [k, v] of Object.entries(r.csv.typeCount).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(k).padEnd(16)} ${v}`);
  }

  console.log(`\n[9] URL 이상 데이터`);
  console.log(`  빈 URL        : ${r.url.empty.length}`);
  console.log(`  http://       : ${r.url.http}`);
  console.log(`  https://      : ${r.url.https}`);
  console.log(`  형식 이상     : ${r.url.other.length}`);
  if (r.url.other.length) console.log(L(r.url.other));
  const hosts = Object.entries(r.url.offsiteHosts).sort((a, b) => b[1] - a[1]);
  console.log(`  nature.go.kr 외 호스트 : ${hosts.length}종류`);
  if (hosts.length) console.log(L(hosts, ([h, n]) => `${h} — ${n}건`));

  console.log(`\n현재 단계에서는 DB INSERT/UPDATE/DELETE를 수행하지 않았습니다.`);
}

// ------------------------------------------------------------
// CLI
// ------------------------------------------------------------

async function main(argv) {
  const args = argv.slice(2);
  const file = args.find(a => !a.startsWith("--"));
  const flags = Object.fromEntries(args.filter(a => a.startsWith("--")).map(a => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }));

  if (!file) {
    console.error("사용법: node species-catalog/tests/verify-plant-images.mjs <csv> " +
                  "(--species=<export.json|csv> | --live) [--json=report.json]");
    process.exit(2);
  }

  const { rows, skipped, missing, headers } = prepare(fs.readFileSync(path.resolve(file), "utf8"));
  console.log(`CSV     : ${file}`);
  console.log(`헤더    : ${headers.join(" | ")}`);
  if (missing.length) {
    console.error(`\n✗ 컬럼을 찾지 못했습니다: ${missing.join(", ")}`);
    process.exit(1);
  }

  let speciesRows = [];
  if (flags.live) {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL · SUPABASE_SERVICE_KEY 환경변수가 필요합니다");
    speciesRows = await fetchSpecies(url, key);
    console.log(`species : ${speciesRows.length}행 (GET /rest/v1/species)`);
  } else if (typeof flags.species === "string") {
    speciesRows = speciesFromFile(path.resolve(flags.species));
    console.log(`species : ${speciesRows.length}행 (${flags.species})`);
  } else {
    console.error("\n✗ species 원본이 필요합니다 — --species=<파일> 또는 --live");
    process.exit(2);
  }

  const result = compare(rows, speciesRows);
  report(result, skipped);

  if (flags.json) {
    const out = typeof flags.json === "string" ? flags.json : "plant-images-verify.json";
    fs.writeFileSync(out, JSON.stringify({ ...result, skipped }, null, 2), "utf8");
    console.log(`\nJSON: ${out}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv).catch(err => { console.error(`✗ ${err.message}`); process.exit(1); });
}
