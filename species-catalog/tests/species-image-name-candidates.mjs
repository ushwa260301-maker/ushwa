#!/usr/bin/env node
/**
 * `latin` 이 빈 수종의 학명 후보 조사 — **읽기 전용** (T11-6.4-3).
 *
 *   SUPABASE_URL=… SUPABASE_SERVICE_KEY=… \
 *   node species-catalog/tests/species-image-name-candidates.mjs --live --json=name-candidates.json
 *
 *   또는 (DB 없이)
 *   … --species=species-catalog-2026-09-23.json --images=plant_images_supabase.csv
 *
 * ## 후보만 만든다. 확정하지 않는다.
 *
 * DB 로 나가는 요청은 `GET` 뿐이고, 이 파일에 POST·PATCH·DELETE 경로가 없다.
 * 국명이 같다고 학명이 같지 않다 — 통용명과 정명이 다르고, 동명이물이 있고,
 * 품종명이 섞인다. 그래서 **자동 확정하지 않고** 사람이 볼 목록을 만든다.
 *
 * ## 임계값을 새로 만들지 않는다
 *
 * 정규화와 유사도는 `js/matcher.js` 의 것을 그대로 쓴다. `--floor` 기본값은
 * 그 파일의 `possibleThreshold`(0.60)인데, **판정 기준이 아니라 보고 하한**이다
 * — 그 아래는 목록에서 빼기만 한다.
 *
 * 실측한 식물 국명 유사도 분포는 임계값 하나로 가를 수 없음을 보여 준다.
 *
 *     다른 식물   홍단풍 ↔ 청단풍           0.778
 *                공조팝나무 ↔ 갈기조팝나무   0.714
 *                왕벚나무 ↔ 벚나무          0.700
 *     같은 식물   산수유 ↔ 산수유나무        0.636
 *
 * 0.636~0.778 구간에 양쪽이 섞여 있다. 그래서 유사도는 **후보를 좁히는 데만**
 * 쓰고, 채택은 사람이 한다.
 *
 * ## 위험 표시
 *
 *   동명이물     출처 안에서 같은 국명이 서로 다른 분류군을 가리킨다
 *   품종명 포함   후보 학명에 품종·계급이 붙어 있다
 *   접미사 의존   공통 꼬리를 떼면 유사도가 무너진다 — 닮아 보인 이유가 그것뿐
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { prepare } from "./import-plant-images.mjs";
import { speciesFromFile, fetchSpecies } from "./verify-plant-images.mjs";
import { fetchRows } from "./verify-plant-images-loaded.mjs";
import { normalizeSpeciesName, calculateSimilarity } from "../js/matcher.js";
import { canonicalKey, canonicalScientificName, cultivarOf, rankOf } from "../services/scientificName.js";

export const SCHEMA = { name: "species-name-candidates", major: 1, minor: 0 };

/** 보고 하한 — `matcher.js` 의 possibleThreshold. **판정 기준이 아니다.** */
export const REPORT_FLOOR = 0.60;

/** 한 수종당 보여 줄 후보 수. 사람이 훑을 수 있는 길이로 자른다. */
export const TOP_K = 5;

export const GRADE = {
  EXACT_KO:     "EXACT_KO",
  SIMILAR_KO:   "SIMILAR_KO",
  AMBIGUOUS_KO: "AMBIGUOUS_KO",
  NO_CANDIDATE: "NO_CANDIDATE"
};

/** 두 이름의 공통 꼬리 길이 — 접미사 의존을 재기 위한 것. 단어 목록을 쓰지 않는다. */
function commonSuffixLength(a, b) {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

/**
 * 공통 꼬리를 떼고 다시 잰 유사도. 원래 점수가 높은데 이 값이 낮으면
 * 닮아 보인 이유가 꼬리뿐이라는 뜻이다(느티**나무** ↔ 단풍**나무**).
 */
export function similarityWithoutCommonSuffix(a, b) {
  const n = commonSuffixLength(a, b);
  if (!n) return calculateSimilarity(a, b);
  return calculateSimilarity(a.slice(0, a.length - n), b.slice(0, b.length - n));
}

/**
 * 이미지 목록을 국명 기준으로 색인한다.
 *
 * 같은 국명이 서로 다른 분류군을 가리키면 **출처 안에서의 동명이물**이다 —
 * 우리가 만든 의심이 아니라 데이터가 말하는 사실이라 그대로 표시한다.
 */
export function indexImages(images) {
  const byKo = new Map();          // 정규화 국명 → 행들
  for (const r of images) {
    const k = normalizeSpeciesName(r.korean_name);
    if (!k) continue;
    let a = byKo.get(k);
    if (!a) byKo.set(k, a = []);
    a.push(r);
  }
  const homonyms = new Set();
  for (const [k, rows] of byKo) {
    if (new Set(rows.map(r => canonicalKey(r.scientific_name))).size > 1) homonyms.add(k);
  }
  return { byKo, homonyms };
}

/** 같은 분류군끼리 묶어 후보 하나로 만든다 — 명명자만 다른 행은 한 후보다. */
function toCandidates(rows, score, koKey, homonyms) {
  const byTaxon = new Map();
  for (const r of rows) {
    const k = canonicalKey(r.scientific_name);
    let g = byTaxon.get(k);
    if (!g) byTaxon.set(k, g = { rows: [], names: new Set() });
    g.rows.push(r);
    g.names.add(r.scientific_name);
  }
  return [...byTaxon.entries()].map(([k, g]) => {
    const risks = [];
    if (homonyms.has(koKey)) risks.push("동명이물 — 같은 국명이 다른 분류군에도 쓰임");
    if (cultivarOf(g.rows[0].scientific_name)) risks.push("품종명 포함");
    if (rankOf(g.rows[0].scientific_name)) risks.push(`하위 분류군(${rankOf(g.rows[0].scientific_name)})`);
    return {
      canonical:      k,
      koreanName:     g.rows[0].korean_name,
      scientificName: [...g.names][0],
      scientificNameVariants: [...g.names].slice(0, 3),
      canonicalName:  canonicalScientificName(g.rows[0].scientific_name),
      similarity:     Number(score.toFixed(3)),
      imageCount:     g.rows.length,
      imageUrlSample: g.rows.slice(0, 2).map(r => r.image_url),
      risks
    };
  }).sort((a, b) => b.imageCount - a.imageCount);
}

/**
 * `latin` 이 빈 수종들에 대해 후보를 만든다.
 *
 * @param {{id,name,latin}[]} species
 * @param {{scientific_name,korean_name,image_url}[]} images
 */
export function buildCandidates(species, images, floor = REPORT_FLOOR) {
  const { byKo, homonyms } = indexImages(images);
  const koKeys = [...byKo.keys()];
  const targets = species.filter(s => !String(s.latin ?? "").trim());

  const rows = targets.map(s => {
    const want = normalizeSpeciesName(s.name);
    if (!want) {
      return { speciesId: s.id, speciesName: s.name, normalized: "",
               grade: GRADE.NO_CANDIDATE, candidates: [], topScore: 0,
               note: "국명이 비어 있어 조회할 수 없음" };
    }

    // 1) 국명 완전 일치
    const exactRows = byKo.get(want) || [];
    if (exactRows.length) {
      const cands = toCandidates(exactRows, 1, want, homonyms);
      return {
        speciesId: s.id, speciesName: s.name, normalized: want,
        grade: GRADE.EXACT_KO, taxonCount: cands.length,
        candidates: cands.slice(0, TOP_K), topScore: 1
      };
    }

    // 2) 유사 후보 — 보고 하한 위만
    const scored = [];
    for (const k of koKeys) {
      const sc = calculateSimilarity(want, k);
      if (sc >= floor) scored.push({ k, sc });
    }
    if (!scored.length) {
      return { speciesId: s.id, speciesName: s.name, normalized: want,
               grade: GRADE.NO_CANDIDATE, candidates: [], topScore: 0 };
    }
    scored.sort((a, b) => b.sc - a.sc);

    const cands = [];
    for (const { k, sc } of scored.slice(0, TOP_K)) {
      for (const c of toCandidates(byKo.get(k), sc, k, homonyms)) {
        // 꼬리를 떼면 무너지는가 — 닮아 보인 이유가 접미사뿐인 경우
        const bare = similarityWithoutCommonSuffix(want, k);
        if (sc - bare >= 0.25) {
          c.risks.push(`접미사 의존 — 공통 꼬리 제거 시 ${bare.toFixed(2)}`);
        }
        c.matchedKoreanKey = k;
        cands.push(c);
      }
    }
    const taxa = new Set(cands.map(c => c.canonical)).size;
    return {
      speciesId: s.id, speciesName: s.name, normalized: want,
      grade: taxa > 1 ? GRADE.AMBIGUOUS_KO : GRADE.SIMILAR_KO,
      taxonCount: taxa,
      candidates: cands.slice(0, TOP_K),
      topScore: Number(scored[0].sc.toFixed(3))
    };
  });

  const by = g => rows.filter(r => r.grade === g);
  const exact = by(GRADE.EXACT_KO);

  return {
    floor,
    targetTotal: targets.length,
    speciesTotal: species.length,
    imagesTotal: images.length,
    koreanNamesDistinct: koKeys.length,
    homonymKoreanNames: homonyms.size,
    counts: {
      EXACT_KO:      exact.length,
      EXACT_KO_단일:  exact.filter(r => r.taxonCount === 1).length,
      EXACT_KO_복수:  exact.filter(r => r.taxonCount > 1).length,
      SIMILAR_KO:    by(GRADE.SIMILAR_KO).length,
      AMBIGUOUS_KO:  by(GRADE.AMBIGUOUS_KO).length,
      NO_CANDIDATE:  by(GRADE.NO_CANDIDATE).length
    },
    /** 유사도 분포 — 임계값을 정하기 전에 실제 모양을 본다. */
    histogram: (() => {
      const h = {};
      for (const r of rows) {
        if (r.grade === GRADE.EXACT_KO || !r.topScore) continue;
        const b = (Math.floor(r.topScore * 20) / 20).toFixed(2);
        h[b] = (h[b] || 0) + 1;
      }
      return h;
    })(),
    rows
  };
}

export function toCandidateReport(c, meta = {}) {
  return {
    schema: SCHEMA,
    generatedAt: new Date().toISOString(),
    source: { species: meta.species || "", images: meta.images || "" },
    rule: {
      normalize:  "js/matcher.js · normalizeSpeciesName()",
      similarity: "js/matcher.js · calculateSimilarity() (NFD 자모 Levenshtein)",
      reportFloor: c.floor,
      note: "reportFloor 는 보고 하한이며 판정 기준이 아니다. 자동 확정하지 않는다."
    },
    summary: {
      speciesTotal: c.speciesTotal, targetTotal: c.targetTotal,
      imagesTotal: c.imagesTotal, koreanNamesDistinct: c.koreanNamesDistinct,
      homonymKoreanNames: c.homonymKoreanNames,
      ...c.counts
    },
    histogram: c.histogram,
    rows: c.rows
  };
}

// ------------------------------------------------------------
// CLI
// ------------------------------------------------------------

async function main(argv) {
  const flags = Object.fromEntries(argv.slice(2).filter(a => a.startsWith("--")).map(a => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }));
  const floor = typeof flags.floor === "string" ? Number(flags.floor) : REPORT_FLOOR;

  let species, images, srcS, srcI;
  if (flags.live) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL · SUPABASE_SERVICE_KEY 환경변수가 필요합니다");
    species = await fetchSpecies(url, key);
    images  = await fetchRows(url, key);
    srcS = "(live) public.species"; srcI = "(live) public.plant_images";
  } else {
    if (typeof flags.species !== "string" || typeof flags.images !== "string") {
      console.error("사용법: --live  또는  --species=<export.json> --images=<plant_images.csv>");
      process.exit(2);
    }
    species = speciesFromFile(path.resolve(flags.species));
    const { rows, missing, headers } = prepare(fs.readFileSync(path.resolve(flags.images), "utf8"));
    if (missing.length) {
      console.error(`✗ 이미지 CSV 컬럼을 찾지 못했습니다: ${missing.join(", ")}`);
      console.error(`  헤더: ${headers.join(" | ")}`);
      process.exit(1);
    }
    images = rows; srcS = String(flags.species); srcI = String(flags.images);
  }

  const c = buildCandidates(species, images, floor);

  console.log(`species      : ${srcS} — ${c.speciesTotal}행`);
  console.log(`plant_images : ${srcI} — ${c.imagesTotal}행 (국명 ${c.koreanNamesDistinct}종)`);
  console.log(`대상         : latin 이 빈 ${c.targetTotal}종`);
  console.log(`보고 하한     : ${c.floor}  (matcher.js possibleThreshold · 판정 기준 아님)\n`);

  console.log("── 등급 집계 ────────────────────────────────");
  console.log(`  EXACT_KO       : ${c.counts.EXACT_KO}   (단일 ${c.counts.EXACT_KO_단일} · 복수 ${c.counts.EXACT_KO_복수})`);
  console.log(`  SIMILAR_KO     : ${c.counts.SIMILAR_KO}`);
  console.log(`  AMBIGUOUS_KO   : ${c.counts.AMBIGUOUS_KO}`);
  console.log(`  NO_CANDIDATE   : ${c.counts.NO_CANDIDATE}`);
  console.log(`  ─────────────────────────`);
  console.log(`  합계           : ${c.targetTotal}`);
  console.log(`\n  출처 내 동명이물 국명 : ${c.homonymKoreanNames}종`);

  const hb = Object.keys(c.histogram).sort();
  if (hb.length) {
    console.log("\n── 최고 유사도 분포 (EXACT 제외) ─────────────");
    for (const b of hb) console.log(`  ${b} : ${"█".repeat(c.histogram[b])} ${c.histogram[b]}`);
  }

  const show = (g, title) => {
    const list = c.rows.filter(r => r.grade === g);
    if (!list.length) return;
    console.log(`\n── ${title} (${list.length}) ──`);
    for (const r of list) {
      console.log(`  ${r.speciesId}  ${r.speciesName}` +
                  (r.taxonCount > 1 ? `   ← 후보 분류군 ${r.taxonCount}개` : ""));
      for (const x of r.candidates) {
        console.log(`      ${x.similarity.toFixed(3)}  ${x.koreanName}  →  ${x.scientificName}` +
                    `  (사진 ${x.imageCount})`);
        if (x.imageUrlSample[0]) console.log(`             ${x.imageUrlSample[0]}`);
        for (const w of x.risks) console.log(`             ⚠ ${w}`);
      }
      if (r.note) console.log(`      ${r.note}`);
    }
  };
  show(GRADE.EXACT_KO,     "EXACT_KO — 국명 완전 일치");
  show(GRADE.AMBIGUOUS_KO, "AMBIGUOUS_KO — 후보 분류군 여럿");
  show(GRADE.SIMILAR_KO,   "SIMILAR_KO — 유사 후보 단일");
  const none = c.rows.filter(r => r.grade === GRADE.NO_CANDIDATE);
  if (none.length) {
    console.log(`\n── NO_CANDIDATE (${none.length}) ──`);
    for (const r of none) console.log(`  ${r.speciesId}  ${r.speciesName}`);
  }

  if (flags.json) {
    const out = typeof flags.json === "string" ? flags.json : "name-candidates.json";
    fs.writeFileSync(out, JSON.stringify(
      toCandidateReport(c, { species: srcS, images: srcI }), null, 2), "utf8");
    console.log(`\nJSON: ${out}`);
  }
  if (flags.csv) {
    const out = typeof flags.csv === "string" ? flags.csv : "name-candidates.csv";
    const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = ["species_id,species_name,grade,similarity,candidate_korean_name," +
                   "candidate_scientific_name,image_count,image_url,risks"];
    for (const r of c.rows) {
      if (!r.candidates.length) {
        lines.push([r.speciesId, r.speciesName, r.grade, "", "", "", 0, "", ""].map(esc).join(","));
        continue;
      }
      for (const x of r.candidates) {
        lines.push([r.speciesId, r.speciesName, r.grade, x.similarity, x.koreanName,
                    x.scientificName, x.imageCount, x.imageUrlSample[0] || "",
                    x.risks.join(" | ")].map(esc).join(","));
      }
    }
    fs.writeFileSync(out, lines.join("\n") + "\n", "utf8");
    console.log(`CSV : ${out}`);
  }

  console.log("\n이 조사는 SELECT(GET) 만 사용했습니다 — INSERT/UPDATE/DELETE 를 수행하지 않았습니다.");
  console.log("후보는 후보일 뿐입니다. 어떤 학명도 확정하지 않았습니다.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv).catch(err => { console.error(`✗ ${err.message}`); process.exit(1); });
}
