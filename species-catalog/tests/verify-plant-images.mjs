#!/usr/bin/env node
/**
 * 이미지 CSV ↔ `species` 대조 — **읽기 전용 검증** (T11-6.1).
 *
 *   node species-catalog/tests/verify-plant-images.mjs <csv> --species=export.json
 *   node species-catalog/tests/verify-plant-images.mjs <csv> --live
 *   … --json=report.json      Admin 검토 화면용 계약 문서로 저장
 *   … --dataset-version=2026-09-21   CSV 판을 직접 지정 (기본: 파일 수정일)
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
 *
 * ## TODO(T11-6.3 전): 적재 전에 돌릴 읽기 전용 검사
 *
 * 아래는 **전부 읽기만** 한다 — CSV 와 이미 적재된 행을 보는 것이고, DB 에
 * 쓰지 않는다. 적재한 뒤에 발견하면 4,763행을 되돌려야 하므로 앞에서 센다.
 *
 *   1. HTTP URL 샘플 검사
 *      실측에서 4,763개가 전부 `http://` 였다. 사이트는 https 라 브라우저가
 *      혼합 콘텐츠로 처리한다. 표본 N개(예: 각 속에서 1개, 50개 내외)에
 *      HEAD 요청을 보내 ① 살아 있는지 ② https 로도 열리는지 확인한다.
 *      ※ 저장값은 바꾸지 않는다. 승격은 표시 단계에서 정할 일이고, 이 검사는
 *        그 결정의 근거를 모으기 위한 것이다.
 *      ※ 전량 4,763회를 때리지 않는다 — 공공 서버에 부하를 주는 행위다.
 *
 *   2. 이미지 확장자 검사
 *      URL 끝의 확장자 분포를 센다(.JPG/.jpg/.png/…). 확장자가 없거나
 *      이미지가 아닌 것(.html·.pdf·쿼리스트링뿐)이 섞여 있으면 그 행은
 *      사진이 아니다. 대소문자 차이도 함께 센다 — 같은 파일을 다르게
 *      가리키는 URL 이 있을 수 있다.
 *
 *   3. 국명 빈 값 검사
 *      `korean_name` 은 NOT NULL 이지만 빈 문자열은 통과한다. 캡션으로 쓰는
 *      값이라 비면 화면에 빈 자리가 남는다. 몇 건인지, 그 학명이 우리 77종과
 *      겹치는지 센다.
 *
 *   4. Unicode 공백 검사
 *      NBSP(U+00A0) · 전각 공백(U+3000) · 제로폭(U+200B) 은 `\s` 정규화로
 *      걸러지지 않는다. 학명에 하나라도 섞이면 canonical 이 달라져 **조회가
 *      조용히 0건**이 된다 — 에러 없이 사진만 사라지는 종류다.
 *      `scientific_name` 과 `korean_name` 양쪽에서 코드포인트로 센다.
 *
 *   5. 이미지 중복(Hash) 검사
 *      URL 이 다른데 같은 이미지인 경우를 찾는다. `(학명, URL)` 은 이미 중복
 *      0건이지만, 같은 사진이 다른 경로로 두 번 실리면 갤러리에 같은 그림이
 *      두 장 뜬다. 표본으로 내려받아 바이트 해시를 비교한다.
 *      ※ 전량 다운로드는 하지 않는다 — 여러 장을 가진 198종 안에서만 본다.
 *
 * 각 검사는 숫자만 보고하고 **어떤 행도 고치지 않는다.** 고칠지 말지는 숫자를
 * 보고 사람이 정한다.
 *
 * ## T11-6.3 완료 조건 (적재 후 반드시 통과)
 *
 *   A. CSV SHA256 재계산
 *      적재에 쓴 파일의 해시가 `report.json` 의 `dataset.hash.value` 와 같아야
 *      한다. 다르면 **검증한 파일과 적재한 파일이 다르다** — 이 경우 143건의
 *      분류도, 아래 숫자도 전부 근거를 잃는다. 적재를 중단하고 다시 검증한다.
 *
 *          node …/verify-plant-images.mjs <csv> --species=… --json=…
 *          (판·해시 줄이 report.json 과 같은지 눈으로 확인)
 *
 *   B. select count(*) from plant_images                  = 4763
 *   C. select count(distinct scientific_name) …           = 4565
 *   D. select count(distinct image_url) …                 = ?
 *
 *      ⚠ D 의 기댓값은 **4763 이 아닐 수 있다.** `(학명, URL)` 중복이 0인 것과
 *        URL 이 전체에서 유일한 것은 다른 사실이고, 서로 다른 두 학명이 같은
 *        사진을 가리킬 수 있다(원종과 품종이 같은 사진을 쓰는 경우). 기댓값은
 *        위 `[9] 고유 URL` 이 알려 준다 — 그 숫자를 쓴다. 4763 을 넣어 두고
 *        실패하면 정상 적재를 사고로 오인한다.
 *
 *   B·C·D 의 기댓값은 전부 적재 **전에** 이 검증기가 먼저 말한다. 적재 후
 *   숫자가 그것과 다르면, 차이만큼이 적재 과정에서 생긴 손실이다.
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import { parseCsv, prepare } from "./import-plant-images.mjs";
import {
  normalizeScientificName, canonicalScientificName, classifyDifference,
  describeDifference, MATCH_CLASS, AUTO_LINKABLE
} from "../services/scientificName.js";

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
 *
 * 이것은 **후보를 찾는 도구**일 뿐이다. 찾은 뒤 "자동 연결해도 되는가" 는
 * `classifyDifference` 가 분류군 기준으로 따로 정한다 — 근거가 다르기 때문이다.
 * 사다리가 느슨히 맞췄다고 사진이 붙지 않는다.
 *
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

/** 등급별 건수. compare() 가 센 값을 그대로 읽는다. */
const byClassCount = (r, cls) => r.byClass?.[cls] ?? 0;

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
      /**
       * 등급은 사다리가 아니라 `classifyDifference` 가 정한다. 사다리는 후보를
       * 찾는 도구고, "자동 연결해도 되는가" 는 분류군 판단이라 근거가 다르다.
       */
      const cls = classifyDifference(name, found.hit[0].latin);
      const photos = byName.get(name) || [];
      nearMiss.push({
        csv: name,
        csvCanonical: canonicalScientificName(name),
        csvKoreanName: photos[0]?.korean_name || "",
        csvPhotoCount: photos.length,
        species: found.hit[0].latin,
        speciesCanonical: canonicalScientificName(found.hit[0].latin),
        speciesId: found.hit[0].id,
        speciesName: found.hit[0].name,
        // 같은 겹에서 함께 걸린 다른 수종 — 하나로 정할 수 없으면 사람이 본다.
        alternatives: found.hit.slice(1).map(s => ({ id: s.id, name: s.name, latin: s.latin })),
        others: found.hit.length - 1,
        matchClass: cls,
        autoLinkable: AUTO_LINKABLE.has(cls),
        diff: describeDifference(name, found.hit[0].latin)
      });
      found.hit.forEach(s => matchedSpecies.add(s.id));
    } else {
      onlyCsv.push(name);
    }
  }

  /**
   * 사다리로도 후보를 못 찾은 것들은 CSV 전용이다. 그중 종 수준까지 같은 것이
   * 있는지는 이미 사다리가 봤으므로, 남은 것은 문자열로 설명되지 않는다 —
   * 동의어·학명 변경 후보다.
   */
  const byClass = {
    [MATCH_CLASS.EXACT]:            exact.length,
    [MATCH_CLASS.AUTHOR_ONLY]:      0,
    [MATCH_CLASS.CULTIVAR]:         0,
    [MATCH_CLASS.POSSIBLE_SYNONYM]: 0
  };
  for (const m of nearMiss) byClass[m.matchClass]++;

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

  /**
   * URL 이 **전체에서** 유일한가. `(학명, URL)` 중복이 0이어도, 서로 다른 두
   * 학명이 같은 사진을 가리킬 수 있다. 적재 후 `count(distinct image_url)` 을
   * 검증 기준으로 삼으려면 그 기댓값을 **미리** 알아야 한다 — 모르고 걸면
   * 정상 적재가 실패로 보고된다.
   */
  const urlOwners = new Map();
  for (const r of csvRows) {
    if (!r.image_url) continue;
    let a = urlOwners.get(r.image_url);
    if (!a) urlOwners.set(r.image_url, a = new Set());
    a.add(r.scientific_name);
  }
  const shared = [...urlOwners.entries()].filter(([, v]) => v.size > 1)
    .map(([u, v]) => ({ url: u, names: [...v] }));

  return {
    csv: { rows: csvRows.length, names: csvNames.length, pkDup, multi, typeCount },
    species: { rows: speciesRows.length, named: spNamed.length, noLatin: spNoLatin },
    exact, nearMiss, onlyCsv, onlySpecies, whitespaceHelped, byClass,
    url: { ...url, offsiteHosts, distinct: urlOwners.size, shared }
  };
}

// ------------------------------------------------------------
// Admin 검토용 보고서
// ------------------------------------------------------------

/**
 * ## 이 보고서는 Admin 검토 화면과의 계약이다
 *
 * `schema` 가 그 계약의 판을 말한다. 화면이 먼저 배포되고 리포트가 나중에
 * 갱신되는(또는 그 반대의) 일이 생기므로, 어느 쪽이 바뀌어도 상대가 조용히
 * 깨지지 않도록 규칙을 둔다.
 *
 *     { "name": "plant-image-review", "major": 3, "minor": 0 }
 *
 * 문자열 대신 쪼개 두는 이유는 **화면이 비교를 문자열 파싱 없이** 하게
 * 하기 위해서다. `"…/3"` 을 쪼개다 보면 언젠가 `"…/3.1"` 에서 틀린다.
 *
 * ### major 를 올린다 — 화면이 고쳐지기 전에는 읽으면 안 되는 변경
 *   · 필드를 지우거나 이름을 바꾼다
 *   · 필드의 뜻이나 타입이 바뀐다 (문자열 → 객체 등)
 *   · 기존 값의 해석이 달라진다 — enum 값 제거, 정렬 기준 변경, 단위 변경
 *   ※ major 를 올리면 minor 는 0 으로 되돌린다.
 *
 * ### minor 를 올린다 — 낡은 화면이 그대로 읽어도 되는 변경
 *   · 새 필드를 **추가만** 한다 — 화면은 모르는 필드를 무시한다
 *   · enum 에 값을 **추가만** 한다 — 단, 화면이 모르는 값을 만났을 때
 *     어떻게 할지가 정해져 있어야 한다(`decision` 은 모르는 값을 거부한다)
 *
 * ### 아무것도 올리지 않는다
 *   · 주석·설명 문구 · 동률일 때의 정렬 · 내부 구현
 *
 * ### 화면 쪽 의무
 *   `schema.name` 과 `schema.major` 를 **먼저** 확인하고, 모르는 major 면
 *   읽지 않고 거부한다. `minor` 가 자기보다 높은 것은 읽어도 된다 —
 *   추가된 필드를 모를 뿐이다. 반쯤 해석하는 것이 가장 위험하다 — 틀린
 *   결정이 저장되고, 그 결정은 사진이 잘못 붙은 채로 남는다.
 *
 * ### 이력
 *   1.0  최초 (T11-6.2)
 *   2.0  dataset 블록 추가 · generatedAt 을 dataset 안으로 옮김 ·
 *        decision 값을 4개로 고정
 *   3.0  schema 를 객체로 · dataset.csvHash 를 {algorithm, value} 객체로 ·
 *        review[].reviewReason 추가
 *   4.0  review[].id 표기를 `<speciesId>::<CSV 학명>` 으로 · stats 추가
 *        (id 형식 변경은 예전 id 로 저장된 결정을 찾지 못하게 하므로 major)
 *   4.1  url.sharedCount 추가 — T11-6.3 완료 조건 D 가 참조한다.
 *        필드 추가만이라 minor (낡은 화면은 모르는 필드를 무시한다)
 */
export const SCHEMA = { name: "plant-image-review", major: 4, minor: 1 };

/** 사람이 읽는 표기. 비교에는 쓰지 않는다 — 비교는 name/major 로 한다. */
export function schemaLabel(s = SCHEMA) {
  return `${s.name}/${s.major}.${s.minor}`;
}

/** 해시 알고리즘. 바꾸려면 major 를 올린다 — 예전 해시와 비교가 불가능해진다. */
export const HASH_ALGORITHM = "sha256";

/**
 * 검토 결정. **이 넷뿐이다.**
 *
 *   null       아직 보지 않았다 (초기값)
 *   APPROVED   연결한다
 *   REJECTED   연결하지 않는다 — 다른 분류군이다
 *   SKIPPED    지금 정하지 않는다 — 근거가 더 필요하다
 *
 * REJECTED 와 SKIPPED 를 가르는 이유: 둘 다 "지금 연결 안 함" 이지만,
 * REJECTED 는 **결론**이고 SKIPPED 는 **보류**다. 합쳐 두면 다음 검토 때
 * 무엇을 다시 봐야 하는지 알 수 없다.
 */
export const DECISIONS = [null, "APPROVED", "REJECTED", "SKIPPED"];

/** 모르는 값은 받지 않는다 — 오타 하나가 조용히 "미검토"로 남는 것을 막는다. */
export function isValidDecision(v) {
  return DECISIONS.includes(v === undefined ? null : v);
}

/**
 * 검토 대기 목록의 정렬 순서 — **사람 손이 필요한 것이 위로 온다.**
 * AUTHOR_ONLY 는 자동 연결 대상이라 확인만 하면 되고, CULTIVAR 는 결정을
 * 내려야 하며, POSSIBLE_SYNONYM 은 출처 조회까지 필요하다.
 */
const REVIEW_ORDER = [
  MATCH_CLASS.CULTIVAR, MATCH_CLASS.POSSIBLE_SYNONYM,
  MATCH_CLASS.AUTHOR_ONLY, MATCH_CLASS.EXACT
];

/** id 안에서 두 부분을 가르는 표기. 학명에는 콜론이 없어 충돌하지 않는다. */
export const ID_SEPARATOR = "::";

/**
 * 결정 키 — Admin 이 판단을 이 값에 매단다.
 *
 * 형태: `<speciesId>::<CSV 학명>`  예) `sp-001::Stipa tenuissima Trin.`
 *
 * ## 무엇이 들어가고 무엇이 안 들어가는가
 *
 * `matchClass` 를 키에 넣지 않는다. 분류 규칙을 고치면 등급이 바뀌는데,
 * 등급이 키에 있으면 **같은 항목이 다른 키가 되어** 이전에 저장한 결정을
 * 찾지 못한다. 사람이 내린 판단이 규칙 변경 때문에 사라지면 안 된다.
 *
 * ## 표기
 *
 * ASCII 만 쓴다. 화살표(`→`)는 사람이 보기 좋지만 URL 파라미터·JSON Patch·
 * Windows 콘솔을 거치며 깨질 수 있다 — 키는 읽히라고 있는 게 아니라 **같은
 * 것을 같다고 말하라고** 있다.
 *
 * speciesId 를 앞에 두면 정렬했을 때 같은 수종이 모인다.
 */
export function reviewId(speciesId, csvName) {
  return `${speciesId}${ID_SEPARATOR}${normalizeScientificName(csvName)}`;
}

/**
 * 검토 진행률. `decision` 을 세기만 한다 — 화면이 배열을 다시 훑지 않아도 되고,
 * 편집된 보고서를 다시 읽었을 때 같은 함수로 같은 숫자가 나온다.
 *
 * SKIPPED 도 "본 것"으로 센다. 보류는 판단을 미룬 것이지 안 본 것이 아니다.
 */
export function reviewStats(review) {
  const s = { total: review.length, reviewed: 0, approved: 0, rejected: 0, skipped: 0, remaining: 0 };
  for (const r of review) {
    if (r?.decision === "APPROVED") s.approved++;
    else if (r?.decision === "REJECTED") s.rejected++;
    else if (r?.decision === "SKIPPED") s.skipped++;
  }
  s.reviewed = s.approved + s.rejected + s.skipped;
  s.remaining = s.total - s.reviewed;
  return s;
}

/**
 * Admin 검토 화면이 그대로 쓸 수 있는 형태로 만든다.
 *
 * 설계 원칙
 *   · 한 줄 = 한 결정. 화면의 행과 1:1 이라 그룹을 풀어 헤칠 필요가 없다.
 *   · `decision` 은 비워 둔 채로 나간다 — 이 파일은 **판단하지 않는다.**
 *     `autoLinkable` 은 "자동으로 해도 되는가"라는 사실이고, 실제로 무엇을
 *     할지는 사람이 정한다. 둘을 한 필드에 섞으면 되돌릴 수 없다.
 *   · `index` 로 등급별 id 목록을 함께 준다 — 탭 UI 가 바로 쓴다.
 *   · 숫자는 전부 `summary` 에 모은다. 화면이 배열을 세지 않아도 된다.
 */
export function toReviewReport(r, skipped, meta = {}) {
  const review = [...r.nearMiss]
    .sort((a, b) =>
      REVIEW_ORDER.indexOf(a.matchClass) - REVIEW_ORDER.indexOf(b.matchClass) ||
      a.csv.localeCompare(b.csv))
    .map(m => ({
      id:           reviewId(m.speciesId, m.csv),
      matchClass:   m.matchClass,
      autoLinkable: m.autoLinkable,
      // Admin 이 채운다. 값은 DECISIONS 넷뿐 — 이 파일은 판단하지 않으므로 null.
      decision:     null,
      /**
       * 사람이 남기는 메모. **자유 문장**이며 기계가 읽지 않는다.
       *
       * REJECTED·SKIPPED 의 이유가 여기 남아야 다음 검토에서 같은 판단을
       * 처음부터 다시 하지 않는다. `matchClass` 는 "무엇이 다른가"를 말하지만
       * "왜 그렇게 정했는가"는 사람만 안다.
       */
      reviewReason: null,
      diff:         m.diff,
      csv: {
        scientificName: m.csv,
        canonical:      m.csvCanonical,
        koreanName:     m.csvKoreanName,
        photoCount:     m.csvPhotoCount
      },
      species: {
        id:        m.speciesId,
        name:      m.speciesName,
        latin:     m.species,
        canonical: m.speciesCanonical
      },
      alternatives: m.alternatives
    }));

  const index = {};
  for (const cls of REVIEW_ORDER) {
    index[cls] = review.filter(x => x.matchClass === cls).map(x => x.id);
  }

  return {
    schema: SCHEMA,
    /**
     * 어느 데이터로 만든 보고서인가. 검토 결과를 나중에 적재와 대조하려면
     * **같은 CSV 였는지** 를 말할 수 있어야 한다 — 파일명은 바뀌고 날짜는
     * 겹치므로 해시가 유일하게 믿을 수 있는 식별자다.
     */
    dataset: {
      source:      meta.source || "KNA_IMAGE_CSV",
      /**
       * CSV 판. **파일 안에 판 정보가 없어서** 파일 수정일을 쓴다.
       * 출처가 판을 밝히면 그 값으로 바꾼다 — `--dataset-version` 으로 덮어쓸 수 있다.
       */
      version:     meta.csvVersion || "",
      generatedAt: new Date().toISOString(),
      /**
       * 알고리즘을 값과 함께 싣는다. 나중에 sha256 을 바꾸게 되면 예전
       * 보고서의 해시가 무엇으로 계산된 것인지 알 수 없어진다 — 값만 두면
       * 길이로 추측해야 하고, 그건 추측이다.
       */
      hash: {
        algorithm: meta.csvHash ? (meta.hashAlgorithm || HASH_ALGORITHM) : "",
        value:     meta.csvHash || ""
      },
      csvBytes:    meta.csvBytes ?? null
    },
    /** 이 판이 허용하는 결정 값 — 화면이 목록을 따로 들고 있지 않아도 되게. */
    decisionValues: DECISIONS,
    source: {
      csv:          meta.csv || "",
      species:      meta.species || "",
      csvRows:      r.csv.rows + skipped.length,
      csvValidRows: r.csv.rows,
      csvNames:     r.csv.names,
      speciesRows:  r.species.rows,
      speciesNamed: r.species.named
    },
    summary: {
      exact:            r.exact.length,
      authorOnly:       index[MATCH_CLASS.AUTHOR_ONLY].length,
      cultivar:         index[MATCH_CLASS.CULTIVAR].length,
      possibleSynonym:  index[MATCH_CLASS.POSSIBLE_SYNONYM].length,
      reviewTotal:      review.length,
      autoLinkable:     review.filter(x => x.autoLinkable).length,
      csvOnly:          r.onlyCsv.length,
      speciesUnmatched: r.onlySpecies.length,
      skipped:          skipped.length
    },
    /**
     * 진행률. 생성 시점에는 전부 미검토라 `reviewed: 0` 이다 — 화면이 결정을
     * 채운 뒤 `reviewStats()` 로 다시 계산한다. 같은 함수를 쓰므로 화면과
     * 보고서가 다른 숫자를 말할 일이 없다.
     */
    stats: { reviewProgress: reviewStats(review) },
    index,
    review,
    /** scnmSearch 로 정명을 확인할 대상. 속명이 바뀐 동의어는 여기서만 찾을 수 있다. */
    speciesUnmatched: r.onlySpecies.map(s => ({ id: s.id, name: s.name, latin: s.latin })),
    /** 전량은 수천 건이라 표본만. 판단 근거가 아니라 눈으로 훑는 용도다. */
    csvOnlySample: r.onlyCsv.slice(0, 100),
    imageTypes: r.csv.typeCount,
    url: {
      http: r.url.http, https: r.url.https,
      empty: r.url.empty.length, malformed: r.url.other.length,
      // 적재 후 `count(distinct image_url)` 의 기댓값. 여러 학명이 같은 사진을
      // 쓰면 유효 행 수보다 작다 — 그 경우 `shared` 가 어떤 것인지 말한다.
      distinct: r.url.distinct,
      sharedCount: r.url.shared.length,
      shared: r.url.shared,
      offsiteHosts: r.url.offsiteHosts
    },
    skipped
  };
}

// ------------------------------------------------------------
// 콘솔 보고
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

  console.log(`\n[6-1] 표기 차이 재분류  (T11-6.2)`);
  const auto = r.nearMiss.filter(m => m.autoLinkable);
  const cult = r.nearMiss.filter(m => m.matchClass === MATCH_CLASS.CULTIVAR);
  const syn  = r.nearMiss.filter(m => m.matchClass === MATCH_CLASS.POSSIBLE_SYNONYM);
  console.log(`  AUTHOR_ONLY      : ${byClassCount(r, MATCH_CLASS.AUTHOR_ONLY)}` +
              `  — 명명자만 차이. 같은 분류군이므로 자동 연결 가능`);
  console.log(`  CULTIVAR         : ${cult.length}` +
              `  — 같은 종의 다른 하위 분류군. **자동 연결 금지**`);
  console.log(`  POSSIBLE_SYNONYM : ${syn.length}` +
              `  — 종 수준부터 다름. scnmSearch 로 정명 확인 필요`);
  console.log(`  ────────────────────────────`);
  console.log(`  합계             : ${r.nearMiss.length}  (자동 연결 대상 ${auto.length})`);
  /**
   * 속명이 바뀐 동의어(Dendranthema ↔ Chrysanthemum)는 사다리가 찾지 못해
   * [4] 에 섞인다. 4,422종 안에서 그것만 골라낼 문자열 근거가 없다 —
   * 우리가 안 파는 식물과 구분되지 않는다.
   *
   * 그래서 실제로 확인할 대상은 **우리 쪽 미매칭 수종**이다. 건수가 적고,
   * 각각을 scnmSearch 에 넣으면 정명 여부를 출처가 답해 준다.
   */
  console.log(`\n  동의어 확인 대상 (우리 쪽) : ${r.onlySpecies.length}종`);
  console.log(`    ※ 속명이 바뀐 동의어는 CSV 쪽에서 찾을 수 없다. 아래를 scnmSearch 로 조회한다.`);
  if (r.onlySpecies.length) console.log(L(r.onlySpecies, s => `${s.id} · ${s.name} · ${s.latin}`));

  for (const label__ of [MATCH_CLASS.AUTHOR_ONLY, MATCH_CLASS.CULTIVAR, MATCH_CLASS.POSSIBLE_SYNONYM]) {
    const rows__ = r.nearMiss.filter(m => m.matchClass === label__);
    if (!rows__.length) continue;
    console.log(`\n  ── ${label__} (${rows__.length}) ──`);
    for (const m of rows__.slice(0, MAX_LIST)) {
      console.log(`    CSV     : ${m.csv}`);
      console.log(`    species : ${m.species}  (${m.speciesId} · ${m.speciesName})`);
      console.log(`    canonical: ${m.csvCanonical}  ↔  ${m.speciesCanonical}`);
    }
    if (rows__.length > MAX_LIST) console.log(`    … 외 ${rows__.length - MAX_LIST}건`);
  }

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
  console.log(`  고유 URL      : ${r.url.distinct}` +
    (r.url.shared.length
      ? `  ← 학명 ${r.url.shared.length}쌍이 같은 사진을 공유한다`
      : `  (= 유효 행 수. count(distinct image_url) 기댓값)`));
  if (r.url.shared.length) {
    console.log(L(r.url.shared, s => `${s.url}\n      ${s.names.join(" · ")}`));
  }

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

  /**
   * 원본 바이트로 해시를 낸다 — 파싱된 결과가 아니라. BOM 이나 줄바꿈이
   * 바뀌어도 다른 파일이면 다른 해시여야 "같은 CSV 였는가" 에 답할 수 있다.
   */
  const csvPath = path.resolve(file);
  const raw = fs.readFileSync(csvPath);
  // 알고리즘은 `dataset.hash.algorithm` 이 말한다 — 값에 접두사를 겹쳐 넣지 않는다.
  const csvHash = createHash(HASH_ALGORITHM).update(raw).digest("hex");
  const csvVersion = typeof flags["dataset-version"] === "string"
    ? flags["dataset-version"]
    : fs.statSync(csvPath).mtime.toISOString().slice(0, 10);

  const { rows, skipped, missing, headers } = prepare(raw.toString("utf8"));
  console.log(`CSV     : ${file}`);
  console.log(`판·해시 : ${csvVersion} · ${HASH_ALGORITHM}:${csvHash.slice(0, 12)}…`);
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
    const report = toReviewReport(result, skipped, {
      csv: file,
      species: flags.live ? "(live)" : String(flags.species || ""),
      csvHash, csvVersion, csvBytes: raw.length
    });
    fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
    console.log(`\nJSON: ${out}`);
    console.log(`  schema ${schemaLabel(report.schema)} · 검토 ${report.summary.reviewTotal}건 ` +
                `(자동 연결 가능 ${report.summary.autoLinkable} · 사람 확인 ` +
                `${report.summary.cultivar + report.summary.possibleSynonym})`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv).catch(err => { console.error(`✗ ${err.message}`); process.exit(1); });
}
