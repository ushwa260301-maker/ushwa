#!/usr/bin/env node
/**
 * knaProvider 회귀 테스트 (T11-3.2).
 *
 *   node species-catalog/tests/providers/knaProvider.mjs
 *
 * 네트워크를 쓰지 않는다. Provider 는 API 를 직접 부르지 않으므로
 * Edge Function 호출자(`invoke`)를 주입하고, 응답은 Fixture 에서 읽는다.
 *
 * ⚠ **Fixture 의 성격** — `tests/fixtures/kna/*.json` 은 국립수목원 OpenAPI
 *   **명세를 기준으로 작성한 것**이고, 실제 서버에서 받아 온 응답이 아니다.
 *   그래서 이 테스트가 통과한다고 실제 API 와 맞는다는 뜻은 아니다. 실제
 *   응답과의 대조는 Edge Function 을 붙이는 T11-4 에서 한다 — 필드명이
 *   다르면 mapRow 와 이 Fixture 를 같이 고친다.
 *
 * 계약
 *   ① Provider 는 **이름만 바꾼다** — 월 배열·enum·HTML·사진 타입을 만들지 않는다
 *   ② recordId 없는 행은 레코드가 되지 않는다 (출처를 되짚을 수 없다)
 *   ③ 판(version)은 Edge Function 이 준다 — Provider 가 만들지 않는다
 *
 * 응답 두 층을 구분한다
 *   Fixture      국립수목원 원응답 모양      { resultCode, resultMsg, items: [...] }
 *   invoke 결과  Edge Function 계약 모양   { provider, version, latestVersions, records }
 *   items → records 변환은 Edge Function 책임이다(T11-4). 여기서는 그 변환을
 *   흉내 내어 search() 를 실제 경로대로 태운다.
 */

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const kna = await import("../../services/plantProviders/knaProvider.js");
const { PLANT_RECORD_FIELDS } = await import("../../services/plantRecord.js");
const { normalizeMonths, normalizeNativeStatus, normalizeSunlight, normalizePhotos }
  = await import("../../services/plantNormalizer.js");

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(HERE, "..", "fixtures", "kna");
const REQUIRED_FIXTURES = [
  "hydrangea-serrata.json",      // 산수국
  "spiraea-prunifolia.json",     // 설유화
  "hydrangea-limelight.json"     // 라임라이트
];

let pass = 0, fail = 0;
const failed = [];
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : (fail++, failed.push(label));
  console.log(`${ok ? "✓" : "✗"} ${label}` +
              (ok ? "" : `\n    기대: ${JSON.stringify(expected)}\n    실제: ${JSON.stringify(actual)}`));
}
function section(t) { console.log(`\n── ${t} ${"─".repeat(Math.max(0, 48 - t.length))}`); }

/** Fixture(원응답) → 행 목록. Edge Function 이 records 로 옮겨 줄 그 배열이다. */
function rowsOf(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.items)) return json.items;       // 국립수목원 원응답
  if (Array.isArray(json?.records)) return json.records;   // Edge Function 계약
  return json && typeof json === "object" ? [json] : [];
}

/** Fixture → Edge Function 이 돌려줄 응답. T11-4 가 실제로 할 변환이다. */
function asEdgeResponse(json, version = "2026-09") {
  return {
    provider: "kna",
    version,
    latestVersions: { kna: version },
    records: rowsOf(json)
  };
}

const readFixture = async name =>
  JSON.parse(await readFile(join(FIXTURE_DIR, name), "utf8"));

// ============================================================
section("1. Provider 계약");
// ============================================================
check("출처 코드", kna.SOURCE, "kna");
check("표시 이름", kna.LABEL, "국립수목원");
check("Edge Function 이름", kna.FUNCTION_NAME, "plant-search-kna");
check("매핑이 채워졌다", kna.isReady(), true);

// ============================================================
section("2. recordId 규칙 (P0) — 출처를 되짚을 수 없으면 만들지 않는다");
// ============================================================
check("recordId 있으면 레코드가 된다",
      kna.toCandidate({ recordId: "KNA00012345" }, "2026-09")?.provider,
      { name: "kna", recordId: "KNA00012345", version: "2026-09" });
check("recordId 없으면 null", kna.toCandidate({ koreanName: "산수국" }, "2026-09"), null);
check("빈 문자열도 없는 것", kna.toCandidate({ recordId: "   " }, "2026-09"), null);
check("mapRow 가 null 이면 null", kna.toCandidate(null, "2026-09"), null);
check("객체가 아니어도 안전", kna.toCandidate("K1", "2026-09"), null);
check("학명만으로는 레코드가 되지 않는다",
      kna.toCandidate({ scientificName: "Hydrangea serrata" }, "2026-09"), null);

// mapRow 쪽도 같은 규칙이다 — plantId 가 없으면 해석하지 않는다.
check("plantId 없는 행은 해석하지 않는다",
      kna.mapRow({ koreanName: "산수국", scientificName: "Hydrangea serrata" }), null);
check("빈 plantId 도 마찬가지", kna.mapRow({ plantId: "  ", koreanName: "산수국" }), null);
check("행이 아니면 null", kna.mapRow(null), null);
check("학명을 ID 로 쓰지 않는다",
      kna.mapRow({ plantId: "K1", scientificName: "Hydrangea serrata" }).recordId, "K1");

// ============================================================
section("3. 판(version)은 Edge Function 이 준다");
// ============================================================
check("준 판을 그대로 쓴다",
      kna.toCandidate({ recordId: "K1" }, "2026-09").provider.version, "2026-09");
check("판이 없으면 빈 값 — 만들어 내지 않는다",
      kna.toCandidate({ recordId: "K1" }).provider.version, "");
check("빈 판도 빈 값", kna.toCandidate({ recordId: "K1" }, "").provider.version, "");
check("mapRow 는 판을 만들지 않는다", "version" in kna.mapRow({ plantId: "K1" }), false);
check("행이 판을 들고 와도 무시한다",
      kna.toCandidate({ recordId: "K1", version: "9999-99" }, "2026-09").provider.version,
      "2026-09");
check("행이 출처를 속여도 무시한다",
      kna.toCandidate({ recordId: "K1", provider: { name: "gbif", version: "9999-99" } },
                      "2026-09").provider,
      { name: "kna", recordId: "K1", version: "2026-09" });

// ============================================================
section("4. 빈 필드 — 지어내지 않는다");
// ============================================================
const bare = kna.toCandidate(kna.mapRow({ plantId: "K1" }), "2026-09");
check("PlantRecord 모양", Object.keys(bare).sort(), [...PLANT_RECORD_FIELDS].sort());
check("사진 없으면 빈 배열", bare.photosRaw, []);
check("개화기 없으면 null", bare.floweringMonthsRaw, null);
check("결실기 없으면 null", bare.fruitingMonthsRaw, null);
check("국명 없으면 null", bare.koreanName, null);
check("설명 없으면 null", bare.descriptionRaw, null);
check("상록성은 비운다 — 출처가 별도로 말하지 않는다", bare.evergreenRaw, null);

// ============================================================
section("5. Fixture — 산수국");
// ============================================================
const serrata = await readFixture("hydrangea-serrata.json");
const sRow = kna.mapRow(rowsOf(serrata)[0]);

check("recordId = plantId", sRow.recordId, "KNA00000012345");
check("국명", sRow.koreanName, "산수국");
check("학명", sRow.scientificName, "Hydrangea serrata (Thunb.) Ser.");
check("과", sRow.family, "Hydrangeaceae");
check("속", sRow.genus, "Hydrangea");
// 원문 보존 — Provider 는 변환하지 않는다.
check("개화기는 원문 그대로", sRow.floweringMonthsRaw, "6~8월");
check("결실기도 원문", sRow.fruitingMonthsRaw, "9~10월");
check("생육환경은 원문", sRow.sunlightRaw, "반그늘");
check("분류는 원문", sRow.plantTypeRaw, "낙엽활엽관목");
check("자생 여부는 원문", sRow.nativeStatusRaw, "자생");
check("사진 2장", sRow.photosRaw.length, 2);
check("사진 타입은 추측하지 않는다", sRow.photosRaw.map(p => p.type), [null, null]);
check("캡션은 원문", sRow.photosRaw.map(p => p.caption), ["꽃", "잎"]);
check("사진 URL", sRow.photosRaw[0].url,
      "https://example.kna.go.kr/images/hydrangea-serrata-flower.jpg");

// 변환은 정규화 계층이 한다 — 여기서 결과가 맞는지만 확인한다.
check("정규화하면 개화월", normalizeMonths(sRow.floweringMonthsRaw), [6, 7, 8]);
check("정규화하면 광 조건", normalizeSunlight(sRow.sunlightRaw), ["partial_shade"]);
check("정규화하면 자생", normalizeNativeStatus(sRow.nativeStatusRaw), "native");
/**
 * ⚠ 사진 종류가 비어 나온다 — 현재 동작을 고정해 둔다.
 *
 * 국립수목원은 종류를 `caption` 에 담는다("꽃" · "잎"). normalizePhotos 는
 * `type` 만 보므로 이 값이 닿지 않는다. mapRow 가 caption 을 type 에 넣는 건
 * 계약 위반이고(Provider 는 추측하지 않는다), normalizePhotos 를 고치려면
 * plantNormalizer 를 건드려야 하는데 이번 티켓에서 금지된 파일이다.
 *
 * 영향: 사진 병합 자리는 (출처, 종류)다. 종류가 전부 빈 값이면 kna 사진이
 * 모두 같은 자리가 되어 갱신 때 서로를 밀어낸다. 별도 판단 필요.
 */
check("현재는 종류를 읽지 못한다",
      normalizePhotos(sRow.photosRaw, 5, "kna").map(p => p.type), ["", ""]);
check("caption 에는 종류가 남아 있다",
      normalizePhotos(sRow.photosRaw, 5, "kna").map(p => p.caption), ["꽃", "잎"]);

const sCand = kna.toCandidate(sRow, "2026-09");
check("PlantRecord 계약 필드만", Object.keys(sCand).sort(), [...PLANT_RECORD_FIELDS].sort());
check("provider 조립", sCand.provider,
      { name: "kna", recordId: "KNA00000012345", version: "2026-09" });

// ============================================================
section("6. Fixture — 설유화 (근사 표기)");
// ============================================================
const spiraea = await readFixture("spiraea-prunifolia.json");
const pRow = kna.mapRow(rowsOf(spiraea)[0]);

check("recordId", pRow.recordId, "KNA00000054321");
check("국명", pRow.koreanName, "설유화");
check("근사 표기도 원문 그대로 넘긴다", pRow.floweringMonthsRaw, "4월경");
// "4월경" 은 날짜가 흐릴 뿐 월은 적혀 있다 — 정규화가 4월로 읽는다.
check("정규화하면 4월", normalizeMonths(pRow.floweringMonthsRaw), [4]);
check("단일 월 결실기", normalizeMonths(pRow.fruitingMonthsRaw), [6]);
check("양지", normalizeSunlight(pRow.sunlightRaw), ["full_sun"]);
check("사진 1장", pRow.photosRaw.length, 1);

// ============================================================
section("7. Fixture — 라임라이트 (사진 없음 · 원예품종)");
// ============================================================
const limelight = await readFixture("hydrangea-limelight.json");
const lRow = kna.mapRow(rowsOf(limelight)[0]);

check("recordId", lRow.recordId, "KNA00000999999");
check("품종명이 붙은 학명도 그대로",
      lRow.scientificName, "Hydrangea paniculata 'Limelight'");
check("사진 없으면 빈 배열", lRow.photosRaw, []);
check("결실기가 null 이면 null", lRow.fruitingMonthsRaw, null);
check("정규화해도 빈 배열", normalizeMonths(lRow.fruitingMonthsRaw), []);
check("원예품종은 원문", lRow.nativeStatusRaw, "원예품종");
check("정규화하면 cultivar", normalizeNativeStatus(lRow.nativeStatusRaw), "cultivar");
check("개화기", normalizeMonths(lRow.floweringMonthsRaw), [7, 8, 9]);

const lCand = kna.toCandidate(lRow, "2026-09");
check("사진 없어도 레코드가 된다", lCand.provider.recordId, "KNA00000999999");
check("사진 없음이 계약을 깨지 않는다", lCand.photosRaw, []);

// ============================================================
section("8. search() — Edge Function 경로");
// ============================================================
let seen = null;
const res = await kna.search("산수국", {
  invoke: async (fn, body) => { seen = { fn, body }; return asEdgeResponse(serrata); }
});
check("Edge Function 이름으로 부른다", seen.fn, "plant-search-kna");
check("요청 본문은 { query }", seen.body, { query: "산수국" });
check("후보를 돌려준다", res.ok, true);
check("후보 1건", res.candidates.length, 1);
check("판을 레코드에 넣는다", res.candidates[0].provider.version, "2026-09");
check("latestVersions 를 올려 보낸다", res.latestVersions, { kna: "2026-09" });

// 판이 없는 응답 — STALE 은 계산되지 않고 SYNCED 로 남는다.
const noVer = await kna.search("산수국", {
  invoke: async () => ({ provider: "kna", records: rowsOf(serrata) })
});
check("판 없으면 빈 값", noVer.candidates[0].provider.version, "");
check("latestVersions 없으면 null", noVer.latestVersions, null);

// recordId 없는 행은 후보에서 빠진다 — 있는 행만 남는다.
const mixed = await kna.search("산수국", {
  invoke: async () => ({ records: [{ koreanName: "ID 없음" }, ...rowsOf(serrata)] })
});
check("ID 없는 행은 버린다", mixed.candidates.length, 1);

check("records 가 없으면 빈 후보",
      (await kna.search("산수국", { invoke: async () => ({}) })).candidates, []);
check("Edge Function 이 던져도 throw 하지 않는다",
      (await kna.search("산수국", { invoke: async () => { throw new Error("502"); } })).ok, false);

// ============================================================
section("9. Fixture 3종이 모두 있다");
// ============================================================
let fixtures = [];
try {
  fixtures = (await readdir(FIXTURE_DIR)).filter(f => f.endsWith(".json")).sort();
} catch { /* 폴더 없음 */ }
check("필수 Fixture", REQUIRED_FIXTURES.filter(f => !fixtures.includes(f)), []);

// 모든 Fixture 가 계약을 만족하는지 한 번 더 훑는다 — 새 Fixture 를 넣어도 걸린다.
for (const name of fixtures) {
  const rows = rowsOf(await readFixture(name));
  const mapped = rows.map(r => kna.mapRow(r)).filter(Boolean);
  check(`${name} — 최소 1건 해석`, mapped.length > 0, true);
  for (const m of mapped) {
    // 원문 운반 — 배열이면 이미 변환한 것이다.
    for (const f of ["floweringMonthsRaw", "fruitingMonthsRaw", "sunlightRaw",
                     "nativeStatusRaw", "plantTypeRaw", "evergreenRaw", "descriptionRaw"]) {
      const v = m[f];
      check(`${name} — ${f} 는 문자열이거나 null`,
            v === null || v === undefined || typeof v === "string", true);
    }
    check(`${name} — 사진 타입을 추측하지 않는다`,
          m.photosRaw.every(p => p.type === null), true);
    check(`${name} — 계약 필드만`,
          Object.keys(kna.toCandidate(m, "v")).sort(), [...PLANT_RECORD_FIELDS].sort());
  }
}

// ============================================================
console.log("\n" + "=".repeat(52));
console.log(`통과 ${pass} · 실패 ${fail}`);
if (fail) { console.log("\n실패 항목:"); for (const l of failed) console.log("  ✗ " + l); }
console.log("=".repeat(52));
process.exit(fail ? 1 : 0);
