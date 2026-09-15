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
const { normalizeSunlight, normalizeNativeStatus, normalizeDescription, normalizePhotos,
        normalizeProvider, normalizeMonths, normalizeEvergreen, stripHtml }
  = await import("../services/plantNormalizer.js");
const { CURRENT_SCHEMA_VERSION } = await import("../services/metadataMigration.js");
const { mergePhotos, mergeMetadata, USER_OWNED_FIELDS, FIELD_OWNERSHIP }
  = await import("../services/metadataMerge.js");
const { METADATA_FIELDS } = await import("../js/utils.js");
const NORMALIZER = await import("../services/plantNormalizer.js");
const kna = await import("../services/plantProviders/knaProvider.js");

let pass = 0, fail = 0; const failed = [];
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : (fail++, failed.push(label));
  console.log(`${ok ? "✓" : "✗"} ${label}` +
              (ok ? "" : `\n    기대: ${JSON.stringify(expected)}\n    실제: ${JSON.stringify(actual)}`));
}
function section(t) { console.log(`\n── ${t} ${"─".repeat(Math.max(0, 48 - t.length))}`); }

/**
 * PlantRecord v1.0 — 출처가 말한 **원문 그대로**. 월은 `"6~8월"` 이고 광 조건은
 * `"양지/반음지"` 이며 설명에는 HTML 이 섞여 있다. 이 모양이 정규화를 거치지
 * 않고 들어온다는 것이 계약의 핵심이다.
 */
const REC = {
  recordId: "KNA00012345",
  koreanName: "산수국", scientificName: "Hydrangea serrata",
  family: "Hydrangeaceae", genus: "Hydrangea",
  floweringMonthsRaw: "6~8월", fruitingMonthsRaw: "9~10월",
  sunlightRaw: "양지/반음지", plantTypeRaw: "관목", evergreenRaw: "낙엽",
  nativeStatusRaw: "자생종",
  descriptionRaw: "<p>산지 <b>계곡</b>에 자란다</p>",
  photosRaw: [{ url: "https://x/1.jpg", type: "꽃" }, { url: "https://x/2.jpg", type: "잎" }],
  provider: { name: "kna", recordId: "KNA00012345", version: "2026-09" }
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
section("4-1. Edge Function 응답 계약 — latestVersions");
// ============================================================
/**
 * 응답은 `{ provider, version, latestVersions, records }` 다.
 * `latestVersions` 는 출처별 최신 판이고 전역 기준값이라 식물마다 담지 않는다 —
 * plantService 가 그대로 올려 보내면 호출자가 state 에 한 벌만 둔다.
 */
const VERSIONS = { kna: "2026-09", nire: "2026-08", gbif: "2026-07" };
const versionedProvider = fakeProvider("kna", "국립수목원", {
  ok: true, candidates: [toPlantRecord(REC)], latestVersions: VERSIONS
});
const withVersions = await search("산수국", {
  invoke: async () => ({}), allowRemote: true, providers: [versionedProvider]
});
check("latestVersions 를 그대로 올려 보낸다", withVersions.latestVersions, VERSIONS);
check("후보도 함께 온다", withVersions.candidates.length, 1);

const noVersions = await search("산수국", {
  invoke: async () => ({}), allowRemote: true,
  providers: [fakeProvider("kna", "국립수목원", { ok: true, candidates: [toPlantRecord(REC)] })]
});
check("Provider 가 판을 모르면 null", noVersions.latestVersions, null);

// 캐시가 답하면 판을 알 수 없다 — STALE 은 계산되지 않고 SYNCED 로 남는다.
const cached = await search("산수국", {
  cache: { async lookup() { return [REC]; } }, allowRemote: true, invoke: async () => ({})
});
check("캐시 응답에는 판 정보가 없다", cached.latestVersions, undefined);
check("캐시가 우선한다", cached.source, "cache");

// ============================================================
section("5. PlantRecord 계약");
// ============================================================
const r = toPlantRecord(REC);
check("필드 고정", Object.keys(r).sort(), [...PLANT_RECORD_FIELDS].sort());
// 계약의 핵심 — PlantRecord 는 원문을 나른다. 여기서 변환하면 안 된다.
check("원문을 변환하지 않는다 — 월", r.floweringMonthsRaw, "6~8월");
check("원문을 변환하지 않는다 — 광 조건", r.sunlightRaw, "양지/반음지");
check("원문을 변환하지 않는다 — 자생", r.nativeStatusRaw, "자생종");
check("원문을 변환하지 않는다 — HTML 유지",
      r.descriptionRaw, "<p>산지 <b>계곡</b>에 자란다</p>");
check("사진 타입을 추측하지 않는다", r.photosRaw.map(p => p.type), ["꽃", "잎"]);
check("provider 조립", r.provider, { name: "kna", recordId: "KNA00012345", version: "2026-09" });
check("대표 사진", primaryPhotoUrl(r.photosRaw), "https://x/1.jpg");
check(`사진 최대 ${MAX_PHOTOS}장`,
      toPlantRecord({ photosRaw: Array.from({ length: 9 }, (_, i) => `u${i}`) })
        .photosRaw.length, MAX_PHOTOS);
check("빈 값은 null — 빈 문자열이 아니다", toPlantRecord({ koreanName: "  " }).koreanName, null);
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
check("낙엽 enum", meta.evergreen, "DECIDUOUS");
check("광 조건 배열", meta.sunlight, ["full_sun", "partial_shade"]);
check("사진 배열", meta.photos.length, 2);
check("사진 종류 enum — 정규화 단계에서", meta.photos.map(p => p.type), ["flower", "leaf"]);
check("사진 출처는 Provider 코드", meta.photos.map(p => p.source), ["kna", "kna"]);
check("image_url 은 photos 파생", meta.image_url, "https://x/1.jpg");
check("설명은 평문 구조로", meta.description.summary, "산지 계곡에 자란다");
check("설명 출처는 Provider 라벨", meta.description.source, "국립수목원");
check("자생 enum", meta.nativeStatus, "native");
// PlantRecord v1.0 계약에 없는 필드 — 출처가 주지 않으므로 사람이 입력한다.
check("soil 은 출처가 주지 않는다", meta.soil, "");
check("indoorOutdoor 도 마찬가지", meta.indoorOutdoor, "");
check("출처 코드", meta.plant_api_source, "kna");
check("동기화 시각", meta.plant_api_synced_at, AT);
check("schema_version", meta.schema_version, CURRENT_SCHEMA_VERSION);
check("연동 레코드는 SYNCED", meta.sync_status, "SYNCED");
check("provider 구조", meta.provider,
      { name: "kna", record_id: "KNA00012345", synced_at: AT, version: "2026-09" });
check("plant_api_* 는 provider 파생", meta.plant_api_source, meta.provider.name);

const noSrc = toSpeciesMetadata({ koreanName: "이름만" }, AT);
check("출처 없으면 코드 비움", noSrc.plant_api_source, "");
check("출처 없으면 시각 비움", noSrc.plant_api_synced_at, "");

const patch = toSpeciesPatch(null, REC, AT);
check("학명 → species.latin", patch.latin, "Hydrangea serrata");
check("빈 분류는 출처가 채운다", patch.category, "관목");
check("개화월 정렬", patch.bloomMonths, [6, 7, 8]);
// 사람이 정한 분류는 덮지 않는다 — 화면 분류·필터를 움직이는 값이다.
check("기존 분류는 유지", "category" in toSpeciesPatch({ category: "교목" }, REC, AT), false);
const thin = toSpeciesPatch(null, { koreanName: "이름만" }, AT);
check("빈 학명은 patch 에 없음", "latin" in thin, false);
check("빈 개화월은 patch 에 없음", "bloomMonths" in thin, false);
check("metadata 는 항상 포함", typeof thin.metadata, "object");

// ============================================================
section("6-1. Merge Patch — 동기화가 사용자 데이터를 지우지 않는다");
// ============================================================
/**
 * 국립수목원은 토양·실내외·현장 메모를 모르고, 사용자가 올린 사진도 모른다.
 * metadata 를 통째로 갈아 끼우면 그 전부가 조용히 사라진다 — 에러도 없고
 * 되돌릴 방법도 없다. 그래서 동기화는 교체가 아니라 병합이다.
 */
const EXISTING = toSpeciesMetadata({}, AT);
EXISTING.soil = "배수가 좋은 토양";
EXISTING.indoorOutdoor = "INDOOR";
EXISTING.description = { summary: "예전 설명", source: "사용자", note: "3년생부터 꽃이 잘 핀다" };
EXISTING.photos = [{ url: "https://x/my.jpg", type: "flower", caption: "", source: "user" }];
EXISTING.sync_status = "USER_EDITED";
EXISTING.plant_type = "관목";

const merged = toSpeciesPatch({ metadata: EXISTING }, REC, AT).metadata;
check("토양 보존", merged.soil, "배수가 좋은 토양");
check("실내외 보존", merged.indoorOutdoor, "INDOOR");
check("사용자 메모 보존", merged.description.note, "3년생부터 꽃이 잘 핀다");
check("설명 요약은 출처가 갱신", merged.description.summary, "산지 계곡에 자란다");
check("사용자 사진은 남는다", merged.photos.some(p => p.source === "user"), true);
check("출처 사진도 들어온다", merged.photos.filter(p => p.source === "kna").length, 2);
check("사용자 사진이 대표로 남는다", merged.image_url, "https://x/my.jpg");
check("출처가 아는 값은 갱신", merged.flowering_months, [6, 7, 8]);
check("USER_EDITED 는 최우선", merged.sync_status, "USER_EDITED");
check("동기화 사실은 새 값", merged.plant_api_synced_at, AT);
check("provider 갱신", merged.provider.name, "kna");

// 출처가 모르는 필드는 기존 값을 유지한다 — 빈 값은 "없다"가 아니라 "모른다".
const silent = toSpeciesPatch({ metadata: EXISTING }, { recordId: "K9",
  provider: { name: "kna", recordId: "K9", version: "2026-09" } }, AT).metadata;
check("출처가 말 안 한 분류는 유지", silent.plant_type, "관목");
check("출처가 말 안 한 개화월은 유지", silent.flowering_months, []);
check("사진이 없으면 기존 사진 유지", silent.photos.length, 1);

/**
 * 사진의 "자리" 는 출처 + 종류다. 같은 자리에 새 사진이 오면 URL 이 바뀐
 * 것이므로 옛 URL 은 사라지고, 이번에 오지 않은 자리는 남는다.
 */
const twoSources = { ...EXISTING, photos: [
  { url: "https://x/my.jpg",  type: "flower", caption: "", source: "user" },
  { url: "https://x/old.jpg", type: "flower", caption: "", source: "kna"  },
  { url: "https://x/leaf.jpg", type: "leaf",  caption: "", source: "kna"  },
  { url: "https://x/g.jpg",   type: "flower", caption: "", source: "gbif" }
] };
const rePhoto = mergePhotos(twoSources.photos,
  [{ url: "https://x/new.jpg", type: "flower", caption: "", source: "kna" }], 5);
check("같은 자리는 URL 이 교체된다 — 옛 kna 꽃 제거",
      rePhoto.some(p => p.url === "https://x/old.jpg"), false);
check("오지 않은 자리는 남는다 — kna 잎 유지",
      rePhoto.some(p => p.url === "https://x/leaf.jpg"), true);
check("다른 출처는 건드리지 않는다",
      rePhoto.some(p => p.url === "https://x/g.jpg"), true);
check("사용자 사진은 같은 자리여도 남는다",
      rePhoto.some(p => p.url === "https://x/my.jpg"), true);
check("최종 순서", rePhoto.map(p => p.url),
      ["https://x/my.jpg", "https://x/leaf.jpg", "https://x/g.jpg", "https://x/new.jpg"]);
check("중복 URL 은 한 번만",
      mergePhotos([{ url: "u", source: "user" }], [{ url: "u", source: "kna" }], 5).length, 1);
check("들어온 사진이 없으면 아무것도 지우지 않는다",
      mergePhotos(twoSources.photos, [], 5).length, 4);
check("입력을 변형하지 않는다", twoSources.photos.length, 4);

// 소유권 표가 규칙의 단일 선언이다 — metadata 필드가 표에 빠지면 잡는다.
const declared = new Set(Object.keys(FIELD_OWNERSHIP).filter(f => !f.includes(".")));
check("모든 metadata 필드에 정본이 선언돼 있다",
      METADATA_FIELDS.filter(f => !declared.has(f)), []);
check("표에만 있고 metadata 에 없는 필드도 없다",
      [...declared].filter(f => !METADATA_FIELDS.includes(f)), []);

// 소유권 목록은 계약이다 — 여기 없는 필드는 동기화가 덮는다.
check("사람이 정본인 필드", USER_OWNED_FIELDS, ["soil", "indoorOutdoor"]);
check("빈 기존 값도 안전", mergeMetadata(null, toSpeciesMetadata(REC, AT)).soil, "");
const frozenExisting = Object.freeze({ ...EXISTING });
check("얼린 기존 값 처리",
      mergeMetadata(frozenExisting, toSpeciesMetadata(REC, AT)).soil, "배수가 좋은 토양");
check("병합은 결정적",
      JSON.stringify(mergeMetadata(EXISTING, toSpeciesMetadata(REC, AT))) ===
      JSON.stringify(mergeMetadata(EXISTING, toSpeciesMetadata(REC, AT))), true);

// ============================================================
section("7. 정규화는 한 곳에서만 — Provider 는 원문만 넘긴다");
// ============================================================
check("normalizeSunlight", normalizeSunlight("양지/반음지"), ["full_sun", "partial_shade"]);
check("normalizeNativeStatus", normalizeNativeStatus("귀화종"), "naturalized");
check("HTML 제거", normalizeDescription("<i>가</i>").summary, "가");
check("사진 정규화", normalizePhotos([{ url: "u", type: "수형" }])[0].type, "habit");
check("열매 사진", normalizePhotos([{ url: "u", type: "열매" }])[0].type, "fruit");
check("사진 종류 4종", NORMALIZER.PHOTO_TYPES, ["flower", "leaf", "habit", "fruit"]);
check("모르는 광 조건은 버린다", normalizeSunlight("우주"), []);

// 개화기는 출처가 문장으로 준다 — 범위를 펼치는 일은 정규화가 한다.
check("범위 문자열 → 월 배열", normalizeMonths("6~8월"), [6, 7, 8]);
check("월을 양쪽에 쓴 표기", normalizeMonths("6월~8월"), [6, 7, 8]);
check("붙임표 표기", normalizeMonths("6-8"), [6, 7, 8]);
check("단일 월", normalizeMonths("7월"), [7]);
check("여러 구간", normalizeMonths("4~5월, 9월"), [4, 5, 9]);
check("가운뎃점 표기", normalizeMonths("6·7월"), [6, 7]);
check("가운뎃점 + 범위", normalizeMonths("5·7~9월"), [5, 7, 8, 9]);
check("해를 넘기는 범위", normalizeMonths("12~2월"), [1, 2, 12]);
// 몇 월인지 원문이 말하지 않으면 버린다 — 그럴듯한 달을 채우는 건
// 원본에 없는 데이터를 만드는 일이다.
check("모르는 표기는 버린다 — 봄", normalizeMonths("봄"), []);
check("모르는 표기는 버린다 — 연중", normalizeMonths("연중"), []);
check("모르는 표기는 버린다 — 초여름", normalizeMonths("초여름"), []);
check("모르는 표기는 버린다 — 수시", normalizeMonths("수시"), []);
check("모르는 표기는 버린다 — 정보없음", normalizeMonths("개화기 정보 없음"), []);

/**
 * 근사 표기는 받아들인다. 기준은 "불확실한가" 가 아니라 **"월이 적혀 있는가"** 다.
 * "3월경" 은 날짜가 흐릴 뿐 3월이라고 말하고 있고, 우리가 저장하는 단위는 월이다.
 * "초여름" 은 월 자체가 없다 — 그래서 위에서 버린다.
 */
check("근사 표기 — 3월경", normalizeMonths("3월경"), [3]);
check("근사 표기 — 3월 말", normalizeMonths("3월 말"), [3]);
check("근사 표기 — 3월 중순", normalizeMonths("3월 중순"), [3]);
check("근사 표기 — 3월쯤", normalizeMonths("3월쯤"), [3]);
check("근사 표기가 붙은 범위", normalizeMonths("3월 말~4월 초"), [3, 4]);
// 토큰 전체가 해석돼야 받는다 — 뒷말이 무엇을 한정하는지 알 수 없다.
check("설명이 더 붙으면 버린다", normalizeMonths("6월경 또는 이듬해"), []);
check("월 없는 숫자에는 꼬리표가 붙지 않는다", normalizeMonths("3경"), []);
check("범위 밖은 버린다", normalizeMonths("0~13월"), []);
// 기존 입력 모양은 그대로 동작해야 한다 — 저장된 metadata 가 배열이다.
check("배열은 그대로", normalizeMonths([0, 3, 13, 5]), [3, 5]);
check("숫자 문자열 배열", normalizeMonths(["4", "5"]), [4, 5]);
check("단건 숫자", normalizeMonths(6), [6]);

// ============================================================
section("8. plantNormalizer 는 순수 함수다");
// ============================================================
// 부수효과 API 를 쓰지 않는다 — 쓰면 정규화 결과가 실행 시점에 따라 달라진다.
const src = await (await import("node:fs/promises")).readFile(
  new URL("../services/plantNormalizer.js", import.meta.url), "utf8");
const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
for (const api of ["fetch(", "localStorage", "sessionStorage", "indexedDB",
                   "new Date", "Date.now", "Math.random", "console."]) {
  check(`${api} 를 쓰지 않는다`, codeOnly.includes(api), false);
}

// 같은 입력 → 같은 출력 (여러 번 불러도)
const twice = f => JSON.stringify(f()) === JSON.stringify(f());
check("normalizeSunlight 결정적", twice(() => normalizeSunlight("양지/반음지")), true);
check("normalizePhotos 결정적", twice(() => normalizePhotos([{ url: "u", type: "꽃" }])), true);
check("normalizeProvider 결정적", twice(() => normalizeProvider({ name: "kna" })), true);
check("toPlantRecord 결정적", twice(() => toPlantRecord(REC)), true);

// 입력을 변형하지 않는다
const frozen = Object.freeze({ url: "u", type: "꽃" });
const frozenList = Object.freeze([frozen]);
check("얼린 입력도 처리한다", normalizePhotos(frozenList)[0].url, "u");
const before = JSON.stringify(REC);
toPlantRecord(REC);
check("입력 객체를 바꾸지 않는다", JSON.stringify(REC), before);

// export 된 함수가 전부 순수한지 — 인자만으로 동작
check("normalizeMonths 결정적", twice(() => normalizeMonths("3,4")), true);
check("normalizeEvergreen 결정적", twice(() => normalizeEvergreen("상록")), true);
check("stripHtml 결정적", twice(() => stripHtml("<b>x</b>")), true);
check("export 수", Object.keys(NORMALIZER).length > 0, true);

// ============================================================
console.log("\n" + "=".repeat(52));
console.log(`통과 ${pass} · 실패 ${fail}`);
if (fail) { console.log("\n실패 항목:"); for (const l of failed) console.log("  ✗ " + l); }
console.log("=".repeat(52));
process.exit(fail ? 1 : 0);
