#!/usr/bin/env node
/**
 * 식물자원(`15143513`) · 이미지(`15116414`) Provider 회귀 테스트 (T11-6).
 *
 *   node species-catalog/tests/providers/plantResource.mjs
 *
 * 네트워크를 쓰지 않는다. Edge Function 호출자(`invoke`)를 주입한다.
 *
 * ⚠ 이 스위트의 입력은 **캡처된 응답이 아니다.** 확인된 것은 필드 *이름*
 *   목록뿐이고(사용자 제공), 응답 껍데기와 값은 미확인이다. 그래서 여기서
 *   보는 것은 **계약과 경계 처리**이지 실제 응답과 맞는지가 아니다.
 *
 * 계약
 *   ① 2단계 조회 — plantPilbkSearch → plantPilbkNo → plantPilbkInfo
 *   ② source_id 는 plantPilbkNo
 *   ③ 사진은 **학명 완전 일치**로만 붙는다 — 품종에 원종 사진을 달지 않는다
 *   ④ 사진이 없어도 도감 정보는 그대로 들어간다 (photosRaw = [])
 */

const pr  = await import("../../services/plantProviders/plantResourceProvider.js");
const img = await import("../../services/plantProviders/plantImageProvider.js");
const { PLANT_RECORD_FIELDS, toSpeciesMetadata }
  = await import("../../services/plantRecord.js");

let pass = 0, fail = 0; const failed = [];
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : (fail++, failed.push(label));
  console.log(`${ok ? "✓" : "✗"} ${label}` +
              (ok ? "" : `\n    기대: ${JSON.stringify(expected)}\n    실제: ${JSON.stringify(actual)}`));
}
function section(t) { console.log(`\n── ${t} ${"─".repeat(Math.max(0, 48 - t.length))}`); }

/** plantPilbkInfo 가 준다고 확인된 필드들. 값은 예시다. */
const DETAIL = {
  plantPilbkNo: 26281,
  plantGnrlNm: "소나무",
  plantSpecsScnm: "Pinus densiflora Siebold & Zucc.",
  familyNm: "Pinaceae", familyKorNm: "소나무과",
  genusNm: "Pinus", genusKorNm: "소나무속",
  dstrb: "전국 산지",
  orplcNm: "한국",
  shpe: "높이 35m, 지름 1.8m에 달하고 꽃은 5월에 핀다.",
  brdMthdDesc: "실생으로 번식한다.",
  farmSpftDesc: "양지바른 곳을 좋아한다.",
  notRcmmGnrlNm: "솔나무",
  note: "국가표준식물목록 기준",
  grwEvrntDesc: ""
};

const edge = (records, version = "2026-09") => ({
  provider: "kna", version, latestVersions: { kna: version }, records
});

// ============================================================
section("1. Provider 계약");
// ============================================================
check("출처 코드", pr.SOURCE, "kna");
check("Edge Function 이름", pr.FUNCTION_NAME, "plant-resource-kna");
check("검색 오퍼레이션", pr.SEARCH_OP, "plantPilbkSearch");
check("상세 오퍼레이션", pr.DETAIL_OP, "plantPilbkInfo");
check("매핑이 채워졌다", pr.isReady(), true);

// ============================================================
section("2. mapDetailRow — 이름만 바꾼다");
// ============================================================
const m = pr.mapDetailRow(DETAIL);
check("plantPilbkNo → recordId (문자열)", m.recordId, "26281");
check("plantGnrlNm → koreanName", m.koreanName, "소나무");
check("plantSpecsScnm → scientificName", m.scientificName, DETAIL.plantSpecsScnm);
check("familyNm → familyNameLatin", m.familyNameLatin, "Pinaceae");
check("familyKorNm → familyNameKo", m.familyNameKo, "소나무과");
check("genusNm → genusNameLatin", m.genusNameLatin, "Pinus");
check("genusKorNm → genusNameKo", m.genusNameKo, "소나무속");
check("shpe → formRaw", m.formRaw, DETAIL.shpe);
check("dstrb → distributionRaw", m.distributionRaw, "전국 산지");
check("orplcNm → originRaw", m.originRaw, "한국");
check("brdMthdDesc → propagationRaw", m.propagationRaw, "실생으로 번식한다.");
check("farmSpftDesc → cultivationRaw", m.cultivationRaw, "양지바른 곳을 좋아한다.");
check("notRcmmGnrlNm → notRecommendedNameRaw", m.notRecommendedNameRaw, "솔나무");
check("note → sourceNoteRaw", m.sourceNoteRaw, "국가표준식물목록 기준");

// 개화 서술은 formRaw 안에 문장으로 있다 — 월로 뽑지 않는다.
const cand = pr.toCandidate(m, "2026-09");
check("개화기를 문장에서 뽑지 않는다", cand.floweringMonthsRaw, null);
check("생육환경이 빈 값이면 null", cand.growthEnvironmentRaw, null);
check("광 조건도 비운다 — 자연어를 enum 으로 만들지 않는다", cand.sunlightRaw, null);
check("계약 필드만", Object.keys(cand).sort(), [...PLANT_RECORD_FIELDS].sort());

// ============================================================
section("3. source_id 는 plantPilbkNo");
// ============================================================
const meta = toSpeciesMetadata(cand, "2026-09-21T00:00:00.000Z");
check("provider.record_id", meta.provider.record_id, "26281");
check("metadata.source_id", meta.source_id, "26281");
check("과는 학명", meta.family, "Pinaceae");
check("과 국명", meta.family_ko, "소나무과");
check("도감 원문이 guide 에 들어간다", meta.guide.form, DETAIL.shpe);
check("분포도", meta.guide.distribution, "전국 산지");
check("빈 값은 빈 문자열 — 키는 항상 있다", meta.guide.growthEnvironment, "");
check("개화월은 비어 있다", meta.flowering_months, []);

// 도감번호가 없으면 레코드가 되지 않는다.
check("plantPilbkNo 없으면 null", pr.mapDetailRow({ plantGnrlNm: "소나무" }), null);
check("빈 도감번호도 마찬가지", pr.mapDetailRow({ plantPilbkNo: "  " }), null);
check("행이 아니면 null", pr.mapDetailRow(null), null);

// ============================================================
section("4. 2단계 조회");
// ============================================================
const calls = [];
const twoStep = async (fn, body) => {
  calls.push({ fn, ...body });
  if (body.op === pr.SEARCH_OP) return edge([{ plantPilbkNo: 26281 }]);
  return edge([DETAIL]);
};
const found = await pr.search("소나무", { invoke: twoStep });
check("두 번 부른다", calls.length, 2);
check("첫 호출은 검색", [calls[0].op, calls[0].query], [pr.SEARCH_OP, "소나무"]);
check("둘째 호출은 상세", [calls[1].op, calls[1].plantPilbkNo], [pr.DETAIL_OP, "26281"]);
check("후보 1건", found.candidates.length, 1);
check("후보에 도감번호", found.candidates[0].provider.recordId, "26281");

check("검색이 0건이면 상세를 부르지 않는다", await (async () => {
  let n = 0;
  await pr.search("없는식물", { invoke: async (_f, b) => {
    n++; return b.op === pr.SEARCH_OP ? edge([]) : edge([DETAIL]);
  } });
  return n;
})(), 1);

check("검색이 던져도 결과로 돌려준다",
      (await pr.search("소나무", { invoke: async () => { throw new Error("502"); } })).ok, false);
check("상세 한도를 지킨다", await (async () => {
  let details = 0;
  await pr.search("많은결과", {
    maxDetails: 2,
    invoke: async (_f, b) => {
      if (b.op === pr.SEARCH_OP) {
        return edge([1, 2, 3, 4, 5].map(n => ({ plantPilbkNo: n })));
      }
      details++; return edge([{ ...DETAIL, plantPilbkNo: b.plantPilbkNo }]);
    }
  });
  return details;
})(), 2);

// ============================================================
section("5. 사진 — 학명 완전 일치만");
// ============================================================
const SPECIES_NAME = "Hydrangea paniculata Siebold";
const CULTIVAR_NAME = "Hydrangea paniculata 'Limelight'";

const imageRows = [
  { plantSpecsScnm: SPECIES_NAME, imgUrl: "https://x/species-flower.jpg", imgTypeNm: "꽃" },
  { plantSpecsScnm: SPECIES_NAME, imgUrl: "https://x/species-leaf.jpg",   imgTypeNm: "잎" }
];
const imageInvoke = async () => ({ records: imageRows });

check("완전 일치면 붙는다",
      (await img.findPhotos(SPECIES_NAME, { invoke: imageInvoke })).photos.length, 2);
check("일치 여부를 따로 알려 준다",
      (await img.findPhotos(SPECIES_NAME, { invoke: imageInvoke })).matched, true);

/**
 * 품종에 원종 사진을 달지 않는다. 라임라이트는 원종과 꽃 색이 다르고, 현장에서
 * 사진을 보고 수종을 고르는데 그게 다른 식물이면 없는 것보다 나쁘다.
 */
const cultivar = await img.findPhotos(CULTIVAR_NAME, { invoke: imageInvoke });
check("품종에는 원종 사진을 달지 않는다", cultivar.photos, []);
check("일치하지 않았음을 알려 준다", cultivar.matched, false);

check("앞부분만 같아도 안 된다",
      (await img.findPhotos("Hydrangea paniculata", { invoke: imageInvoke })).matched, false);
check("속명만 같아도 안 된다",
      (await img.findPhotos("Hydrangea", { invoke: imageInvoke })).matched, false);
check("대소문자가 다르면 다른 이름",
      img.isExactMatch("Pinus densiflora", "pinus densiflora"), false);
check("연속 공백은 정리한다",
      img.isExactMatch("Pinus  densiflora", "Pinus densiflora"), true);
check("앞뒤 공백도 정리한다",
      img.isExactMatch("  Pinus densiflora  ", "Pinus densiflora"), true);
check("빈 이름은 일치가 아니다", img.isExactMatch("", ""), false);

check("이름이 없으면 조회하지 않는다",
      (await img.findPhotos("", { invoke: async () => { throw new Error("불렸다"); } })).matched,
      false);
check("조회가 던져도 결과로 돌려준다",
      (await img.findPhotos("X", { invoke: async () => { throw new Error("502"); } })).ok, false);

// 사진 종류는 캡션으로 넘기고 판정은 normalizePhotos 가 한다.
const one = await img.findPhotos(SPECIES_NAME, { invoke: imageInvoke });
check("타입을 추측하지 않는다", one.photos.map(p => p.type), [null, null]);
check("캡션은 원문", one.photos.map(p => p.caption), ["꽃", "잎"]);

// ============================================================
section("6. 사진이 없어도 도감 정보는 들어간다");
// ============================================================
const withPhotos = await img.attachPhotos(cand, { invoke: imageInvoke });
check("학명이 다르면 원본 그대로", withPhotos.photosRaw, []);

const pine = { ...cand, scientificName: SPECIES_NAME };
const attached = await img.attachPhotos(pine, { invoke: imageInvoke });
check("일치하면 사진이 붙는다", attached.photosRaw.length, 2);
check("다른 필드는 그대로", attached.formRaw, cand.formRaw);

const metaNoPhoto = toSpeciesMetadata(cand, "2026-09-21T00:00:00.000Z");
check("사진이 없어도 SYNCED", metaNoPhoto.sync_status, "SYNCED");
check("사진이 없어도 도감 원문은 있다", metaNoPhoto.guide.form, DETAIL.shpe);
check("photos 는 빈 배열", metaNoPhoto.photos, []);
check("대표 이미지도 빈 값", metaNoPhoto.image_url, "");

const metaWithPhoto = toSpeciesMetadata(attached, "2026-09-21T00:00:00.000Z");
check("사진이 있으면 종류가 붙는다", metaWithPhoto.photos.map(p => p.type), ["flower", "leaf"]);
check("사진 출처는 kna", metaWithPhoto.photos.map(p => p.source), ["kna", "kna"]);
check("대표 이미지가 생긴다", metaWithPhoto.image_url, "https://x/species-flower.jpg");

// ============================================================
console.log("\n" + "=".repeat(52));
console.log(`통과 ${pass} · 실패 ${fail}`);
if (fail) { console.log("\n실패 항목:"); for (const l of failed) console.log("  ✗ " + l); }
console.log("=".repeat(52));
process.exit(fail ? 1 : 0);
