#!/usr/bin/env node
/**
 * 학명 승인표 — **읽기 전용** (T11-6.4-4).
 *
 *   node species-catalog/tests/species-image-name-approval-report.mjs \
 *        --candidates=name-candidates.json [--live | --species=export.json] \
 *        --json=species-image-approval.json --csv=species-image-approval.csv
 *
 * ## 사람이 결정한다
 *
 * 어떤 행도 자동으로 APPROVED 가 되지 않는다. `decision` 은 전부 `null` 로
 * 나가고, 이 파일은 **판단의 근거만** 모은다. 국명이 같아도 학명이 같지
 * 않다 — 동명이물이 있고, 품종명이 붙고, 통용명과 정명이 다르다.
 *
 * DB 로 나가는 요청은 `GET` 뿐이다. `species.latin` 을 쓰지 않는다.
 *
 * ## 검토 우선순위
 *
 *   A  확인이 빠른 것      국명 완전 일치 · 후보 분류군 1개 · 위험 표시 없음
 *   B  반드시 사람 판단     위험 표시가 하나라도 있음, 또는 후보가 여럿
 *                        (동명이물 · 품종명/하위 분류군 · 접미사 의존 · AMBIGUOUS)
 *   C  근거가 약한 것      유사도만으로 올라온 단일 후보 — 맞을 수도, 아닐 수도
 *   D  후보 없음          국명으로는 찾지 못함. 수기 입력이나 다른 출처가 필요
 *
 * A 가 "자동 승인 가능"이라는 뜻이 아니다. **가장 빨리 확인되는 순서**일 뿐이고,
 * 확인은 A 도 사람이 한다.
 *
 * ## 승인 파일이 아니다
 *
 * 이 출력은 조사 결과다. 여기에 사람이 `decision` 을 채운 뒤라야 승인 데이터가
 * 된다. 채워지지 않은 파일을 UPDATE 입력으로 쓰지 않는다.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { speciesFromFile, fetchSpecies, DECISIONS } from "./verify-plant-images.mjs";
import { GRADE } from "./species-image-name-candidates.mjs";

export const SCHEMA = { name: "species-name-approval", major: 1, minor: 0 };

/** 후보 조사 보고서의 판 — 모르는 major 는 반쯤 해석하지 않는다. */
export const EXPECTED_CANDIDATES_SCHEMA = { name: "species-name-candidates", major: 1 };

export const PRIORITY = {
  A: "A · 확인이 빠름 (완전 일치 · 단일 후보 · 위험 없음)",
  B: "B · 반드시 사람 판단 (위험 표시 또는 후보 여럿)",
  C: "C · 근거 약함 (유사도만으로 올라온 단일 후보)",
  D: "D · 후보 없음"
};

/** 한 줄의 우선순위를 정한다. **판단이 아니라 분류다.** */
export function priorityOf(row, cand) {
  if (row.grade === GRADE.NO_CANDIDATE || !cand) return "D";
  const risky = (cand.risks || []).length > 0;
  const multi = (row.taxonCount ?? row.candidates?.length ?? 1) > 1;
  if (row.grade === GRADE.EXACT_KO) return (risky || multi) ? "B" : "A";
  if (row.grade === GRADE.AMBIGUOUS_KO) return "B";
  return risky ? "B" : "C";       // SIMILAR_KO
}

/** 왜 그 자리에 놓였는지 한 줄. 사람이 표만 보고도 알 수 있게. */
function noteFor(row, cand, priority) {
  if (priority === "D") return row.note || "국명으로 후보를 찾지 못함";
  const bits = [];
  if (row.grade === GRADE.EXACT_KO) bits.push("국명 완전 일치");
  else bits.push(`국명 유사 ${Number(cand.similarity).toFixed(3)}`);
  const n = row.taxonCount ?? row.candidates?.length ?? 1;
  if (n > 1) bits.push(`후보 분류군 ${n}개`);
  if ((cand.risks || []).length) bits.push(cand.risks.join(" / "));
  return bits.join(" · ");
}

/**
 * 후보 조사 결과 → 승인표.
 *
 * 한 수종에 후보가 여럿이면 **후보마다 한 줄**이다. 사람이 그중 하나를
 * APPROVED 로 고르고 나머지를 REJECTED 로 두면 선택이 기록으로 남는다.
 */
export function buildApproval(candidateReport, speciesById = new Map()) {
  const rows = [];
  for (const r of candidateReport.rows || []) {
    const latin = speciesById.get(r.speciesId)?.latin ?? "";
    const cands = r.candidates || [];

    if (!cands.length) {
      rows.push({
        id: `${r.speciesId}::`,
        priority: "D",
        speciesId: r.speciesId, speciesName: r.speciesName, currentLatin: latin,
        grade: r.grade,
        candidateKoreanName: "", candidateScientificName: "",
        similarity: null, imageCount: 0, sampleImageUrl: "",
        risks: [], decision: null, reviewReason: null,
        note: noteFor(r, null, "D")
      });
      continue;
    }

    for (const c of cands) {
      const priority = priorityOf(r, c);
      rows.push({
        id: `${r.speciesId}::${c.scientificName}`,
        priority,
        speciesId: r.speciesId, speciesName: r.speciesName, currentLatin: latin,
        grade: r.grade,
        candidateKoreanName: c.koreanName,
        candidateScientificName: c.scientificName,
        canonicalName: c.canonicalName,
        similarity: c.similarity,
        imageCount: c.imageCount,
        sampleImageUrl: (c.imageUrlSample || [])[0] || "",
        risks: c.risks || [],
        decision: null,            // ← 사람이 채운다. 자동으로 APPROVED 가 되지 않는다.
        reviewReason: null,        // ← 사람 메모
        note: noteFor(r, c, priority)
      });
    }
  }

  // 우선순위 → 수종 번호 → 사진 많은 순
  const order = { A: 0, B: 1, C: 2, D: 3 };
  rows.sort((a, b) =>
    order[a.priority] - order[b.priority] ||
    a.speciesId.localeCompare(b.speciesId) ||
    (b.imageCount - a.imageCount));

  const speciesIn = p => new Set(rows.filter(r => r.priority === p).map(r => r.speciesId)).size;
  return {
    rows,
    counts: {
      rowsTotal: rows.length,
      speciesTotal: new Set(rows.map(r => r.speciesId)).size,
      A: speciesIn("A"), B: speciesIn("B"), C: speciesIn("C"), D: speciesIn("D"),
      rowsA: rows.filter(r => r.priority === "A").length,
      rowsB: rows.filter(r => r.priority === "B").length,
      rowsC: rows.filter(r => r.priority === "C").length,
      rowsD: rows.filter(r => r.priority === "D").length,
      withRisk: rows.filter(r => r.risks.length).length,
      approved: 0                 // 생성 시점에는 언제나 0
    }
  };
}

export function toApprovalReport(a, meta = {}) {
  return {
    schema: SCHEMA,
    generatedAt: new Date().toISOString(),
    source: {
      candidates: meta.candidates || "",
      candidatesSchema: meta.candidatesSchema || null,
      species: meta.species || ""
    },
    rule: {
      decisionValues: DECISIONS,
      priority: PRIORITY,
      note: "decision 은 전부 null 로 나간다. 자동 승인은 없다. " +
            "A 는 확인이 빠른 순서일 뿐 자동 승인 대상이 아니다."
    },
    summary: a.counts,
    rows: a.rows
  };
}

const CSV_COLUMNS = [
  ["priority",                "우선순위"],
  ["speciesId",               "species_id"],
  ["speciesName",             "species_name"],
  ["currentLatin",            "current_latin"],
  ["grade",                   "grade"],
  ["candidateKoreanName",     "candidate_korean_name"],
  ["candidateScientificName", "candidate_scientific_name"],
  ["similarity",              "similarity"],
  ["imageCount",              "image_count"],
  ["sampleImageUrl",          "sample_image_url"],
  ["risks",                   "risks"],
  ["decision",                "decision"],
  ["reviewReason",            "review_reason"],
  ["note",                    "note"]
];

export function toCsv(rows) {
  const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const out = [CSV_COLUMNS.map(c => c[1]).join(",")];
  for (const r of rows) {
    out.push(CSV_COLUMNS.map(([k]) =>
      esc(k === "risks" ? (r.risks || []).join(" | ") : r[k])).join(","));
  }
  return out.join("\n") + "\n";
}

// ------------------------------------------------------------
// CLI
// ------------------------------------------------------------

async function main(argv) {
  const flags = Object.fromEntries(argv.slice(2).filter(a => a.startsWith("--")).map(a => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }));
  if (typeof flags.candidates !== "string") {
    console.error("사용법: --candidates=name-candidates.json [--live | --species=export.json] " +
                  "[--json=species-image-approval.json] [--csv=species-image-approval.csv]");
    process.exit(2);
  }

  const report = JSON.parse(fs.readFileSync(path.resolve(flags.candidates), "utf8"));
  const s = report?.schema;
  if (s?.name !== EXPECTED_CANDIDATES_SCHEMA.name || s?.major !== EXPECTED_CANDIDATES_SCHEMA.major) {
    console.error(`✗ 읽을 수 없는 후보 보고서: ${s ? `${s.name}/${s.major}.${s.minor}` : "(schema 없음)"}`);
    process.exit(1);
  }

  // 현재 latin 은 보고서가 아니라 원본에서 읽는다 — 그 사이 바뀌었을 수 있다.
  let speciesById = new Map(), srcSpecies = "(조회 안 함 — current_latin 은 빈 값)";
  if (flags.live) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL · SUPABASE_SERVICE_KEY 환경변수가 필요합니다");
    speciesById = new Map((await fetchSpecies(url, key)).map(x => [x.id, x]));
    srcSpecies = "(live) public.species";
  } else if (typeof flags.species === "string") {
    speciesById = new Map(speciesFromFile(path.resolve(flags.species)).map(x => [x.id, x]));
    srcSpecies = String(flags.species);
  }

  const a = buildApproval(report, speciesById);
  const c = a.counts;

  console.log(`후보 보고서 : ${flags.candidates}  (${s.name}/${s.major}.${s.minor})`);
  console.log(`species     : ${srcSpecies}\n`);

  console.log("── 검토 우선순위 ────────────────────────────");
  for (const p of ["A", "B", "C", "D"]) {
    console.log(`  ${PRIORITY[p].padEnd(46)} 수종 ${String(c[p]).padStart(3)} · 행 ${String(c["rows" + p]).padStart(3)}`);
  }
  console.log(`  ─────────────────────────────────────────`);
  console.log(`  합계                                           수종 ${c.speciesTotal} · 행 ${c.rowsTotal}`);
  console.log(`\n  위험 표시가 붙은 행 : ${c.withRisk}`);
  console.log(`  APPROVED 인 행      : ${c.approved}   ← 생성 시점에는 언제나 0`);

  for (const p of ["A", "B", "C"]) {
    const list = a.rows.filter(r => r.priority === p);
    if (!list.length) continue;
    console.log(`\n── ${PRIORITY[p]} ──`);
    for (const r of list) {
      console.log(`  ${r.speciesId}  ${r.speciesName}`);
      console.log(`      ${String(r.similarity ?? "").padEnd(6)} ${r.candidateKoreanName} → ${r.candidateScientificName}  (사진 ${r.imageCount})`);
      if (r.sampleImageUrl) console.log(`             ${r.sampleImageUrl}`);
      for (const w of r.risks) console.log(`             ⚠ ${w}`);
    }
  }
  const d = a.rows.filter(r => r.priority === "D");
  if (d.length) {
    console.log(`\n── ${PRIORITY.D} (${d.length}) ──`);
    console.log("  " + d.map(r => `${r.speciesId} ${r.speciesName}`).join(" · "));
  }

  if (flags.json) {
    const out = typeof flags.json === "string" ? flags.json : "species-image-approval.json";
    fs.writeFileSync(out, JSON.stringify(
      toApprovalReport(a, { candidates: String(flags.candidates), candidatesSchema: s, species: srcSpecies }),
      null, 2), "utf8");
    console.log(`\nJSON: ${out}`);
  }
  if (flags.csv) {
    const out = typeof flags.csv === "string" ? flags.csv : "species-image-approval.csv";
    fs.writeFileSync(out, toCsv(a.rows), "utf8");
    console.log(`CSV : ${out}`);
  }

  console.log("\n이 보고서는 SELECT(GET) 만 사용했습니다 — INSERT/UPDATE/DELETE 를 수행하지 않았습니다.");
  console.log("decision 이 채워지기 전까지 이 파일은 승인 데이터가 아닙니다.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv).catch(err => { console.error(`✗ ${err.message}`); process.exit(1); });
}
