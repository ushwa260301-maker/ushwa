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
section("5. 조회 SQL 은 eq 하나뿐");
// ============================================================
/**
 * 여기서 `like` 가 들어오면 위의 모든 방어가 무의미해진다.
 * 가짜 client 로 호출된 연산자를 그대로 받아 고정한다.
 */
const ops = [];
const fakeClient = {
  from(table) {
    ops.push(["from", table]);
    const q = {
      select(cols) { ops.push(["select", cols]); return q; },
      eq(col, val) { ops.push(["eq", col, val]); return Promise.resolve({ data: [TABLE_ROWS[4]] }); },
      like() { ops.push(["like"]); return q; },
      ilike() { ops.push(["ilike"]); return q; },
      contains() { ops.push(["contains"]); return q; }
    };
    return q;
  }
};
const rows = await img.selectFromSupabase(fakeClient)(PINE);
check("연산자는 from · select · eq 뿐",
      ops.map(o => o[0]), ["from", "select", "eq"]);
check("eq 대상은 scientific_name", [ops[2][1], ops[2][2]], ["scientific_name", PINE]);
check("select 는 컬럼을 명시한다", ops[1][1], img.COLUMNS);
check("행을 그대로 돌려준다", rows, [TABLE_ROWS[4]]);

check("조회 오류는 던진다", await (async () => {
  const errClient = { from: () => ({ select: () => ({
    eq: () => Promise.resolve({ error: { message: "permission denied" } }) }) }) };
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
check("적재 행이 그대로 조회에 걸린다", await (async () => {
  const loaded = imp.toRows(DATA, MAP).rows;
  const found = await img.findPhotos("Pinus densiflora Siebold & Zucc.", {
    select: async n => loaded.filter(r => r.scientific_name === n)
  });
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
check("저자명 차이", diffOf("Stipa tenuissima Trin."), "저자명");
check("품종명은 저자명으로 겹쳐 세지 않는다",
      diffOf("Spiraea thunbergii 'Mount Fuji'"), "따옴표 · 품종명");
check("대소문자 차이", diffOf("HYDRANGEA MACROPHYLLA"), "대소문자");
check("교배종 기호 차이", diffOf("Abies x koreana"), "교배종 기호");
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
console.log("\n" + "=".repeat(52));
console.log(`통과 ${pass} · 실패 ${fail}`);
if (fail) { console.log("\n실패 항목:"); for (const l of failed) console.log("  ✗ " + l); }
console.log("=".repeat(52));
process.exit(fail ? 1 : 0);
