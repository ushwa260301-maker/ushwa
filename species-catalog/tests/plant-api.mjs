#!/usr/bin/env node
/**
 * plantApi 회귀 테스트 — 국가 식물 DB 조회 서비스 (Ticket S2-002 · 1단계).
 *
 *   node species-catalog/tests/plant-api.mjs
 *
 * 네트워크를 쓰지 않는다. `fetchImpl` 을 주입해 응답을 흉내낸다.
 *
 * ⚠ 여기 쓰인 응답 모양은 **실제 국립수목원 API 의 스키마가 아니다.**
 *   매핑이 설정으로 분리돼 있다는 것, 그리고 매핑이 주어지면 정확히 그대로
 *   읽는다는 것만 검증한다. 실제 필드명은 검증된 샘플을 받은 뒤
 *   `services/plantApiConfig.js` 에 채운다.
 */

const {
  searchPlants, toPlantRecord, toSpeciesMetadata, toSpeciesPatch,
  isPlantApiConfigured, pluck, toArray, buildUrl,
  PLANT_RECORD_FIELDS, MAX_PHOTOS
} = await import("../services/plantApi.js");

let pass = 0, fail = 0;
const failed = [];
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : (fail++, failed.push(label));
  console.log(`${ok ? "✓" : "✗"} ${label}` +
              (ok ? "" : `\n    기대: ${JSON.stringify(expected)}\n    실제: ${JSON.stringify(actual)}`));
}
function section(t) { console.log(`\n── ${t} ${"─".repeat(Math.max(0, 50 - t.length))}`); }

// 테스트용 매핑 — 실제 API 스키마가 아니라 임의의 모양이다.
const MAP = {
  apiId:          "id",
  koreanName:     "kor",
  scientificName: "sci",
  bloomMonths:    "bloom",
  plantType:      "type",
  sunlight:       "light",
  indoorOutdoor:  "place",
  evergreen:      "leaf",
  nativeStatus:   "origin",
  description:    "desc",
  photoUrls:      "images"
};
const RESULT_PATH = "body.items";

const fakeFetch = (payload, { status = 200, delayMs = 0 } = {}) => async () => {
  if (delayMs) await new Promise(r => setTimeout(r, delayMs));
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
};

// ============================================================
section("1. 설정 미완 — 조회하지 않는다");
// ============================================================
check("커밋된 기본 설정은 미완", isPlantApiConfigured(), false);

const notConf = await searchPlants("설유화", { fieldMap: {}, endpoint: "", resultPath: "" });
check("notConfigured 반환", notConf.notConfigured, true);
check("ok = false", notConf.ok, false);
check("추측으로 후보를 만들지 않는다", notConf.candidates, undefined);

const noMap = await searchPlants("설유화",
  { endpoint: "https://x/api", resultPath: RESULT_PATH, fieldMap: {}, fetchImpl: fakeFetch({}) });
check("매핑만 비어도 조회 안 함", noMap.notConfigured, true);

// ============================================================
section("2. 매핑대로 읽는다 — 그 이상은 읽지 않는다");
// ============================================================
const raw = {
  id: "KNA-001", kor: "설유화", sci: "Spiraea thunbergii",
  bloom: [3, 4, 5], type: "관목", light: "양지", place: "실외",
  leaf: "낙엽", origin: "외래종", desc: "이른 봄 흰 꽃이 피는 관목",
  images: ["https://x/1.jpg", "https://x/2.jpg"],
  // 매핑에 없는 필드 — 무시돼야 한다
  someOtherField: "무시됨", fruit: [9, 10]
};
const rec = toPlantRecord(raw, MAP, {});
check("apiId", rec.apiId, "KNA-001");
check("국명", rec.koreanName, "설유화");
check("학명", rec.scientificName, "Spiraea thunbergii");
check("개화월", rec.bloomMonths, [3, 4, 5]);
check("분류", rec.plantType, "관목");
check("양지성", rec.sunlight, "양지");
check("실내외", rec.indoorOutdoor, "실외");
check("상록/낙엽", rec.evergreen, "낙엽");
check("자생", rec.nativeStatus, "외래종");
check("설명", rec.description, "이른 봄 흰 꽃이 피는 관목");
check("사진", rec.photoUrls, ["https://x/1.jpg", "https://x/2.jpg"]);
check("매핑 없는 결실월은 빈 배열", rec.fruitMonths, []);
check("레코드 필드 수 고정", Object.keys(rec).sort(), [...PLANT_RECORD_FIELDS].sort());
check("응답의 다른 필드가 새지 않는다", rec.someOtherField, undefined);

// ============================================================
section("3. 값이 없을 때 — 지어내지 않는다");
// ============================================================
const sparse = toPlantRecord({ id: "KNA-002", kor: "라임라이트" }, MAP, {});
check("없는 학명은 빈 문자열", sparse.scientificName, "");
check("없는 개화월은 빈 배열", sparse.bloomMonths, []);
check("없는 사진은 빈 배열", sparse.photoUrls, []);
check("있는 값은 그대로", sparse.koreanName, "라임라이트");
check("null 레코드도 던지지 않는다", toPlantRecord(null, MAP, {}).koreanName, "");

// ============================================================
section("4. 값 정규화");
// ============================================================
check("개화월 범위 밖은 버린다",
      toPlantRecord({ bloom: [0, 3, 13, 5] }, MAP, {}).bloomMonths, [3, 5]);
check("개화월 문자열도 숫자로",
      toPlantRecord({ bloom: ["4", "5"] }, MAP, {}).bloomMonths, [4, 5]);
check("단건도 배열로", toPlantRecord({ images: "https://x/only.jpg" }, MAP, {}).photoUrls,
      ["https://x/only.jpg"]);
check(`사진은 최대 ${MAX_PHOTOS}장`,
      toPlantRecord({ images: Array.from({ length: 9 }, (_, i) => `u${i}`) }, MAP, {}).photoUrls.length,
      MAX_PHOTOS);
check("공백 값은 빈 문자열", toPlantRecord({ kor: "   " }, MAP, {}).koreanName, "");

// 파서 주입 — 원문 문자열을 앱 값으로 바꾸는 자리
const parsed = toPlantRecord({ bloom: "4~6월" }, MAP,
  { bloomMonths: v => (String(v).match(/(\d+)~(\d+)/) || []).slice(1, 3).length
      ? Array.from({ length: Number(RegExp.$2) - Number(RegExp.$1) + 1 }, (_, i) => Number(RegExp.$1) + i)
      : [] });
check("파서가 원문을 월 배열로", parsed.bloomMonths, [4, 5, 6]);
check("파서가 던져도 결과는 빈 값",
      toPlantRecord({ kor: "x" }, MAP, { koreanName: () => { throw new Error("boom"); } }).koreanName, "");

// ============================================================
section("5. 검색 — 성공 / 실패 / 타임아웃");
// ============================================================
const okRes = await searchPlants("설유화", {
  endpoint: "https://x/api", resultPath: RESULT_PATH, fieldMap: MAP, parsers: {},
  fetchImpl: fakeFetch({ body: { items: [raw] } })
});
check("ok = true", okRes.ok, true);
check("후보 1건", okRes.candidates.length, 1);
check("후보 내용", okRes.candidates[0].koreanName, "설유화");

const single = await searchPlants("라임라이트", {
  endpoint: "https://x/api", resultPath: RESULT_PATH, fieldMap: MAP,
  fetchImpl: fakeFetch({ body: { items: { id: "KNA-003", kor: "라임라이트" } } })
});
check("단건 응답도 배열로", single.candidates.length, 1);

const emptyQ = await searchPlants("   ", { endpoint: "https://x/api", resultPath: RESULT_PATH, fieldMap: MAP });
check("빈 검색어 → 조회 안 하고 빈 결과", emptyQ, { ok: true, candidates: [] });

const http500 = await searchPlants("설유화", {
  endpoint: "https://x/api", resultPath: RESULT_PATH, fieldMap: MAP,
  fetchImpl: fakeFetch({}, { status: 500 })
});
check("HTTP 실패 표면화", http500.httpStatus, 500);
check("던지지 않는다", http500.ok, false);

const boom = await searchPlants("설유화", {
  endpoint: "https://x/api", resultPath: RESULT_PATH, fieldMap: MAP,
  fetchImpl: async () => { throw new Error("network down"); }
});
check("네트워크 오류 표면화", boom.error, "network down");
check("던지지 않는다", boom.ok, false);

const slow = await searchPlants("설유화", {
  endpoint: "https://x/api", resultPath: RESULT_PATH, fieldMap: MAP, timeoutMs: 30,
  fetchImpl: async (url, { signal }) => new Promise((resolve, reject) => {
    const t = setTimeout(() => resolve({ ok: true, status: 200, json: async () => ({}) }), 500);
    signal?.addEventListener("abort", () => { clearTimeout(t); reject(Object.assign(new Error("aborted"), { name: "AbortError" })); });
  })
});
check("타임아웃 표면화", slow.timeout, true);

const wrongPath = await searchPlants("설유화", {
  endpoint: "https://x/api", resultPath: "no.such.path", fieldMap: MAP,
  fetchImpl: fakeFetch({ body: { items: [raw] } })
});
check("경로가 틀리면 빈 후보 (조용히 성공하지 않음)", wrongPath.candidates, []);

// ============================================================
section("6. Species 반영 — 빈 값으로 덮지 않는다");
// ============================================================
const SYNC_AT = "2026-09-15T00:00:00.000Z";
const meta = toSpeciesMetadata(rec, SYNC_AT);
check("표시 필드 반영", meta.sunlight, "양지");
check("연결 id", meta.plant_api_id, "KNA-001");
check("출처 기록", meta.plant_api_source, "국립수목원");
check("동기화 시각", meta.plant_api_synced_at, SYNC_AT);

// apiId 가 없는 레코드 — 연결로 취급하지 않는다
const noId = toPlantRecord({ kor: "이름만" }, MAP, {});
const metaNoId = toSpeciesMetadata(noId, SYNC_AT);
check("apiId 없으면 출처도 비움", metaNoId.plant_api_source, "");
check("apiId 없으면 시각도 비움", metaNoId.plant_api_synced_at, "");

const patch = toSpeciesPatch(rec, SYNC_AT);
check("학명은 species.latin 으로", patch.latin, "Spiraea thunbergii");
check("분류는 species.category 로", patch.category, "관목");
check("개화월은 정렬해서", patch.bloomMonths, [3, 4, 5]);
check("사진 포함", patch.photoUrls.length, 2);

const sparsePatch = toSpeciesPatch(sparse, SYNC_AT);
check("빈 학명은 patch 에 없음 (기존 값 보존)", "latin" in sparsePatch, false);
check("빈 개화월은 patch 에 없음", "bloomMonths" in sparsePatch, false);
check("빈 사진은 patch 에 없음", "photoUrls" in sparsePatch, false);
check("metadata 는 항상 포함", typeof sparsePatch.metadata, "object");

// ============================================================
section("7. URL 조립");
// ============================================================
check("검색어 인코딩", buildUrl("https://x/api", "설유화", ""),
      "https://x/api?q=" + encodeURIComponent("설유화"));
check("키가 있으면 붙인다", buildUrl("https://x/api", "a", "K1"), "https://x/api?q=a&serviceKey=K1");
check("키가 없으면 안 붙인다 (프록시 방식)", buildUrl("https://x/api", "a", ""), "https://x/api?q=a");
check("쿼리가 이미 있으면 &", buildUrl("https://x/api?v=1", "a", ""), "https://x/api?v=1&q=a");

// ============================================================
section("8. 유틸");
// ============================================================
check("pluck 중첩", pluck({ a: { b: { c: 1 } } }, "a.b.c"), 1);
check("pluck 없는 경로", pluck({ a: 1 }, "a.b.c"), undefined);
check("pluck null 안전", pluck(null, "a"), undefined);
check("toArray null", toArray(null), []);
check("toArray 단건", toArray(1), [1]);
check("toArray 배열", toArray([1, 2]), [1, 2]);

// ============================================================
console.log("\n" + "=".repeat(52));
console.log(`통과 ${pass} · 실패 ${fail}`);
if (fail) { console.log("\n실패 항목:"); for (const l of failed) console.log("  ✗ " + l); }
console.log("=".repeat(52));
process.exit(fail ? 1 : 0);
