#!/usr/bin/env node
/**
 * species ↔ plant_images 매칭 검증 — **읽기 전용** (T11-6.4-1).
 *
 *   SUPABASE_URL=… SUPABASE_SERVICE_KEY=… \
 *   node species-catalog/tests/verify-species-image-match.mjs --live [--json=match-report.json]
 *
 *   또는 (DB 없이)
 *   node species-catalog/tests/verify-species-image-match.mjs \
 *        --species=species-catalog-2026-09-22.json --images=plant_images_supabase.csv
 *
 * ## 쓰기를 하지 않는다
 *
 * DB 로 나가는 요청은 `GET` 뿐이다. 이 파일에 POST·PATCH·DELETE 경로가 없다.
 * `species` 는 **읽기만** 한다 — 이 단계에서 연결을 DB 에 반영하지 않는다.
 *
 * ## 무엇을 키로 삼는가
 *
 *   species.latin        명명자 없는 이명식 (Hydrangea macrophylla)
 *   plant_images.scientific_name   명명자 포함 (Stipa tenuissima Trin.)
 *
 * 두 컬럼을 원문끼리 맞추면 한 건도 안 맞는다(실측 확인). 그래서
 * `canonicalKey()` — 명명자만 떼고 품종·계급은 남긴 형태 — 로 맞춘다.
 *
 * ## 등급별로 나눠 센다
 *
 *   EXACT         원문까지 같다
 *   AUTHOR_ONLY   canonical 이 같다 → **자동 연결 가능**
 *   CULTIVAR      같은 종의 다른 하위 분류군 → 자동 연결 금지
 *   UNMATCHED     어느 쪽으로도 안 맞는다
 *
 * 자동 연결 대상은 EXACT · AUTHOR_ONLY 뿐이다(`AUTO_LINKABLE`). 품종을 원종에
 * 붙이면 수국 카드에 '엔들리스 서머' 사진이 걸린다 — 현장에서 사진 보고 고른
 * 물건이 다른 게 오면 없는 것보다 나쁘다.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { prepare } from "./import-plant-images.mjs";
import { speciesFromFile, fetchSpecies } from "./verify-plant-images.mjs";
import { fetchRows } from "./verify-plant-images-loaded.mjs";
import {
  normalizeScientificName, canonicalScientificName, canonicalKey, baseKey,
  classifyDifference, describeDifference, MATCH_CLASS, AUTO_LINKABLE
} from "../services/scientificName.js";

export const SCHEMA = { name: "species-image-match", major: 1, minor: 0 };
const MAX_SAMPLE = 20;

/**
 * 매칭 집계.
 *
 * @param {{id,name,latin}[]} species
 * @param {{scientific_name,korean_name,image_url}[]} images
 */
export function match(species, images) {
  // --- 이미지 쪽 색인 ------------------------------------------------
  const imgByCanon = new Map();   // canonicalKey → 이미지 행들
  const imgByBase  = new Map();   // baseKey      → 이미지 행들
  for (const r of images) {
    const ck = canonicalKey(r.scientific_name);
    const bk = baseKey(r.scientific_name);
    (imgByCanon.get(ck) ?? imgByCanon.set(ck, []).get(ck)).push(r);
    (imgByBase.get(bk)  ?? imgByBase.set(bk,  []).get(bk)).push(r);
  }

  // --- species 쪽 ----------------------------------------------------
  const withLatin = species.filter(s => normalizeScientificName(s.latin));
  const noLatin   = species.length - withLatin.length;

  /** 한 canonical 에 우리 수종이 둘 이상 걸리면 어느 쪽인지 정할 수 없다. */
  const spByCanon = new Map();
  for (const s of withLatin) {
    const k = canonicalKey(s.latin);
    (spByCanon.get(k) ?? spByCanon.set(k, []).get(k)).push(s);
  }
  const ambiguousSpecies = [...spByCanon.entries()]
    .filter(([, v]) => v.length > 1)
    .map(([k, v]) => ({ canonical: k, species: v.map(s => ({ id: s.id, name: s.name, latin: s.latin })) }));

  const rows = [];
  const usedImageNames = new Set();

  for (const s of withLatin) {
    const ck = canonicalKey(s.latin);
    const bk = baseKey(s.latin);
    const hits = imgByCanon.get(ck) || [];

    if (hits.length) {
      const exact = hits.filter(r => normalizeScientificName(r.scientific_name) ===
                                     normalizeScientificName(s.latin));
      const cls = exact.length ? MATCH_CLASS.EXACT : MATCH_CLASS.AUTHOR_ONLY;
      for (const r of hits) usedImageNames.add(normalizeScientificName(r.scientific_name));
      rows.push({
        speciesId: s.id, speciesName: s.name, latin: s.latin,
        canonical: canonicalScientificName(s.latin),
        matchClass: cls, autoLinkable: true,
        imageCount: hits.length,
        imageNames: [...new Set(hits.map(r => r.scientific_name))],
        urls: hits.map(r => r.image_url),
        diff: cls === MATCH_CLASS.EXACT ? "" : describeDifference(hits[0].scientific_name, s.latin)
      });
      continue;
    }

    // canonical 로는 없다 — 종 수준까지 풀면 하위 분류군이 있는가.
    const kin = (imgByBase.get(bk) || []).filter(r => canonicalKey(r.scientific_name) !== ck);
    if (kin.length) {
      rows.push({
        speciesId: s.id, speciesName: s.name, latin: s.latin,
        canonical: canonicalScientificName(s.latin),
        matchClass: MATCH_CLASS.CULTIVAR, autoLinkable: false,
        imageCount: 0,                       // 자동 연결 대상이 아니므로 0 으로 센다
        cultivarCount: kin.length,
        imageNames: [...new Set(kin.map(r => r.scientific_name))].slice(0, 8),
        urls: [],
        diff: describeDifference(kin[0].scientific_name, s.latin)
      });
      continue;
    }

    rows.push({
      speciesId: s.id, speciesName: s.name, latin: s.latin,
      canonical: canonicalScientificName(s.latin),
      matchClass: "UNMATCHED", autoLinkable: false,
      imageCount: 0, imageNames: [], urls: [], diff: "이미지 목록에 종 수준 후보가 없음"
    });
  }

  // --- 이미지 쪽 미연결 ----------------------------------------------
  const imageNamesAll = new Set(images.map(r => normalizeScientificName(r.scientific_name)));
  const unmatchedImageNames = [...imageNamesAll].filter(n => !usedImageNames.has(n));

  const by = c => rows.filter(r => r.matchClass === c);
  const linked = rows.filter(r => r.autoLinkable);

  return {
    speciesTotal: species.length,
    speciesWithLatin: withLatin.length,
    speciesNoLatin: noLatin,
    imagesTotal: images.length,
    imageNamesDistinct: imageNamesAll.size,

    exactMatch:     by(MATCH_CLASS.EXACT).length,
    authorOnly:     by(MATCH_CLASS.AUTHOR_ONLY).length,
    cultivarOnly:   by(MATCH_CLASS.CULTIVAR).length,
    unmatchedSpecies: by("UNMATCHED").length,
    unmatchedImageNames: unmatchedImageNames.length,
    ambiguousSpecies,

    // 자동 연결했을 때 수종별 사진 장수 분포
    dist: {
      zero: rows.filter(r => r.imageCount === 0).length,
      one:  rows.filter(r => r.imageCount === 1).length,
      many: rows.filter(r => r.imageCount >= 2).length
    },
    linkablePhotos: linked.reduce((n, r) => n + r.imageCount, 0),
    rows,
    samples: {
      exact:     by(MATCH_CLASS.EXACT).slice(0, MAX_SAMPLE),
      authorOnly: by(MATCH_CLASS.AUTHOR_ONLY).slice(0, MAX_SAMPLE),
      cultivar:  by(MATCH_CLASS.CULTIVAR).slice(0, MAX_SAMPLE),
      unmatched: by("UNMATCHED").slice(0, MAX_SAMPLE),
      unmatchedImageNames: unmatchedImageNames.slice(0, MAX_SAMPLE)
    }
  };
}

export function toMatchReport(m, meta = {}) {
  return {
    schema: SCHEMA,
    generatedAt: new Date().toISOString(),
    source: { species: meta.species || "", images: meta.images || "" },
    rule: {
      key: "canonicalKey(species.latin) === canonicalKey(plant_images.scientific_name)",
      autoLinkable: [...AUTO_LINKABLE],
      note: "CULTIVAR 는 자동 연결하지 않는다 — 같은 종의 다른 하위 분류군이다."
    },
    summary: {
      speciesTotal: m.speciesTotal, speciesWithLatin: m.speciesWithLatin,
      speciesNoLatin: m.speciesNoLatin,
      imagesTotal: m.imagesTotal, imageNamesDistinct: m.imageNamesDistinct,
      exactMatch: m.exactMatch, authorOnly: m.authorOnly,
      autoLinkableSpecies: m.exactMatch + m.authorOnly,
      cultivarOnly: m.cultivarOnly,
      unmatchedSpecies: m.unmatchedSpecies,
      unmatchedImageNames: m.unmatchedImageNames,
      ambiguousSpecies: m.ambiguousSpecies.length,
      linkablePhotos: m.linkablePhotos,
      imagesPerSpecies: m.dist
    },
    ambiguous: m.ambiguousSpecies,
    rows: m.rows
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

  let species, images, srcSpecies, srcImages;

  if (flags.live) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL · SUPABASE_SERVICE_KEY 환경변수가 필요합니다");
    species = await fetchSpecies(url, key);
    images  = await fetchRows(url, key);
    srcSpecies = "(live) public.species";
    srcImages  = "(live) public.plant_images";
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
    images = rows;
    srcSpecies = String(flags.species);
    srcImages  = String(flags.images);
  }

  const m = match(species, images);

  console.log(`species      : ${srcSpecies}  — ${m.speciesTotal}행 (latin 있음 ${m.speciesWithLatin})`);
  console.log(`plant_images : ${srcImages}  — ${m.imagesTotal}행 (학명 ${m.imageNamesDistinct}종)\n`);

  console.log("── 매칭 등급 ────────────────────────────────");
  console.log(`  EXACT (원문 일치)        : ${m.exactMatch}`);
  console.log(`  AUTHOR_ONLY (명명자 차이) : ${m.authorOnly}    ← 자동 연결 가능`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  자동 연결 대상 수종       : ${m.exactMatch + m.authorOnly}`);
  console.log(`  붙는 사진 총 장수         : ${m.linkablePhotos}`);
  console.log();
  console.log(`  CULTIVAR (하위 분류군만)  : ${m.cultivarOnly}    ← 자동 연결 금지`);
  console.log(`  UNMATCHED (후보 없음)     : ${m.unmatchedSpecies}`);
  console.log(`  latin 비어 있음           : ${m.speciesNoLatin}`);
  console.log(`  AMBIGUOUS (같은 canonical 수종 중복) : ${m.ambiguousSpecies.length}`);
  console.log(`  이미지에만 있는 학명      : ${m.unmatchedImageNames}`);

  console.log("\n── 수종별 사진 장수 (자동 연결 기준) ─────────");
  console.log(`  0장 : ${m.dist.zero}`);
  console.log(`  1장 : ${m.dist.one}`);
  console.log(`  2장 이상 : ${m.dist.many}`);

  const show = (title, list, fmt) => {
    if (!list.length) return;
    console.log(`\n── ${title} (${list.length}${list.length === MAX_SAMPLE ? "+" : ""}) ──`);
    for (const x of list) console.log("  " + fmt(x));
  };
  show("EXACT", m.samples.exact, r => `${r.speciesId} ${r.speciesName} · ${r.latin} — ${r.imageCount}장`);
  show("AUTHOR_ONLY", m.samples.authorOnly,
       r => `${r.speciesId} ${r.speciesName} · ${r.latin}\n      ← ${r.imageNames.join(" · ")}  (${r.diff}) — ${r.imageCount}장`);
  show("CULTIVAR (자동 연결 금지)", m.samples.cultivar,
       r => `${r.speciesId} ${r.speciesName} · ${r.latin}  — 하위 분류군 ${r.cultivarCount}건\n      ${r.imageNames.slice(0, 3).join(" · ")}`);
  show("UNMATCHED", m.samples.unmatched, r => `${r.speciesId} ${r.speciesName} · ${r.latin}`);

  if (m.ambiguousSpecies.length) {
    console.log(`\n── AMBIGUOUS — 같은 canonical 에 수종이 둘 이상 ──`);
    for (const a of m.ambiguousSpecies) {
      console.log(`  ${a.canonical}: ${a.species.map(s => `${s.id} ${s.name}`).join(" · ")}`);
    }
  }

  if (flags.json) {
    const out = typeof flags.json === "string" ? flags.json : "match-report.json";
    fs.writeFileSync(out, JSON.stringify(
      toMatchReport(m, { species: srcSpecies, images: srcImages }), null, 2), "utf8");
    console.log(`\nJSON: ${out}`);
  }

  console.log("\n이 검증은 SELECT(GET) 만 사용했습니다 — INSERT/UPDATE/DELETE 를 수행하지 않았습니다.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv).catch(err => { console.error(`✗ ${err.message}`); process.exit(1); });
}
