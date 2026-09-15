#!/usr/bin/env node
/**
 * plantService · Provider 계층 회귀 테스트 (T10).
 *
 *   node species-catalog/tests/plant-service.mjs
 *
 * 네트워크를 쓰지 않는다 — Edge Function 호출자(`invoke`)를 주입한다.
 *
 * 계약
 *   ① 사용자 경로는 **외부 API 를 부르지 않는다** (캐시 전용이 기본)
 *   ② 캐시 → kna → nire → gbif 순으로 내려간다
 *   ③ 매핑이 비면 조회하지 않는다 — 추측으로 후보를 만들지 않는다
 *   ④ Provider 를 바꿔도 결과는 PlantRecord 한 모양이다
 */

const { search, providerLabel, PROVIDERS } = await import("../services/plantService.js");
const { toPlantRecord, toSpeciesMetadata, toSpeciesPatch, emptyRecord, primaryPhotoUrl,
        MAX_PHOTOS, PLANT_RECORD_FIELDS } = await import("../services/plantRecord.js");
const { normalizeSunlight, normalizeNativeStatus, normalizeDescription, normalizePhotos }
  = await import("../services/plantNormalizer.js");
const kna = await import("../services/plantProviders/knaProvider.js");

let pass = 0, fail = 0; const failed = [];
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : (fail++, failed.push(label));
  console.log(`${ok ? "✓" : "✗"} ${label}` +
              (ok ? "" : `\n    기대: ${JSON.stringify(expected)}\n    실제: ${JSON.stringify(actual)}`));
}
function section(t) { console.log(`\n── ${t} ${"─".repeat(Math.max(0, 48 - t.length))}`); }

const REC = {
  source: "kna", sourceId: "KNA00012345",
  koreanName: "산수국", scientificName: "Hydrangea serrata",
  family: "Hydrangeaceae", genus: "Hydrangea",
  floweringMonths: [6, 7, 8], fruitingMonths: [9, 10],
  sunlight: "양지/반음지", soil: "습윤", plantType: "관목", evergreen: false,
  nativeStatus: "자생종",
  description: "<p>산지 <b>계곡</b>에 자란다</p>",
  photos: [{ url: "https://x/1.jpg", type: "꽃" }, { url: "https://x/2.jpg", type: "잎" }]
};

// 테스트용 Provider — 계약만 따르면 무엇이든 꽂을 수 있음을 보인다.
const fakeProvider = (code, label, result) => ({
  SOURCE: code, LABEL: label, async search() { return result; }
});

// ============================================================
section("1. 사용자 경로 — 외부 API 를 부르지 않는다");
// ============================================================
let invoked = 0;
const countingInvoke = async () => { invoked++; return { items: [] }; };

const userPath = await search("산수국", { invoke: countingInvoke });
check("allowRemote 기본값은 캐시 전용", userPath.cacheOnly, true);
check("외부 호출 0회", invoked, 0);
check("ok = true (실패가 아니다)", userPath.ok, true);
check("후보 없음", userPath.candidates, []);

// ============================================================
section("2. 캐시 우선");
// ============================================================
const cache = {
  async lookup(q) { return q === "산수국" ? [REC] : []; },
  async store() { this.stored = true; }
};
const hit = await search("산수국", { cache, allowRemote: true, invoke: countingInvoke });
check("캐시에서 답한다", hit.source, "cache");
check("후보 1건", hit.candidates.length, 1);
check("캐시 적중 시 외부 호출 안 함", invoked, 0);
check("캐시도 PlantRecord 모양으로", Object.keys(hit.candidates[0]).sort(),
      [...PLANT_RECORD_FIELDS].sort());

const cacheBoom = { async lookup() { throw new Error("cache down"); } };
const stillOk = await search("산수국", { cache: cacheBoom, allowRemote: false });
check("캐시 실패해도 던지지 않는다", stillOk.ok, true);

// ============================================================
section("3. Provider 폴백 순서");
// ============================================================
const providers = [
  fakeProvider("kna",  "국립수목원",     { ok: false, notConfigured: true }),
  fakeProvider("nire", "국립생물자원관", { ok: true, candidates: [] }),
  fakeProvider("gbif", "GBIF",           { ok: true, candidates: [toPlantRecord({ ...REC, source: "gbif" })] })
];
const fell = await search("산수국", { allowRemote: true, invoke: countingInvoke, providers });
check("마지막 Provider 까지 내려간다", fell.source, "gbif");
check("후보 확보", fell.candidates.length, 1);

const firstWins = await search("산수국", {
  allowRemote: true, invoke: countingInvoke,
  providers: [
    fakeProvider("kna", "국립수목원", { ok: true, candidates: [toPlantRecord(REC)] }),
    fakeProvider("nire", "국립생물자원관", { ok: true, candidates: [toPlantRecord({ ...REC, source: "nire" })] })
  ]
});
check("앞 Provider 가 답하면 멈춘다", firstWins.source, "kna");

const storeCache = { async lookup() { return []; }, async store(q, recs) { this.q = q; this.n = recs.length; } };
await search("산수국", { cache: storeCache, allowRemote: true, invoke: countingInvoke, providers });
check("결과를 캐시에 적재", storeCache.q, "산수국");
check("적재 건수", storeCache.n, 1);

const allDown = await search("산수국", {
  allowRemote: true, invoke: countingInvoke,
  providers: [fakeProvider("kna", "국립수목원", { ok: false, error: "500" })]
});
check("전부 실패해도 던지지 않는다", allDown.ok, true);
check("문제를 보고한다", allDown.problems, ["국립수목원: 500"]);

const noInvoke = await search("산수국", { allowRemote: true });
check("invoke 없으면 실패로 표면화", noInvoke.ok, false);

check("빈 검색어", await search("   ", { allowRemote: true, invoke: countingInvoke }),
      { ok: true, source: "none", candidates: [] });

// ============================================================
section("4. 매핑 미설정 — 추측하지 않는다");
// ============================================================
check("kna 매핑 아직 비어 있음", kna.isReady(), false);
const knaRes = await kna.search("산수국", { invoke: countingInvoke });
check("notConfigured", knaRes.notConfigured, true);
check("후보를 만들지 않는다", knaRes.candidates, undefined);

const realAll = await search("산수국", { allowRemote: true, invoke: countingInvoke });
check("실 Provider 3종 전부 미설정", realAll.notConfigured, true);
check("실 Provider 는 3종", PROVIDERS.length, 3);
check("출처 라벨", providerLabel("kna"), "국립수목원");
check("모르는 코드", providerLabel("zzz"), "zzz");

// ============================================================
section("5. PlantRecord 계약");
// ============================================================
const r = toPlantRecord(REC);
check("필드 고정", Object.keys(r).sort(), [...PLANT_RECORD_FIELDS].sort());
check("Provider 원문이 enum 으로 정규화된다", r.sunlight, ["full_sun", "partial_shade"]);
check("자생 enum", r.nativeStatus, "native");
check("설명은 평문 구조로", r.description.summary, "산지 계곡에 자란다");
check("사진 종류 enum", r.photos.map(p => p.type), ["flower", "leaf"]);
check("대표 사진", primaryPhotoUrl(r.photos), "https://x/1.jpg");
check(`사진 최대 ${MAX_PHOTOS}장`,
      toPlantRecord({ photos: Array.from({ length: 9 }, (_, i) => `u${i}`) }).photos.length, MAX_PHOTOS);
check("photoUrls 로 들어와도 받는다",
      toPlantRecord({ photoUrls: ["https://x/a.jpg"] }).photos[0].url, "https://x/a.jpg");
check("월 범위 밖 제거", toPlantRecord({ floweringMonths: [0, 6, 13] }).floweringMonths, [6]);
check("계약 밖 키는 버린다", toPlantRecord({ ...REC, evil: 1 }).evil, undefined);
check("null 안전", toPlantRecord(null), emptyRecord());

// ============================================================
section("6. Species 반영 — 빈 값으로 덮지 않는다");
// ============================================================
const AT = "2026-09-15T07:30:00.000Z";
const meta = toSpeciesMetadata(REC, AT);
check("학명", meta.scientific_name, "Hydrangea serrata");
check("과·속", [meta.family, meta.genus], ["Hydrangeaceae", "Hydrangea"]);
check("개화월", meta.flowering_months, [6, 7, 8]);
check("결실월", meta.fruiting_months, [9, 10]);
check("낙엽", meta.evergreen, false);
check("광 조건 배열", meta.sunlight, ["full_sun", "partial_shade"]);
check("사진 배열", meta.photos.length, 2);
check("image_url 은 photos 파생", meta.image_url, "https://x/1.jpg");
check("설명 출처는 Provider 라벨", toSpeciesMetadata({ ...REC, descriptionSource: "국립수목원" }, AT).description.source, "국립수목원");
check("출처 코드", meta.plant_api_source, "kna");
check("동기화 시각", meta.plant_api_synced_at, AT);

const noSrc = toSpeciesMetadata({ koreanName: "이름만" }, AT);
check("출처 없으면 코드 비움", noSrc.plant_api_source, "");
check("출처 없으면 시각 비움", noSrc.plant_api_synced_at, "");

const patch = toSpeciesPatch(REC, AT);
check("학명 → species.latin", patch.latin, "Hydrangea serrata");
check("분류 → species.category", patch.category, "관목");
check("개화월 정렬", patch.bloomMonths, [6, 7, 8]);
const thin = toSpeciesPatch({ koreanName: "이름만" }, AT);
check("빈 학명은 patch 에 없음", "latin" in thin, false);
check("빈 개화월은 patch 에 없음", "bloomMonths" in thin, false);
check("metadata 는 항상 포함", typeof thin.metadata, "object");

// ============================================================
section("7. 정규화는 한 곳에서만 — Provider 는 원문만 넘긴다");
// ============================================================
check("normalizeSunlight", normalizeSunlight("양지/반음지"), ["full_sun", "partial_shade"]);
check("normalizeNativeStatus", normalizeNativeStatus("귀화종"), "naturalized");
check("HTML 제거", normalizeDescription("<i>가</i>").summary, "가");
check("사진 정규화", normalizePhotos([{ url: "u", type: "수형" }])[0].type, "habit");
check("모르는 광 조건은 버린다", normalizeSunlight("우주"), []);

// ============================================================
console.log("\n" + "=".repeat(52));
console.log(`통과 ${pass} · 실패 ${fail}`);
if (fail) { console.log("\n실패 항목:"); for (const l of failed) console.log("  ✗ " + l); }
console.log("=".repeat(52));
process.exit(fail ? 1 : 0);
