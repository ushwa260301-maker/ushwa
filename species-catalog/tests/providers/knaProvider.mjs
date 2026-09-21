#!/usr/bin/env node
/**
 * knaProvider 회귀 테스트 (T11-5).
 *
 *   node species-catalog/tests/providers/knaProvider.mjs
 *
 * 네트워크를 쓰지 않는다. Provider 는 API 를 직접 부르지 않으므로
 * Edge Function 호출자(`invoke`)를 주입한다.
 *
 * ## 대상 오퍼레이션
 *
 * 국가표준식물목록 `scnmSearch` — 이름으로 학명을 찾아 준다. 분류 정보까지는
 * 주지만 개화기·생육환경·사진은 **없다.** 그래서 그쪽 필드는 비우며,
 * 다른 값에서 유추해 채우지 않는다.
 *
 *   plantScnmId → recordId · plantSpecsScnm → scientificName
 *   stpltScnmRltnCdNm → scientificNameStatus ("정명"·"이명")
 *
 * ## Fixture
 *
 * `tests/fixtures/kna/scnmSearch-success.json` 은 **실제 호출 응답 원문**이다.
 * 마커가 없다 — 그 폴더는 실측 전용이다. 아래 매핑 검사는 그 파일의 행을 쓴다.
 *
 * ## kna_examples/ 와의 관계
 *
 * `tests/fixtures/kna_examples/*.json` 은 실제 필드명을 모르던 때(T11-3.2)에
 * 명세를 보고 쓴 예시다(`plantId` · `koreanName` …). 실제 계약이 확인된 지금
 * 그 이름들은 **맞지 않는다.** 파일은 그대로 두되(계약 문서로 보존 결정),
 * 아래에서 "지금 매핑으로는 해석되지 않는다"는 사실을 고정해 둔다 — 조용히
 * 어긋나 있는 것보다 낫고, 누군가 실제 모양으로 고치면 여기서 걸린다.
 */

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const kna = await import("../../services/plantProviders/knaProvider.js");
const { PLANT_RECORD_FIELDS } = await import("../../services/plantRecord.js");

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = join(HERE, "..", "fixtures", "kna_examples");

let pass = 0, fail = 0; const failed = [];
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : (fail++, failed.push(label));
  console.log(`${ok ? "✓" : "✗"} ${label}` +
              (ok ? "" : `\n    기대: ${JSON.stringify(expected)}\n    실제: ${JSON.stringify(actual)}`));
}
function section(t) { console.log(`\n── ${t} ${"─".repeat(Math.max(0, 48 - t.length))}`); }

/** 실제 응답에서 행을 꺼낸다 — 지어낸 입력을 쓰지 않는다. */
const REAL = JSON.parse(
  await readFile(join(HERE, "..", "fixtures", "kna", "scnmSearch-success.json"), "utf8"));
const REAL_ROWS = REAL.response.body.items.item;
const ROW = REAL_ROWS[0];        // 가거개별꽃 · 정명
const SYNONYM_ROW = REAL_ROWS[2]; // 가거꼬리고사리 · 이명

// ============================================================
section("1. Provider 계약");
// ============================================================
check("출처 코드", kna.SOURCE, "kna");
check("표시 이름", kna.LABEL, "국립수목원");
check("Edge Function 이름", kna.FUNCTION_NAME, "plant-search-kna");
check("매핑이 채워졌다", kna.isReady(), true);

// ============================================================
section("2. mapRow — 확정된 매핑표대로 이름만 바꾼다");
// ============================================================
const m = kna.mapRow(ROW);
// plantScnmId 는 응답에서 **숫자**로 온다 — 문자열로 고정한다.
check("응답의 ID 는 숫자", typeof ROW.plantScnmId, "number");
check("plantScnmId → recordId (문자열)", m.recordId, "1004701");
check("plantSpecsScnm → scientificName", m.scientificName,
      "Pseudostellaria palibiniana (Takeda) Ohwi var. gageodoensis M.Kim & H.Jo");
check("plantGnrlNm → koreanName", m.koreanName, "가거개별꽃");
check("falmKorNm → familyNameKo", m.familyNameKo, "석죽과");
check("falmNm → familyNameLatin", m.familyNameLatin, "Caryophyllaceae");
check("genusKorNm → genusNameKo", m.genusNameKo, "개별꽃속");
check("genusNm → genusNameLatin", m.genusNameLatin, "Pseudostellaria");
check("plantSpecsClsscCdNm → classification", m.classification, "자생식물");
check("stpltScnmRltnCdNm → scientificNameStatus", m.scientificNameStatus, "정명");
check("lastUpdtDtm → sourceUpdatedAt", m.sourceUpdatedAt, "2024/11/12");
// 명명자·변종 표기를 자르지 않는다 — 원문 그대로다.
check("명명자를 자르지 않는다", m.scientificName.includes("(Takeda) Ohwi"), true);
check("변종 표기도 유지", m.scientificName.includes("var. gageodoensis"), true);

// 매핑표에 없는 필드는 가져오지 않는다 — 응답에 있어도 계약 밖이다.
check("상위 분류군은 계약에 없다",
      ["classNm", "ordNm", "phylumNm", "subClassNm"].filter(f => f in m), []);
// 공백만 있는 값은 "없음"이다 (응답의 subClassKorNm 이 " " 로 온다).
check("공백만 있는 값은 null",
      kna.toCandidate(kna.mapRow(ROW), "v").koreanName !== null, true);

// 이명도 버리지 않는다 — 채택 여부는 speciesService 가 정한다.
const syn = kna.mapRow(SYNONYM_ROW);
check("이명도 넘긴다", syn.scientificNameStatus, "이명");
check("이명 행도 ID 를 갖는다", syn.recordId, "1002514");
check("같은 국명에 정명·이명이 함께 온다",
      [kna.mapRow(REAL_ROWS[1]).koreanName, syn.koreanName],
      ["가거꼬리고사리", "가거꼬리고사리"]);

// scnmSearch 는 도감 정보를 주지 않는다. 없는 값을 채우지 않는다.
const cand = kna.toCandidate(m, "2026-09");
for (const f of ["floweringMonthsRaw", "fruitingMonthsRaw", "sunlightRaw",
                 "nativeStatusRaw", "plantTypeRaw", "evergreenRaw", "descriptionRaw"]) {
  check(`${f} 는 비운다 — 이 오퍼레이션이 주지 않는다`, cand[f], null);
}
check("사진도 없다", cand.photosRaw, []);
check("계약 필드만", Object.keys(cand).sort(), [...PLANT_RECORD_FIELDS].sort());

// ============================================================
section("3. recordId 규칙 (P0) — 출처를 되짚을 수 없으면 만들지 않는다");
// ============================================================
check("plantScnmId 없는 행은 해석하지 않는다",
      kna.mapRow({ plantSpecsScnm: "Hydrangea serrata" }), null);
check("빈 plantScnmId 도 마찬가지",
      kna.mapRow({ plantScnmId: "  ", plantSpecsScnm: "x" }), null);
check("행이 아니면 null", kna.mapRow(null), null);
check("학명을 ID 로 쓰지 않는다",
      kna.mapRow({ plantScnmId: "K1", plantSpecsScnm: "S" }).recordId, "K1");

check("recordId 있으면 레코드가 된다",
      kna.toCandidate({ recordId: "K1" }, "2026-09")?.provider,
      { name: "kna", recordId: "K1", version: "2026-09" });
check("recordId 없으면 null", kna.toCandidate({ scientificName: "S" }, "2026-09"), null);
check("빈 문자열도 없는 것", kna.toCandidate({ recordId: "   " }, "2026-09"), null);
check("mapRow 가 null 이면 null", kna.toCandidate(null, "2026-09"), null);
check("객체가 아니어도 안전", kna.toCandidate("K1", "2026-09"), null);

// ============================================================
section("4. 판(version)은 Edge Function 이 준다");
// ============================================================
check("준 판을 그대로 쓴다",
      kna.toCandidate({ recordId: "K1" }, "2026-09").provider.version, "2026-09");
check("판이 없으면 빈 값 — 만들어 내지 않는다",
      kna.toCandidate({ recordId: "K1" }).provider.version, "");
check("mapRow 는 판을 만들지 않는다", "version" in kna.mapRow(ROW), false);
check("행이 판을 들고 와도 무시한다",
      kna.toCandidate({ recordId: "K1", version: "9999-99" }, "2026-09").provider.version,
      "2026-09");
check("행이 출처를 속여도 무시한다",
      kna.toCandidate({ recordId: "K1", provider: { name: "gbif", version: "9" } },
                      "2026-09").provider,
      { name: "kna", recordId: "K1", version: "2026-09" });

// ============================================================
section("5. search() — Edge Function 경로");
// ============================================================
const edge = (rows, version = "2026-09") => ({
  provider: "kna", version, latestVersions: { kna: version }, records: rows
});

let seen = null;
const res = await kna.search("산수국", {
  invoke: async (fn, body) => { seen = { fn, body }; return edge([ROW]); }
});
check("Edge Function 이름으로 부른다", seen.fn, "plant-search-kna");
check("요청 본문은 { query }", seen.body, { query: "산수국" });
check("후보 1건", res.candidates.length, 1);
check("판이 레코드에 실린다", res.candidates[0].provider.version, "2026-09");
check("latestVersions 를 올려 보낸다", res.latestVersions, { kna: "2026-09" });

check("ID 없는 행은 버린다",
      (await kna.search("산수국", {
        invoke: async () => edge([{ plantSpecsScnm: "ID 없음" }, ROW])
      })).candidates.length, 1);
check("records 가 없으면 빈 후보",
      (await kna.search("산수국", { invoke: async () => ({}) })).candidates, []);
check("판이 없으면 빈 값",
      (await kna.search("산수국", {
        invoke: async () => ({ records: [ROW] })
      })).candidates[0].provider.version, "");
check("Edge Function 이 던져도 throw 하지 않는다",
      (await kna.search("산수국", {
        invoke: async () => { throw new Error("502"); }
      })).ok, false);

// ============================================================
section("6. kna_examples — 예시일 뿐 실제 계약이 아니다");
// ============================================================
/**
 * 이 폴더의 파일들은 실제 필드명을 모르던 때 명세를 보고 쓴 것이다.
 * 지금 매핑(plantScnmId 등)으로는 해석되지 않는 게 **맞다.** 그 사실을 여기
 * 고정해 두면, 누군가 이 파일들을 실제 응답 모양으로 바꿨을 때 걸린다.
 */
let examples = [];
try {
  examples = (await readdir(EXAMPLES_DIR)).filter(f => f.endsWith(".json")).sort();
} catch { /* 폴더 없음 */ }
check("예시 3종이 남아 있다", examples.length, 3);

for (const name of examples) {
  const raw = JSON.parse(await readFile(join(EXAMPLES_DIR, name), "utf8"));
  check(`${name} — 예시로 표시돼 있다`, raw._fixture_source, "spec_example");
  const rows = Array.isArray(raw.items) ? raw.items : [];
  check(`${name} — 지금 계약으로는 해석되지 않는다`,
        rows.map(r => kna.mapRow(r)).filter(Boolean).length, 0);
}

// ============================================================
console.log("\n" + "=".repeat(52));
console.log(`통과 ${pass} · 실패 ${fail}`);
if (fail) { console.log("\n실패 항목:"); for (const l of failed) console.log("  ✗ " + l); }
console.log("=".repeat(52));
process.exit(fail ? 1 : 0);
