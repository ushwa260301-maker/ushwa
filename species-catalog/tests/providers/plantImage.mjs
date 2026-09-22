#!/usr/bin/env node
/**
 * plantImageProvider 회귀 테스트 (T11-6.1).
 *
 *   node species-catalog/tests/providers/plantImage.mjs
 *
 * 네트워크를 쓰지 않는다. Provider 는 Supabase 를 모르고 조회자(`select`)를
 * 주입받으므로, 여기서는 가짜 테이블 하나로 전부 검사한다.
 *
 * ## 이 파일이 지키려는 사실
 *
 * 사진의 연결 고리는 **학명 문자열뿐**이다. 도감과 이미지 목록을 잇는 공통 ID
 * 가 없어서, 일치 규칙이 느슨해지는 순간 품종에 원종 사진이 붙는다. 그래서
 * 아래 검사의 절반은 "붙는다"가 아니라 **"붙지 않는다"** 를 고정한다.
 *
 * ## 적재 쪽도 같이 본다
 *
 * `tests/import-plant-images.mjs` 의 정규화가 Provider 와 어긋나면 `eq` 가
 * 조용히 0건이 된다 — 에러도 없이 사진만 사라지는 종류의 버그다.
 * 두 규칙이 같은 함수인지 여기서 고정한다.
 */

import fs from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const img = await import("../../services/plantProviders/plantImageProvider.js");
const sn  = await import("../../services/scientificName.js");
const imp = await import("../import-plant-images.mjs");
const { toPlantRecord } = await import("../../services/plantRecord.js");
const { toSpeciesMetadata } = await import("../../services/plantRecord.js");

const HERE = dirname(fileURLToPath(import.meta.url));

let pass = 0, fail = 0; const failed = [];
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : (fail++, failed.push(label));
  console.log(`${ok ? "✓" : "✗"} ${label}` +
              (ok ? "" : `\n    기대: ${JSON.stringify(expected)}\n    실제: ${JSON.stringify(actual)}`));
}
function section(t) { console.log(`\n── ${t} ${"─".repeat(Math.max(0, 48 - t.length))}`); }

// ------------------------------------------------------------
// 가짜 plant_images 테이블 — 컬럼명은 마이그레이션 SQL 과 같다.
// ------------------------------------------------------------
const SPECIES  = "Hydrangea paniculata Siebold";
const CULTIVAR = "Hydrangea paniculata 'Limelight'";
const PINE     = "Pinus densiflora Siebold & Zucc.";

const TABLE_ROWS = [
  { scientific_name: SPECIES,  korean_name: "나무수국", image_type: "꽃",
    image_url: "https://x/hp-flower.jpg" },
  { scientific_name: SPECIES,  korean_name: "나무수국", image_type: "잎",
    image_url: "https://x/hp-leaf.jpg" },
  { scientific_name: SPECIES,  korean_name: "나무수국", image_type: "열매",
    image_url: "https://x/hp-fruit.jpg" },
  { scientific_name: CULTIVAR, korean_name: "라임라이트", image_type: "꽃",
    image_url: "https://x/limelight-flower.jpg" },
  { scientific_name: PINE,     korean_name: "소나무",   image_type: "수피",
    image_url: "https://x/pine-bark.jpg" }
];

/** `eq` 만 흉내 낸다 — 부분 일치를 흉내 내면 테스트가 실제보다 관대해진다. */
const calls = [];
const select = async name => {
  calls.push(name);
  return TABLE_ROWS.filter(r => r.scientific_name === name);
};

// ============================================================
section("1. 컬럼 매핑");
// ============================================================
check("테이블 컬럼 이름", img.COLUMNS,
      "scientific_name, korean_name, image_type, image_url");
check("테이블 이름", img.TABLE, "plant_images");

check("image_url → url · image_type → type · korean_name → caption",
      img.mapTableRow(TABLE_ROWS[0]),
      { url: "https://x/hp-flower.jpg", type: "꽃", caption: "나무수국" });

check("URL 이 비면 항목을 만들지 않는다",
      img.mapTableRow({ ...TABLE_ROWS[0], image_url: "" }), null);
check("URL 이 공백뿐이어도 만들지 않는다",
      img.mapTableRow({ ...TABLE_ROWS[0], image_url: "   " }), null);
check("행이 아니면 null", img.mapTableRow(null), null);

// URL 을 손대지 않는다 — 재인코딩하면 원본과 다른 주소가 된다.
const RAW_URL = "https://x/사진/가거개별꽃 (1).jpg?v=2&a=b";
check("URL 을 변형하지 않는다",
      img.mapTableRow({ ...TABLE_ROWS[0], image_url: ` ${RAW_URL} ` }).url, RAW_URL);

check("학명은 테이블 컬럼에서 읽는다", img.scientificNameOf(TABLE_ROWS[0]), SPECIES);

// ============================================================
section("2. 완전 일치만 — 붙는다");
// ============================================================
const pine = await img.findPhotos(PINE, { select });
check("완전 일치 사진 1장", pine.photos.length, 1);
check("그 1장의 내용", pine.photos[0],
      { url: "https://x/pine-bark.jpg", type: "수피", caption: "소나무" });
check("일치했음을 알려 준다", pine.matched, true);

const many = await img.findPhotos(SPECIES, { select });
check("여러 장이면 배열로 전부", many.photos.length, 3);
check("순서는 조회 순서 그대로",
      many.photos.map(p => p.type), ["꽃", "잎", "열매"]);

check("조회는 정규화된 학명 하나로만 한다", calls.at(-1), SPECIES);
check("앞뒤 공백은 조회 전에 정리한다", await (async () => {
  await img.findPhotos(`  ${PINE}  `, { select });
  return calls.at(-1);
})(), PINE);
check("연속 공백도 정리한다", await (async () => {
  await img.findPhotos("Pinus  densiflora Siebold &  Zucc.", { select });
  return calls.at(-1);
})(), "Pinus densiflora Siebold & Zucc.");

// ============================================================
section("3. 완전 일치만 — 붙지 않는다");
// ============================================================
/**
 * 라임라이트는 흰 꽃이 연두로 물드는 품종이라 원종과 생김새가 다르다.
 * 현장에서 사진을 보고 수종을 고르는데 그게 다른 식물이면 없는 것보다 나쁘다.
 */
const missing = await img.findPhotos("Hydrangea paniculata", { select });
check("미일치 0장", missing.photos, []);
check("일치하지 않았음을 알려 준다", missing.matched, false);

check("속명만 같아도 안 된다",
      (await img.findPhotos("Hydrangea", { select })).matched, false);
check("품종명을 떼고 찾지 않는다",
      (await img.findPhotos(CULTIVAR, { select })).photos.map(p => p.url),
      ["https://x/limelight-flower.jpg"]);
check("대소문자가 다르면 다른 이름",
      img.isExactMatch("Pinus densiflora", "pinus densiflora"), false);
check("빈 이름은 일치가 아니다", img.isExactMatch("", ""), false);

check("이름이 없으면 조회하지 않는다",
      (await img.findPhotos("", { select: async () => { throw new Error("불렸다"); } })).matched,
      false);
check("조회자가 없으면 조용히 0장",
      await img.findPhotos(PINE, {}), { ok: true, photos: [], matched: false });
check("조회가 던져도 결과로 돌려준다",
      (await img.findPhotos(PINE, { select: async () => { throw new Error("502"); } })).ok, false);

/**
 * `eq` 로 걸러 오더라도 응답을 그대로 믿지 않는다. 조회자가 like 로 바뀌거나
 * 뷰가 끼어들어 유사 행이 섞여 와도, 붙는 것은 완전 일치뿐이어야 한다.
 */
const loose = async () => TABLE_ROWS;      // 전부 돌려주는 헐거운 조회자
check("헐거운 조회자가 섞어 와도 완전 일치만 남는다",
      (await img.findPhotos(PINE, { select: loose })).photos.map(p => p.url),
      ["https://x/pine-bark.jpg"]);

// ============================================================
section("4. 중복 제거 · 한도");
// ============================================================
const dupRows = [
  TABLE_ROWS[0],
  { ...TABLE_ROWS[0] },                                   // 같은 URL 재등장
  { ...TABLE_ROWS[1] },
  { ...TABLE_ROWS[0], image_type: "꽃(접사)" }             // 종류만 다른 같은 URL
];
const dup = await img.findPhotos(SPECIES, { select: async () => dupRows });
check("중복 제거 — 같은 URL 은 한 번만", dup.photos.map(p => p.url),
      ["https://x/hp-flower.jpg", "https://x/hp-leaf.jpg"]);
check("먼저 온 행의 종류를 유지한다", dup.photos[0].type, "꽃");

const manyRows = Array.from({ length: 9 }, (_, i) =>
  ({ scientific_name: PINE, korean_name: "소나무", image_type: "꽃",
     image_url: `https://x/p${i}.jpg` }));
check("기본 한도는 5장",
      (await img.findPhotos(PINE, { select: async () => manyRows })).photos.length, 5);
check("한도는 넘겨받는다",
      (await img.findPhotos(PINE, { select: async () => manyRows, max: 2 })).photos.length, 2);

// ============================================================
section("5. 조회 SQL 은 속명으로 후보만 받는다");
// ============================================================
/**
 * canonical 을 DB 가 모르므로 `eq` 로는 걸 수 없다. 속명 접두사로 후보를 받고
 * 판정은 JS 가 한다 — `like` 는 후보를 **넓히기만** 하고 어느 행이 붙을지
 * 정하지 않는다. 호출된 연산자를 그대로 받아 고정한다.
 */
const ops = [];
const fakeClient = {
  from(table) {
    ops.push(["from", table]);
    const q = {
      select(cols) { ops.push(["select", cols]); return q; },
      like(col, val) { ops.push(["like", col, val]); return Promise.resolve({ data: [TABLE_ROWS[4]] }); },
      eq(col, val) { ops.push(["eq", col, val]); return q; },
      ilike() { ops.push(["ilike"]); return q; },
      contains() { ops.push(["contains"]); return q; }
    };
    return q;
  }
};
const rows = await img.selectFromSupabase(fakeClient)(PINE);
check("연산자는 from · select · like 뿐",
      ops.map(o => o[0]), ["from", "select", "like"]);
check("like 는 속명 접두사만", [ops[2][1], ops[2][2]], ["scientific_name", "Pinus%"]);
check("select 는 컬럼을 명시한다", ops[1][1], img.COLUMNS);
check("행을 그대로 돌려준다", rows, [TABLE_ROWS[4]]);

/** 명명자가 붙어 와도 속명은 같으므로 같은 후보 집합을 받는다. */
check("명명자가 있어도 같은 접두사", await (async () => {
  ops.length = 0;
  await img.selectFromSupabase(fakeClient)("Pinus densiflora Siebold & Zucc.");
  return ops[2][2];
})(), "Pinus%");

check("이름이 없으면 조회하지 않는다 (SQL)", await (async () => {
  ops.length = 0;
  const r = await img.selectFromSupabase(fakeClient)("   ");
  return [ops.length, r];
})(), [0, []]);

check("조회 오류는 던진다", await (async () => {
  const errClient = { from: () => ({ select: () => ({
    like: () => Promise.resolve({ error: { message: "permission denied" } }) }) }) };
  try { await img.selectFromSupabase(errClient)(PINE); return "안 던짐"; }
  catch (e) { return e.message; }
})(), "permission denied");

// ============================================================
section("6. attachPhotos — 못 찾아도 도감 정보는 남는다");
// ============================================================
const CAND = toPlantRecord({
  koreanName: "소나무", scientificName: PINE,
  formRaw: "높이 35m", distributionRaw: "전국",
  provider: { name: "kna", recordId: "26281", version: "" }
});

const attached = await img.attachPhotos(CAND, { select });
check("일치하면 사진이 붙는다", attached.photosRaw.length, 1);
check("다른 필드는 그대로", attached.formRaw, CAND.formRaw);

const noMatch = await img.attachPhotos(
  { ...CAND, scientificName: "Nothing exists" }, { select });
check("못 찾으면 photosRaw 는 빈 배열", noMatch.photosRaw, []);
check("못 찾아도 도감 원문은 그대로", noMatch.formRaw, CAND.formRaw);
check("조회가 던져도 원본을 돌려준다",
      (await img.attachPhotos(CAND, { select: async () => { throw new Error("502"); } })).photosRaw,
      []);

// ============================================================
section("7. metadata 까지 — 종류는 여기서 판정된다");
// ============================================================
const AT = "2026-09-21T00:00:00.000Z";
const metaWith = toSpeciesMetadata(await img.attachPhotos(
  { ...CAND, scientificName: SPECIES }, { select }), AT);
check("이미지 종류 원문이 flower/leaf 로 판정된다",
      metaWith.photos.map(p => p.type), ["flower", "leaf", "fruit"]);
check("캡션은 국명", metaWith.photos.map(p => p.caption),
      ["나무수국", "나무수국", "나무수국"]);
check("사진 출처는 kna", [...new Set(metaWith.photos.map(p => p.source))], ["kna"]);
check("대표 이미지가 생긴다", metaWith.image_url, "https://x/hp-flower.jpg");

// "수피" 는 PHOTO_TYPES 에 없다 — 모르는 것을 flower 로 만들지 않는다.
const metaBark = toSpeciesMetadata(await img.attachPhotos(CAND, { select }), AT);
check("모르는 종류는 빈 값으로 둔다", metaBark.photos.map(p => p.type), [""]);
check("그래도 사진 자체는 남는다", metaBark.photos.length, 1);

const metaNone = toSpeciesMetadata(CAND, AT);
check("사진이 없어도 SYNCED", metaNone.sync_status, "SYNCED");
check("사진이 없어도 도감 원문은 있다", metaNone.guide.form, "높이 35m");
check("photos 는 빈 배열", metaNone.photos, []);

// ============================================================
section("8. 과거 Edge Function 경로는 살아 있다");
// ============================================================
/** `providers/plantResource.mjs` 가 이 모양에 걸려 있다 — 함께 깨지지 않게 고정. */
const legacyInvoke = async () => ({ records: [
  { plantSpecsScnm: SPECIES, imgUrl: "https://x/legacy-flower.jpg", imgTypeNm: "꽃" }
] });
const legacy = await img.findPhotos(SPECIES, { invoke: legacyInvoke });
check("invoke 경로도 완전 일치만", legacy.photos.length, 1);
check("invoke 경로는 캡션으로만 준다", legacy.photos[0],
      { url: "https://x/legacy-flower.jpg", caption: "꽃", type: null });
check("select 가 있으면 그쪽을 쓴다",
      (await img.findPhotos(PINE, { select, invoke: async () => { throw new Error("불렸다"); } }))
        .photos.map(p => p.caption), ["소나무"]);

// ============================================================
section("9. 적재 — CSV 파싱");
// ============================================================
check("BOM 을 떼어 낸다", imp.stripBom("﻿학명"), "학명");
check("BOM 이 없으면 그대로", imp.stripBom("학명"), "학명");

check("기본 파싱", imp.parseCsv("a,b\n1,2"), [["a", "b"], ["1", "2"]]);
check("CRLF", imp.parseCsv("a,b\r\n1,2\r\n"), [["a", "b"], ["1", "2"]]);
check("빈 줄은 행이 아니다", imp.parseCsv("a,b\n\n1,2\n\n"), [["a", "b"], ["1", "2"]]);

/** URL 이나 캡션에 쉼표가 들어오면 split 은 행을 통째로 민다. */
check("따옴표 안의 쉼표",
      imp.parseCsv('a,b\n"x,y",2'), [["a", "b"], ["x,y", "2"]]);
check("따옴표 안의 줄바꿈",
      imp.parseCsv('a,b\n"x\ny",2'), [["a", "b"], ["x\ny", "2"]]);
check("이중 따옴표는 리터럴",
      imp.parseCsv('a\n"say ""hi"""'), [["a"], ['say "hi"']]);
check("빈 칸", imp.parseCsv("a,b,c\n1,,3"), [["a", "b", "c"], ["1", "", "3"]]);

// ============================================================
section("10. 적재 — 헤더를 넘겨짚지 않는다");
// ============================================================
const KO_HEADER = ["학명", "국명", "이미지종류", "이미지파일경로"];
check("한글 헤더를 맞춘다", imp.resolveHeaders(KO_HEADER).map,
      { scientific_name: 0, korean_name: 1, image_type: 2, image_url: 3 });
check("BOM 붙은 첫 헤더도 맞춘다",
      imp.resolveHeaders(["﻿학명", "국명", "이미지종류", "이미지파일경로"]).missing, []);
check("순서가 달라도 맞춘다",
      imp.resolveHeaders(["이미지파일경로", "학명", "이미지종류", "국명"]).map.scientific_name, 1);
check("앞뒤 공백은 흡수한다",
      imp.resolveHeaders([" 학명 ", "국명 ", " 이미지종류", "이미지파일경로 "]).missing, []);

// Supabase 적재용으로 내보낸 파일은 헤더가 영문이다 — 이쪽도 확인된 이름이다.
check("영문 헤더도 확인된 이름이다",
      imp.resolveHeaders(["scientific_name", "korean_name", "image_type", "image_url"]).map,
      { scientific_name: 0, korean_name: 1, image_type: 2, image_url: 3 });

/**
 * 비슷해 보이는 헤더를 넓게 받지 않는다. 다른 파일을 잘못 넣었을 때 그것이
 * **적재에 성공해 버리는** 쪽이 실패하는 쪽보다 나쁘다.
 */
check("확인된 이름이 아니면 받지 않는다",
      imp.resolveHeaders(["scnm", "plantGnrlNm", "imgTypeNm", "imgUrl"]).missing,
      imp.COLUMNS);

const unknown = imp.resolveHeaders(["A", "B", "C", "D"]);
check("모르는 헤더는 추측하지 않는다", unknown.missing, imp.COLUMNS);
check("실제 헤더를 그대로 알려 준다", unknown.headers, ["A", "B", "C", "D"]);
check("--map 으로 지정하면 쓴다",
      imp.resolveHeaders(["A", "B", "C", "D"],
        { A: "scientific_name", B: "korean_name", C: "image_type", D: "image_url" }).missing, []);

// ============================================================
section("11. 적재 — 행 변환");
// ============================================================
const MAP = { scientific_name: 0, korean_name: 1, image_type: 2, image_url: 3 };
const DATA = [
  ["  Pinus  densiflora  ", "소나무", "수피", " https://x/pine-bark.jpg "],
  ["Hydrangea paniculata Siebold", "나무수국", "꽃", "https://x/hp-flower.jpg"],
  ["Nothing here", "없음", "꽃", ""],                       // URL 없음 → skip
  ["", "이름없음", "꽃", "https://x/orphan.jpg"],            // 학명 없음 → skip
  ["Pinus densiflora f. erecta", "금강소나무", "수피", "https://x/pine-bark.jpg"]  // 같은 URL 다른 학명
];
const { rows: built, skipped } = imp.toRows(DATA, MAP);

check("적재 행 수", built.length, 3);
check("학명은 공백만 정리한다", built[0].scientific_name, "Pinus densiflora");
check("URL 은 앞뒤 공백만 뗀다", built[0].image_url, "https://x/pine-bark.jpg");
check("source 기본값", built[0].source, "KNA_IMAGE_CSV");
check("나머지는 원문", [built[0].korean_name, built[0].image_type], ["소나무", "수피"]);

check("빈 URL 행은 건너뛴다", skipped.map(s => s.reason), ["URL 없음", "학명 없음"]);
check("건너뛴 줄 번호를 남긴다", skipped.map(s => s.at), [4, 5]);

check("학명이 다르면 같은 URL 이어도 별개 행",
      built.filter(r => r.image_url === "https://x/pine-bark.jpg").length, 2);

const dupData = [
  ["Pinus densiflora", "소나무", "수피", "https://x/a.jpg"],
  ["Pinus  densiflora", "소나무", "꽃", "https://x/a.jpg"]    // 정규화하면 같은 PK
];
const dupBuilt = imp.toRows(dupData, MAP);
check("중복 제거 — 같은 (학명, URL) 은 한 번만", dupBuilt.rows.length, 1);
check("중복 사유를 남긴다", dupBuilt.skipped[0].reason, "중복");

// ============================================================
section("12. 적재 정규화 = 조회 정규화");
// ============================================================
/**
 * 두 규칙이 어긋나면 `eq` 가 조용히 0건이 된다 — 에러 없이 사진만 사라진다.
 * 같은 입력에 같은 답을 내는지 여기서 고정한다.
 */
for (const s of ["  Pinus densiflora  ", "Pinus  densiflora", "Hydrangea paniculata 'Limelight'",
                 "Abies × koreana", ""]) {
  check(`정규화 일치: ${JSON.stringify(s)}`,
        imp.normalizeScientificName(s), img.normalizeScientificName(s));
}
/**
 * 운영 조회자는 **속명으로 후보를 받는다.** 여기서도 그렇게 흉내 내야
 * Provider 의 판정을 시험하는 것이 된다 — 가짜가 이름으로 먼저 거르면
 * 가짜를 시험하는 꼴이 된다.
 */
const genusSelect = rowsIn => async name => {
  const g = sn.genusOf(name);
  return rowsIn.filter(r => String(r.scientific_name).startsWith(g));
};

check("명명자가 붙은 이름으로도 적재 행에 걸린다", await (async () => {
  const loaded = imp.toRows(DATA, MAP).rows;      // scientific_name = "Pinus densiflora"
  const found = await img.findPhotos("Pinus densiflora Siebold & Zucc.",
                                     { select: genusSelect(loaded) });
  return found.photos.map(p => p.url);
})(), ["https://x/pine-bark.jpg"]);

check("같은 속의 다른 종에는 붙지 않는다", await (async () => {
  const loaded = imp.toRows(DATA, MAP).rows;
  const found = await img.findPhotos("Pinus koraiensis Siebold & Zucc.",
                                     { select: genusSelect(loaded) });
  return found.matched;
})(), false);

check("적재한 학명 그대로면 걸린다", await (async () => {
  const loaded = imp.toRows(DATA, MAP).rows;
  const found = await img.findPhotos("Pinus  densiflora", {
    select: async n => loaded.filter(r => r.scientific_name === n)
  });
  return found.photos.map(p => p.url);
})(), ["https://x/pine-bark.jpg"]);

// ============================================================
section("13. 적재 — upsert SQL");
// ============================================================
const sql = imp.toSql(built.slice(0, 1));
check("테이블과 충돌 키", [
  sql.includes("insert into public.plant_images"),
  sql.includes("on conflict (scientific_name, image_url) do update")
], [true, true]);
check("created_at 은 갱신하지 않는다", sql.includes("created_at"), false);
check("작은따옴표를 이스케이프한다",
      imp.toSql([{ scientific_name: "O'Brien", korean_name: "", image_type: "",
                   image_url: "https://x/a.jpg", source: "KNA_IMAGE_CSV" }])
        .includes("'O''Brien'"), true);
check("배치로 끊는다",
      imp.toSql(Array.from({ length: 5 }, (_, i) => ({
        scientific_name: `S${i}`, korean_name: "", image_type: "",
        image_url: `https://x/${i}.jpg`, source: "KNA_IMAGE_CSV"
      })), 2).split("insert into").length - 1, 3);

// ============================================================
section("14. 마이그레이션 SQL 과 코드가 같은 것을 말하는가");
// ============================================================
const MIGRATION = await readFile(
  join(HERE, "..", "..", "supabase", "2026-09-21_plant_images.sql"), "utf8");
for (const col of ["scientific_name", "korean_name", "image_type", "image_url", "source"]) {
  check(`SQL 에 ${col} 이 있다`, MIGRATION.includes(col), true);
}
check("PK 가 (scientific_name, image_url)",
      MIGRATION.includes("primary key (scientific_name, image_url)"), true);
check("학명 인덱스가 있다",
      MIGRATION.includes("idx_plant_images_scientific_name"), true);
check("RLS 가 켜져 있다",
      MIGRATION.includes("alter table public.plant_images enable row level security"), true);
check("DELETE 정책은 만들지 않는다",
      /create policy[^;]*for delete[^;]*plant_images/i.test(MIGRATION), false);
check("schema.sql 을 건드리지 않는다",
      /alter table public\.(species|invoices|invoice_items|suppliers)/i.test(MIGRATION), false);

// ============================================================
section("15. 실제 CSV — 확인된 헤더와 행");
// ============================================================
/**
 * `fixtures/kna/plant_images-sample.csv` 는 원본 CSV 에서 확인된 헤더 1줄과
 * 행 2줄이다(2026-09-21 확인). 지어낸 입력이 아니라서 아래 검사는 실제
 * 파일이 이 코드를 통과하는지를 본다.
 */
const SAMPLE = await readFile(
  join(HERE, "..", "fixtures", "kna", "plant_images-sample.csv"), "utf8");
const real = imp.prepare(SAMPLE);

check("확인된 헤더가 그대로 맞는다", real.missing, []);
check("헤더 4개", real.headers, ["학명", "국명", "이미지종류", "이미지파일경로"]);
check("데이터 2행이 전부 적재된다", [real.total, real.rows.length, real.skipped.length],
      [2, 2, 0]);

check("첫 행", real.rows[0], {
  scientific_name: "Stipa tenuissima Trin.",
  korean_name: "가는잎나래새",
  image_type: "사진",
  image_url: "http://www.nature.go.kr/fileUpload/stplt/scnm/image/common/Stipa_tenuissima_1K.JPG",
  source: "KNA_IMAGE_CSV"
});

// 품종명의 작은따옴표는 학명의 일부다 — 떼거나 바꾸지 않는다.
check("품종 작은따옴표를 보존한다", real.rows[1].scientific_name,
      "Spiraea thunbergii 'Mount Fuji'");
check("국명의 작은따옴표도 보존한다", real.rows[1].korean_name,
      "가는잎조팝나무 '마운트 후지'");
check("작은따옴표가 SQL 에서 이스케이프된다",
      imp.toSql([real.rows[1]]).includes("'Spiraea thunbergii ''Mount Fuji'''"), true);

// URL 은 http:// 다. 바꾸지 않는다 — 원본이 준 주소가 정답이다.
check("URL 을 https 로 올리지 않는다", real.rows[1].image_url.startsWith("http://"), true);
check("URL 의 하이픈·언더스코어를 건드리지 않는다", real.rows[1].image_url,
      "http://www.nature.go.kr/fileUpload/stplt/scnm/image/common/" +
      "Spiraea_thunbergii_-Mount_Fuji-_1L.JPG");

check("BOM 이 붙어 와도 같은 결과", imp.prepare("﻿" + SAMPLE).rows, real.rows);

// 적재된 모양 그대로 조회에 건다.
const realSelect = async n => real.rows.filter(r => r.scientific_name === n);
check("품종은 품종 사진만 찾는다",
      (await img.findPhotos("Spiraea thunbergii 'Mount Fuji'", { select: realSelect }))
        .photos.map(p => p.url), [real.rows[1].image_url]);
check("원종 이름으로는 품종 사진이 붙지 않는다",
      (await img.findPhotos("Spiraea thunbergii", { select: realSelect })).matched, false);
check("캡션은 국명",
      (await img.findPhotos("Stipa tenuissima Trin.", { select: realSelect }))
        .photos[0].caption, "가는잎나래새");

/**
 * ⚠ 이 목록의 `이미지종류` 는 "사진" 이다 — 꽃·잎 같은 **부위 분류가 아니다.**
 * 그래서 photoType 이 판정하지 못하고 `type` 은 빈 값으로 남는다. 모르는 것을
 * flower 로 만들지 않는 것이 맞으므로 고치지 않고, 그 사실을 여기 고정한다.
 */
const realMeta = toSpeciesMetadata(await img.attachPhotos(
  { ...CAND, scientificName: "Stipa tenuissima Trin." }, { select: realSelect }), AT);
check("이미지종류 '사진' 은 부위로 판정되지 않는다", realMeta.photos.map(p => p.type), [""]);
check("판정이 안 돼도 사진은 남는다", realMeta.photos.map(p => p.url), [real.rows[0].image_url]);
check("대표 이미지도 그대로", realMeta.image_url, real.rows[0].image_url);

// ============================================================
section("16. 대조 검증 — 표기 차이를 겹으로 좁힌다");
// ============================================================
/**
 * `verify-plant-images.mjs` 는 CSV 와 `species` 를 대조해 보고서를 낸다.
 * 그 숫자로 판단이 내려지므로, 어떤 차이를 어떻게 부르는지 고정해 둔다.
 *
 * ⚠ 여기서 "느슨히 맞았다" 고 해서 사진이 붙지는 않는다 — 연결은 언제나
 *   완전 일치다. 이 대조는 **왜 안 붙는지** 를 설명하기 위한 것이다.
 */
const vf = await import("../verify-plant-images.mjs");

const SP = [
  { id: "sp-001", name: "가는잎나래새",   latin: "Stipa tenuissima" },
  { id: "sp-002", name: "가는잎조팝나무", latin: "Spiraea thunbergii" },
  { id: "sp-003", name: "소나무",        latin: "Pinus densiflora" },
  { id: "sp-004", name: "단풍나무",       latin: "Acer  palmatum" },   // 연속 공백
  { id: "sp-005", name: "수국",          latin: "Hydrangea macrophylla" },
  { id: "sp-006", name: "구상나무",       latin: "Abies × koreana" },
  { id: "sp-007", name: "상수리나무",     latin: "Quercus acutissima" },
  { id: "sp-008", name: "이름만",        latin: "" }
];
const row = (n, t = "사진", u = `http://www.nature.go.kr/${n}.JPG`) =>
  ({ scientific_name: n, korean_name: "x", image_type: t, image_url: u, source: "KNA_IMAGE_CSV" });

const CMP = vf.compare([
  row("Pinus densiflora"),
  row("Acer palmatum"),
  row("Acer palmatum", "꽃", "https://cdn.example.com/a2.JPG"),
  row("Stipa tenuissima Trin."),
  row("Spiraea thunbergii 'Mount Fuji'"),
  row("HYDRANGEA MACROPHYLLA"),
  row("Abies x koreana"),
  row("ZZZ nonexistens")
], SP);

check("완전 일치는 Provider 와 같은 규칙", CMP.exact.map(e => e.name).sort(),
      ["Acer palmatum", "Pinus densiflora"]);
check("공백 정리가 기여한 몫을 따로 센다", CMP.whitespaceHelped, 1);
check("latin 이 빈 행은 대조에서 뺀다", CMP.species.noLatin, 1);

const diffOf = n => CMP.nearMiss.find(m => m.csv === n)?.diff;
check("저자명 차이", diffOf("Stipa tenuissima Trin."), "명명자");
check("품종명은 저자명으로 겹쳐 세지 않는다",
      diffOf("Spiraea thunbergii 'Mount Fuji'"), "품종명");
check("전부 대문자는 판정을 미룬다", diffOf("HYDRANGEA MACROPHYLLA"),
      "전부 대문자 — 표기를 먼저 고쳐야 판정할 수 있음");
check("교배종 기호 차이", diffOf("Abies x koreana"), "명명자 · 교배종 기호");
check("연결된 species 를 함께 알려 준다",
      CMP.nearMiss.find(m => m.csv === "Stipa tenuissima Trin.").speciesId, "sp-001");

check("어떤 겹으로도 안 맞으면 CSV 전용", CMP.onlyCsv, ["ZZZ nonexistens"]);
check("느슨히 맞은 것은 species 전용에서 뺀다",
      CMP.onlySpecies.map(s => s.id), ["sp-007"]);

check("한 학명에 여러 URL 을 센다", CMP.csv.multi, [{ name: "Acer palmatum", count: 2 }]);
check("image_type 분포", CMP.csv.typeCount, { "사진": 7, "꽃": 1 });
check("http · https 를 나눠 센다", [CMP.url.http, CMP.url.https], [7, 1]);
check("nature.go.kr 외 호스트를 집계한다", CMP.url.offsiteHosts, { "cdn.example.com": 1 });

const BAD = vf.compare([row("Pinus densiflora", "사진", "ftp://x/a.JPG")], SP);
check("http(s) 가 아니면 형식 이상", BAD.url.other, ["ftp://x/a.JPG"]);

/**
 * 앱의 `내보내기` 버튼이 주는 파일을 그대로 먹어야 한다
 * (`importExport.exportJson(state.data)` → `{categories, colors, species, invoices, …}`).
 * 검증용 파일을 따로 만들지 않기 위한 조건이라, 모양이 바뀌면 여기서 걸린다.
 */
const APP_EXPORT = {
  categories: ["교목"], colors: ["흰색"],
  species: [
    { id: "sp-001", name: "소나무", latin: "Pinus densiflora", bloomMonths: [4],
      metadata: { schema_version: 2, sync_status: "PENDING", photos: [] } },
    { id: "sp-002", name: "이름만", latin: "" },
    { id: "sp-003", name: "라틴없음" }                       // latin 키 자체가 없음
  ],
  invoices: [{ id: "inv-001" }], invoiceItems: [{ id: "it-001" }]
};
const EXPORT_FILE = join(HERE, "..", "..", "..", ".tmp-app-export.json");
fs.writeFileSync(EXPORT_FILE, JSON.stringify(APP_EXPORT), "utf8");
try {
  const loaded = vf.speciesFromFile(EXPORT_FILE);
  check("앱 내보내기 파일을 그대로 읽는다", loaded.length, 3);
  check("id · name · latin 만 뽑는다", loaded[0], { id: "sp-001", name: "소나무", latin: "Pinus densiflora" });
  check("latin 키가 없어도 빈 문자열", loaded[2].latin, "");
  check("그 파일로 대조가 돈다",
        vf.compare([row("Pinus densiflora")], loaded).exact.length, 1);
} finally { fs.rmSync(EXPORT_FILE, { force: true }); }

check("배열만 든 파일도 받는다", await (async () => {
  fs.writeFileSync(EXPORT_FILE, JSON.stringify(APP_EXPORT.species), "utf8");
  try { return vf.speciesFromFile(EXPORT_FILE).length; }
  finally { fs.rmSync(EXPORT_FILE, { force: true }); }
})(), 3);

/** `species` 에 `scientific_name` 컬럼은 없다 — 대조 키는 `latin` 이다. */
const SCHEMA = await readFile(
  join(HERE, "..", "..", "supabase", "schema.sql"), "utf8");
const SPECIES_DDL = SCHEMA.slice(SCHEMA.indexOf("create table if not exists public.species"));
check("species 에 scientific_name 컬럼은 없다",
      /^\s*scientific_name\s/m.test(SPECIES_DDL.slice(0, SPECIES_DDL.indexOf(");"))), false);
check("species 에 metadata 컬럼도 없다",
      /^\s*metadata\s/m.test(SPECIES_DDL.slice(0, SPECIES_DDL.indexOf(");"))), false);
check("학명은 latin 컬럼",
      /^\s*latin\s+text/m.test(SPECIES_DDL.slice(0, SPECIES_DDL.indexOf(");"))), true);

// ============================================================
section("17. canonical — 명명자는 떼고 품종은 남긴다");
// ============================================================
/**
 * 실측에서 정확 매칭이 0건이었던 이유가 명명자다. 이 절이 그 처리를 고정한다.
 * 가장 중요한 단언은 "붙는다" 가 아니라 **품종이 원종으로 뭉치지 않는다** 이다.
 */
const CANON = [
  ["Stipa tenuissima Trin.",                       "Stipa tenuissima"],
  ["Pinus densiflora Siebold & Zucc.",             "Pinus densiflora"],
  ["Lavandula angustifolia Mill.",                 "Lavandula angustifolia"],
  ["Hibiscus syriacus L.",                         "Hibiscus syriacus"],
  ["Acer palmatum var. dissectum (Thunb.) K.Koch", "Acer palmatum var. dissectum"],
  ["Abies x koreana E.H.Wilson",                   "Abies × koreana"],
  ["Abies × koreana",                              "Abies × koreana"],
  ["Prunus × yedoensis Matsum.",                   "Prunus × yedoensis"],
  ["Spiraea thunbergii 'Mount Fuji'",              "Spiraea thunbergii 'Mount Fuji'"],
  ["Hosta 'Frances Williams'",                     "Hosta 'Frances Williams'"],
  ["Rhododendron schlippenbachii Maxim.",          "Rhododendron schlippenbachii"],
  ["  Cornus   officinalis  ",                     "Cornus officinalis"],
  ["Cornus officinalis",                           "Cornus officinalis"]
];
for (const [raw, want] of CANON) {
  check(`canonical: ${raw}`, sn.canonicalScientificName(raw), want);
}

/** 명명자 뒤에 품종이 오는 표기 — 순서대로 훑으면 품종을 잃는다. */
check("명명자 뒤의 품종도 지킨다",
      sn.canonicalScientificName("Spiraea thunbergii Siebold ex Blume 'Mount Fuji'"),
      "Spiraea thunbergii 'Mount Fuji'");
check("빈 이름은 빈 canonical", sn.canonicalScientificName("   "), "");
check("속명만 있어도 살아남는다", sn.canonicalScientificName("Hosta Tratt."), "Hosta");

check("baseName 은 하위 분류군을 뗀다",
      ["Spiraea thunbergii 'Mount Fuji'", "Acer palmatum var. dissectum (Thunb.) K.Koch",
       "Abies x koreana E.H.Wilson"].map(sn.baseName),
      ["Spiraea thunbergii", "Acer palmatum", "Abies × koreana"]);
check("genusOf", ["Pinus densiflora Siebold", "Hosta 'X'"].map(sn.genusOf), ["Pinus", "Hosta"]);

// --- 분류 ---------------------------------------------------
const C = sn.MATCH_CLASS;
const cls = (a, b) => sn.classifyDifference(a, b);
check("EXACT",       cls("Pinus densiflora", "Pinus densiflora"), C.EXACT);
check("AUTHOR_ONLY", cls("Stipa tenuissima Trin.", "Stipa tenuissima"), C.AUTHOR_ONLY);
check("AUTHOR_ONLY — 교배종 기호 표기 차이",
      cls("Abies x koreana E.H.Wilson", "Abies × koreana"), C.AUTHOR_ONLY);
check("AUTHOR_ONLY — 속명 대소문자만 다를 때",
      cls("hydrangea macrophylla", "Hydrangea macrophylla"), C.AUTHOR_ONLY);
/**
 * 전부 대문자인 이름은 **풀지 않는다.** 종소명과 명명자를 가를 근거가
 * 사라지기 때문이다(`MACROPHYLLA` 가 소명인지 저자인지 모른다). 억지로
 * 추측해 붙이는 것보다 사람에게 넘기는 편이 안전하다 —
 * POSSIBLE_SYNONYM 으로 떨어져 리포트에 남는다.
 */
check("전부 대문자면 판정하지 않는다",
      cls("HYDRANGEA MACROPHYLLA", "Hydrangea macrophylla"), C.POSSIBLE_SYNONYM);
check("CULTIVAR — 품종",
      cls("Spiraea thunbergii 'Mount Fuji'", "Spiraea thunbergii"), C.CULTIVAR);
check("CULTIVAR — 변종",
      cls("Acer palmatum var. dissectum (Thunb.) K.Koch", "Acer palmatum"), C.CULTIVAR);
check("CULTIVAR — 서로 다른 품종끼리도",
      cls("Hosta 'Frances Williams'", "Hosta 'Sum and Substance'"), C.CULTIVAR);
check("POSSIBLE_SYNONYM — 종이 다르다",
      cls("Pinus koraiensis", "Pinus densiflora"), C.POSSIBLE_SYNONYM);
check("POSSIBLE_SYNONYM — 속이 바뀌었다",
      cls("Chrysanthemum zawadskii", "Dendranthema zawadskii"), C.POSSIBLE_SYNONYM);
check("빈 값은 판정하지 않는다", cls("", "Pinus densiflora"), C.POSSIBLE_SYNONYM);

check("자동 연결 대상은 EXACT · AUTHOR_ONLY 뿐",
      [...sn.AUTO_LINKABLE].sort(), ["AUTHOR_ONLY", "EXACT"]);
check("품종은 자동 연결 대상이 아니다", sn.AUTO_LINKABLE.has(C.CULTIVAR), false);

// --- Provider 연결 ------------------------------------------
const KNA_ROWS = [
  { scientific_name: "Spiraea thunbergii Siebold ex Blume", korean_name: "가는잎조팝나무",
    image_type: "사진", image_url: "http://www.nature.go.kr/st.JPG" },
  { scientific_name: "Spiraea thunbergii 'Mount Fuji'", korean_name: "가는잎조팝나무 '마운트 후지'",
    image_type: "사진", image_url: "http://www.nature.go.kr/st-mf.JPG" }
];
const knaSelect = genusSelect(KNA_ROWS);

check("명명자가 붙은 원종에 원종 사진이 붙는다",
      (await img.findPhotos("Spiraea thunbergii", { select: knaSelect })).photos.map(p => p.url),
      ["http://www.nature.go.kr/st.JPG"]);
check("원종에 품종 사진은 붙지 않는다",
      (await img.findPhotos("Spiraea thunbergii", { select: knaSelect })).photos.length, 1);
check("품종에는 품종 사진만",
      (await img.findPhotos("Spiraea thunbergii 'Mount Fuji'", { select: knaSelect }))
        .photos.map(p => p.url), ["http://www.nature.go.kr/st-mf.JPG"]);
check("isSameTaxon 은 명명자만 무시한다", [
  img.isSameTaxon("Stipa tenuissima Trin.", "Stipa tenuissima"),
  img.isSameTaxon("Spiraea thunbergii 'Mount Fuji'", "Spiraea thunbergii")
], [true, false]);
check("isExactMatch 는 원문 그대로 (과거 경로용)",
      img.isExactMatch("Stipa tenuissima Trin.", "Stipa tenuissima"), false);

/** 과거 Edge Function 경로는 canonical 을 쓰지 않는다 — 계약을 바꾸지 않는다. */
check("invoke 경로는 여전히 원문 완전 일치",
      (await img.findPhotos("Stipa tenuissima", { invoke: async () => ({ records: [
        { plantSpecsScnm: "Stipa tenuissima Trin.", imgUrl: "https://x/a.jpg" }
      ] }) })).matched, false);

// ============================================================
section("18. 차이 설명은 등급과 같은 이야기를 한다");
// ============================================================
/**
 * 변종인데 "저자명"이라고 적히면 검토 화면에서 잘못된 결정을 유도한다.
 * 설명이 판정과 어긋나면 그건 설명이 아니라 소음이다.
 */
const desc = (a, b) => sn.describeDifference(a, b);
check("같으면 설명할 것이 없다", desc("Pinus densiflora", "Pinus densiflora"), "");
check("명명자", desc("Stipa tenuissima Trin.", "Stipa tenuissima"), "명명자");
check("명명자 · 교배종 기호",
      desc("Abies x koreana E.H.Wilson", "Abies × koreana"), "명명자 · 교배종 기호");
check("품종명", desc("Spiraea thunbergii 'Mount Fuji'", "Spiraea thunbergii"), "품종명");
check("변종은 변종이라고 말한다",
      desc("Acer palmatum var. dissectum (Thunb.) K.Koch", "Acer palmatum"), "변종 표기");
check("아종", desc("Pinus densiflora subsp. ussuriensis", "Pinus densiflora"), "아종 표기");
check("서로 다른 품종",
      desc("Hosta 'Frances Williams'", "Hosta 'Sum and Substance'"), "서로 다른 품종");
check("속이 다르면 학명 변경 가능성",
      desc("Chrysanthemum zawadskii", "Dendranthema zawadskii"), "속이 다름 — 학명 변경 가능성");
check("종소명이 다르면 동의어 가능성",
      desc("Pinus koraiensis", "Pinus densiflora"), "종소명이 다름 — 동의어 가능성");
check("전부 대문자는 표기부터 고치라고 말한다",
      desc("HYDRANGEA MACROPHYLLA", "Hydrangea macrophylla"),
      "전부 대문자 — 표기를 먼저 고쳐야 판정할 수 있음");

check("rankOf", ["Acer palmatum var. dissectum K.Koch", "Pinus densiflora",
                 "Pinus densiflora subsp. ussuriensis"].map(sn.rankOf),
      ["var.", "", "subsp."]);

/** 설명과 등급이 서로 다른 이야기를 하지 않는지 전수로 확인한다. */
check("CULTIVAR 설명에 '명명자'가 섞이지 않는다", [
  desc("Spiraea thunbergii 'Mount Fuji'", "Spiraea thunbergii"),
  desc("Acer palmatum var. dissectum (Thunb.) K.Koch", "Acer palmatum")
].some(d => d.includes("명명자")), false);

// ============================================================
section("19. report.json — Admin 검토 화면용 구조");
// ============================================================
const vfr = vf.toReviewReport(CMP, [{ at: 4, reason: "URL 없음" }], {
  csv: "a.csv", species: "b.json",
  csvHash: "ab".repeat(32), csvVersion: "2026-09-21", csvBytes: 804
});

check("스키마는 객체", vfr.schema, { name: "plant-image-review", major: 4, minor: 1 });
check("스키마 상수와 출력이 같다", vfr.schema, vf.SCHEMA);
check("요약 숫자", {
  authorOnly: vfr.summary.authorOnly, cultivar: vfr.summary.cultivar,
  possibleSynonym: vfr.summary.possibleSynonym, reviewTotal: vfr.summary.reviewTotal,
  autoLinkable: vfr.summary.autoLinkable
}, { authorOnly: 2, cultivar: 1, possibleSynonym: 1, reviewTotal: 4, autoLinkable: 2 });

/** 사람 손이 필요한 것이 위로 온다 — 화면을 스크롤하지 않아도 보이게. */
check("사람 확인이 먼저 정렬된다", vfr.review[0].matchClass, "CULTIVAR");
check("등급별 id 색인을 함께 준다", Object.keys(vfr.index).sort(),
      ["AUTHOR_ONLY", "CULTIVAR", "EXACT", "POSSIBLE_SYNONYM"]);
check("색인 건수와 목록 건수가 맞는다",
      vfr.index.AUTHOR_ONLY.length + vfr.index.CULTIVAR.length +
      vfr.index.POSSIBLE_SYNONYM.length, vfr.review.length);

const one = vfr.review.find(x => x.matchClass === "AUTHOR_ONLY");
check("행 하나가 한 결정", Object.keys(one).sort(),
      ["alternatives", "autoLinkable", "csv", "decision", "diff", "id", "matchClass",
       "reviewReason", "species"]);
check("결정은 비워 둔다 — 이 파일은 판단하지 않는다", one.decision, null);
/**
 * `matchClass` 는 "무엇이 다른가"를 말하지만 "왜 그렇게 정했는가"는 사람만
 * 안다. 그 메모가 없으면 다음 검토에서 같은 판단을 처음부터 다시 한다.
 */
check("메모 자리도 비워 둔다", one.reviewReason, null);
check("모든 행에 메모 자리가 있다",
      vfr.review.every(x => "reviewReason" in x && x.reviewReason === null), true);
/**
 * 키는 읽히라고 있는 게 아니라 **같은 것을 같다고 말하라고** 있다.
 * URL 파라미터·JSON Patch·Windows 콘솔을 거쳐도 깨지지 않아야 한다.
 */
check("id 는 <speciesId>::<CSV 학명>",
      one.id, `${one.species.id}::${one.csv.scientificName}`);
check("id 는 ASCII 구분자만 쓴다",
      vfr.review.every(x => /^[\x20-\x7EÀ-ɏ'×]+$/.test(x.id.split("::")[0])), true);
check("화살표를 쓰지 않는다", vfr.review.some(x => x.id.includes("→")), false);
check("구분자 상수와 일치", vf.ID_SEPARATOR, "::");
check("id 는 같은 입력에 같은 값",
      vf.reviewId(one.species.id, `  ${one.csv.scientificName}  `), one.id);

/**
 * 등급을 키에 넣지 않는다. 분류 규칙을 고치면 등급이 바뀌는데, 등급이 키에
 * 있으면 같은 항목이 다른 키가 되어 **사람이 내린 판단을 찾지 못한다.**
 */
check("등급이 키에 섞이지 않는다",
      vfr.review.some(x => x.id.toLowerCase().includes(x.matchClass.toLowerCase())), false);
check("speciesId 가 앞에 와서 정렬하면 같은 수종이 모인다",
      one.id.startsWith(one.species.id + "::"), true);
check("사진 장수를 함께 준다", typeof one.csv.photoCount, "number");
check("우리 쪽 국명·학명이 들어 있다",
      [typeof one.species.name, typeof one.species.latin], ["string", "string"]);

check("동의어 확인 대상을 따로 싣는다",
      vfr.speciesUnmatched.map(s => s.id), ["sp-007"]);
check("CSV 전용은 표본만 (전량은 수천 건)", vfr.csvOnlySample.length <= 100, true);
check("이미지 종류 분포", vfr.imageTypes, { "사진": 7, "꽃": 1 });
check("URL 집계", [vfr.url.http, vfr.url.https], [7, 1]);
check("건너뛴 행도 싣는다", vfr.skipped.length, 1);
check("JSON 으로 직렬화된다", typeof JSON.stringify(vfr), "string");

// ============================================================
section("20. 계약 — dataset · decision enum · 스키마 판");
// ============================================================
/**
 * 검토 결과를 나중에 적재와 대조하려면 **같은 CSV 였는지** 를 말할 수 있어야
 * 한다. 파일명은 바뀌고 날짜는 겹치므로 해시가 유일하게 믿을 수 있는 식별자다.
 */
check("dataset 필드", Object.keys(vfr.dataset).sort(),
      ["csvBytes", "generatedAt", "hash", "source", "version"]);
check("source 기본값", vfr.dataset.source, "KNA_IMAGE_CSV");
check("판은 넘겨받은 값", vfr.dataset.version, "2026-09-21");
check("generatedAt 은 dataset 안에만 있다",
      ["generatedAt" in vfr, "generatedAt" in vfr.dataset], [false, true]);
check("생성 시각은 ISO", /^\d{4}-\d{2}-\d{2}T.*Z$/.test(vfr.dataset.generatedAt), true);

/** 알고리즘과 값을 함께 둔다 — 값만 두면 나중에 무엇으로 계산했는지 추측해야 한다. */
check("hash 는 {algorithm, value}", Object.keys(vfr.dataset.hash).sort(),
      ["algorithm", "value"]);
check("알고리즘 이름", vfr.dataset.hash.algorithm, "sha256");
check("값에 알고리즘을 겹쳐 넣지 않는다",
      vfr.dataset.hash.value.includes(":"), false);
check("sha256 은 64 hex", [vfr.dataset.hash.value.length,
      /^[0-9a-f]+$/.test(vfr.dataset.hash.value)], [64, true]);

check("메타를 안 주면 빈 값으로 둔다 — 지어내지 않는다", await (async () => {
  const bare = vf.toReviewReport(CMP, []);
  return [bare.dataset.version, bare.dataset.hash, bare.dataset.csvBytes];
})(), ["", { algorithm: "", value: "" }, null]);

check("사람이 읽는 표기", vf.schemaLabel(), "plant-image-review/4.1");

// --- decision enum ------------------------------------------
check("허용 값은 넷뿐", vf.DECISIONS, [null, "APPROVED", "REJECTED", "SKIPPED"]);
check("보고서가 값 목록을 함께 싣는다", vfr.decisionValues, vf.DECISIONS);
check("모든 행의 초기값은 null", [...new Set(vfr.review.map(x => x.decision))], [null]);

for (const v of [null, undefined, "APPROVED", "REJECTED", "SKIPPED"]) {
  check(`유효한 결정: ${JSON.stringify(v)}`, vf.isValidDecision(v), true);
}
for (const v of ["LINK", "approved", "DEFER", "", 0, true, "PENDING"]) {
  check(`거부하는 결정: ${JSON.stringify(v)}`, vf.isValidDecision(v), false);
}

/**
 * REJECTED 와 SKIPPED 를 합치지 않는다 — 둘 다 "지금 연결 안 함" 이지만
 * REJECTED 는 결론이고 SKIPPED 는 보류다. 합치면 다음 검토 때 무엇을 다시
 * 봐야 하는지 알 수 없다.
 */
check("보류와 거부가 따로 있다",
      [vf.DECISIONS.includes("REJECTED"), vf.DECISIONS.includes("SKIPPED")], [true, true]);

// --- stats.reviewProgress -----------------------------------
/**
 * 화면이 배열을 다시 훑지 않아도 되게 숫자를 미리 센다. 편집된 보고서를
 * 다시 읽었을 때도 같은 함수로 같은 숫자가 나와야 한다.
 */
check("진행률 자리", Object.keys(vfr.stats.reviewProgress).sort(),
      ["approved", "rejected", "remaining", "reviewed", "skipped", "total"]);
check("생성 시점에는 전부 미검토", vfr.stats.reviewProgress,
      { total: 4, reviewed: 0, approved: 0, rejected: 0, skipped: 0, remaining: 4 });

/** SKIPPED 도 "본 것"이다 — 보류는 판단을 미룬 것이지 안 본 것이 아니다. */
const decided = vfr.review.map((x, i) =>
  ({ ...x, decision: [null, "APPROVED", "REJECTED", "SKIPPED"][i] }));
check("결정을 채우면 진행률이 따라온다", vf.reviewStats(decided),
      { total: 4, reviewed: 3, approved: 1, rejected: 1, skipped: 1, remaining: 1 });
check("합이 맞는다", await (async () => {
  const s = vf.reviewStats(decided);
  return [s.approved + s.rejected + s.skipped === s.reviewed,
          s.reviewed + s.remaining === s.total];
})(), [true, true]);
check("빈 목록도 0으로 답한다", vf.reviewStats([]),
      { total: 0, reviewed: 0, approved: 0, rejected: 0, skipped: 0, remaining: 0 });

// --- URL 유일성 (T11-6.3 완료 조건 D 의 기댓값) ----------------
/**
 * `(학명, URL)` 중복이 0인 것과 URL 이 전체에서 유일한 것은 다른 사실이다.
 * 원종과 품종이 같은 사진을 쓰면 `count(distinct image_url)` 은 행 수보다 작다.
 * 그걸 모르고 4763 을 검증 기준으로 걸면 정상 적재가 실패로 보고된다.
 */
check("고유 URL 수를 센다", vfr.url.distinct, 8);
const SHARED = vf.compare([
  row("Spiraea thunbergii", "사진", "http://www.nature.go.kr/same.JPG"),
  row("Spiraea thunbergii 'Mount Fuji'", "사진", "http://www.nature.go.kr/same.JPG"),
  row("Pinus densiflora", "사진", "http://www.nature.go.kr/pine.JPG")
], SP);
check("학명이 다른데 같은 사진이면 고유 URL 이 줄어든다",
      [SHARED.url.distinct, SHARED.csv.rows], [2, 3]);
check("어느 학명끼리 공유하는지 말해 준다", SHARED.url.shared.map(s => s.names),
      [["Spiraea thunbergii", "Spiraea thunbergii 'Mount Fuji'"]]);
check("공유가 없으면 빈 배열", SHARED.url.shared.length > 0, true);

// ============================================================
section("21. T12 TODO 가 마이그레이션에 남아 있다");
// ============================================================
for (const col of ["is_primary", "sort_order", "review_status"]) {
  check(`TODO(T12): ${col}`, new RegExp(`TODO\\(T12\\)[\\s\\S]*${col}`).test(MIGRATION), true);
}
check("아직 컬럼으로 만들지는 않았다",
      /^\s{2}(is_primary|sort_order|review_status)\s/m.test(
        MIGRATION.slice(0, MIGRATION.indexOf("TODO(T12)"))), false);

// ============================================================
section("22. T11-6.3 전 검증 TODO 가 남아 있다");
// ============================================================
/**
 * 적재한 뒤에 발견하면 4,763행을 되돌려야 한다. 무엇을 먼저 세야 하는지
 * 검증기 본문에 남겨 두고, 빠지면 여기서 걸린다.
 */
const VERIFIER = await readFile(join(HERE, "..", "verify-plant-images.mjs"), "utf8");
const TODO_BLOCK = VERIFIER.slice(VERIFIER.indexOf("TODO(T11-6.3 전)"),
                                  VERIFIER.indexOf("import fs from"));
check("TODO 블록이 있다", TODO_BLOCK.length > 0, true);
for (const [label, needle] of [
  ["HTTP URL 샘플 검사", "HTTP URL 샘플"],
  ["이미지 확장자 검사", "이미지 확장자"],
  ["국명 빈 값 검사",    "국명 빈 값"],
  ["Unicode 공백 검사",  "Unicode 공백"],
  ["이미지 중복 해시 검사", "이미지 중복(Hash)"]
]) {
  check(`TODO: ${label}`, TODO_BLOCK.includes(needle), true);
}
check("전부 읽기 전용임을 명시한다", TODO_BLOCK.includes("읽기 전용"), true);
check("전량 요청을 하지 말라고 적혀 있다", TODO_BLOCK.includes("전량"), true);

/** 적재 후 통과해야 하는 네 가지. 기댓값은 전부 적재 **전에** 정해진다. */
check("완료 조건 블록이 있다", TODO_BLOCK.includes("T11-6.3 완료 조건"), true);
for (const [label, needle] of [
  ["A · CSV SHA256 재계산",            "SHA256 재계산"],
  ["B · count(*)",                     "count(*) from plant_images"],
  ["C · count(distinct scientific_name)", "count(distinct scientific_name)"],
  ["D · count(distinct image_url)",    "count(distinct image_url)"]
]) {
  check(`완료 조건 ${label}`, TODO_BLOCK.includes(needle), true);
}
/**
 * D 의 기댓값을 4763 으로 못박지 않았는지 — 못박으면 정상 적재가 사고로
 * 오인된다. 기댓값은 `[9] 고유 URL` 이 실측으로 알려 준다.
 */
check("D 의 기댓값을 단정하지 않는다",
      /count\(distinct image_url\)[^\n]*=\s*\?/.test(TODO_BLOCK), true);
check("해시가 다르면 중단하라고 적혀 있다", TODO_BLOCK.includes("적재를 중단"), true);

// ============================================================
section("23. 적재 후 검증 — A~H 판정 (T11-6.3)");
// ============================================================
const ld = await import("../verify-plant-images-loaded.mjs");

const LOADED = [
  { scientific_name: "Stipa tenuissima Trin.",            korean_name: "가는잎나래새",
    image_url: "http://www.nature.go.kr/a.JPG" },
  { scientific_name: "Spiraea thunbergii 'Mount Fuji'",   korean_name: "가는잎조팝나무 '마운트 후지'",
    image_url: "http://www.nature.go.kr/b.JPG" },
  { scientific_name: "Lavandula angustifolia Mill.",      korean_name: "라벤더",
    image_url: "http://www.nature.go.kr/c.JPG" },
  { scientific_name: "Pinus densiflora Siebold & Zucc.",  korean_name: "소나무",
    image_url: "http://www.nature.go.kr/c.JPG" }          // 학명이 다른데 같은 사진
];
const M = ld.measure(LOADED);
check("집계", [M.total, M.distinctNames, M.distinctUrls, M.sharedCount], [4, 4, 3, 1]);
check("공유하는 학명을 말해 준다", M.shared[0].names,
      ["Lavandula angustifolia Mill.", "Pinus densiflora Siebold & Zucc."]);

const REPORT = {
  schema: { name: "plant-image-review", major: 4, minor: 1 },
  dataset: { hash: { algorithm: "sha256", value: "ab".repeat(32) } },
  source: { csvRows: 5, csvValidRows: 4, csvNames: 4 },
  url: { distinct: 3, sharedCount: 1 }
};
const CHECKS = ld.judge(M, REPORT);
check("A~H 여덟 개", CHECKS.map(c => c.id), ["A", "B", "C", "D", "E", "F", "G", "H"]);
check("전부 통과", CHECKS.every(c => c.pass), true);

/**
 * A 의 기댓값은 `csvValidRows` 다. `csvRows` 는 건너뛴 행(빈 URL 등)을 포함하고
 * 그 행들은 애초에 적재되지 않는다 — 그걸 기준으로 삼으면 정상 적재가 실패로
 * 보고된다. 위 REPORT 는 csvRows 5 · csvValidRows 4 로 둘을 일부러 다르게 뒀다.
 */
check("A 는 유효 행 수를 본다 (건너뛴 행 제외)",
      CHECKS.find(c => c.id === "A").expected, 4);

check("행이 모자라면 A 가 걸린다",
      ld.judge(ld.measure(LOADED.slice(0, 3)), REPORT).find(c => c.id === "A").pass, false);
check("보고서에 기댓값이 없으면 통과시키지 않는다",
      ld.judge(M, { source: {}, url: {} }).every(c => c.pass), false);

// --- F · G · H ------------------------------------------------
const LOADED_BAD = ld.measure([
  ...LOADED,
  { scientific_name: "X y", korean_name: "", image_url: "" },                    // F
  { scientific_name: "X z", korean_name: "", image_url: "ftp://x/a.JPG" },       // G
  { scientific_name: "X w", korean_name: "", image_url: "https://cdn.example.com/a.JPG" } // H
]);
check("빈 URL 을 센다", LOADED_BAD.empty, 1);
check("형식 이상을 센다", LOADED_BAD.malformed, 1);
check("외부 호스트를 센다", [LOADED_BAD.offsiteCount, LOADED_BAD.offsiteHosts["cdn.example.com"]], [1, 1]);
check("국명 빈 값도 함께 센다", LOADED_BAD.emptyKorean, 3);
check("F·G·H 가 실패로 잡힌다",
      ld.judge(LOADED_BAD, REPORT).filter(c => ["F", "G", "H"].includes(c.id)).map(c => c.pass),
      [false, false, false]);

// --- 사전 조건 ------------------------------------------------
const PRE_OK = ld.checkPreconditions(REPORT, "ab".repeat(32));
check("같은 파일이면 사전 조건 통과", PRE_OK.every(p => p.pass), true);
check("해시가 다르면 막는다",
      ld.checkPreconditions(REPORT, "cd".repeat(32)).at(-1).pass, false);
check("--csv 를 안 주면 '확인 못 함' 으로 막는다", await (async () => {
  const p = ld.checkPreconditions(REPORT, "").at(-1);
  return [p.pass, p.detail.includes("알 수 없다")];
})(), [false, true]);
check("모르는 major 는 거부한다",
      ld.checkPreconditions({ ...REPORT, schema: { name: "plant-image-review", major: 3, minor: 0 } },
                            "ab".repeat(32))[0].pass, false);
check("minor 가 높은 것은 받아들인다",
      ld.checkPreconditions({ ...REPORT, schema: { name: "plant-image-review", major: 4, minor: 9 } },
                            "ab".repeat(32))[0].pass, true);

// --- 샘플 ------------------------------------------------------
const S = ld.sampleCheck(LOADED);
check("샘플 셋", S.map(s => s.pass), [true, true, true]);
check("품종은 품종으로 남는다",
      S.find(s => s.name.includes("Mount Fuji")).canonicalHits, 1);
check("없는 학명은 실패로", ld.sampleCheck(LOADED, [{ name: "Nothing here", want: "" }])[0].pass, false);
/** "적재가 안 됐다"와 "표기가 다르다"는 다른 사고라 나눠 센다. */
check("원문은 없고 canonical 만 맞으면 구분해 보여 준다", await (async () => {
  const s = ld.sampleCheck(LOADED, [{ name: "Stipa tenuissima", want: "" }])[0];
  return [s.rawHits, s.canonicalHits, s.pass];
})(), [0, 1, false]);

/** 이 파일은 읽기만 한다 — 쓰기 경로가 있으면 "검증만 돌린다"가 보증되지 않는다. */
const LOADED_SRC = await readFile(join(HERE, "..", "verify-plant-images-loaded.mjs"), "utf8");
check("GET 외의 method 가 없다",
      /method:\s*"(POST|PATCH|PUT|DELETE)"/i.test(LOADED_SRC), false);
check("Prefer: resolution=merge-duplicates 같은 적재 헤더가 없다",
      /merge-duplicates/i.test(LOADED_SRC), false);
check("페이지네이션을 한다 — max-rows 1000 을 넘긴다",
      /offset=\$\{offset\}/.test(LOADED_SRC), true);

// ============================================================
console.log("\n" + "=".repeat(52));
console.log(`통과 ${pass} · 실패 ${fail}`);
if (fail) { console.log("\n실패 항목:"); for (const l of failed) console.log("  ✗ " + l); }
console.log("=".repeat(52));
process.exit(fail ? 1 : 0);
