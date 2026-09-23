#!/usr/bin/env node
/**
 * KNA 서술 문장 → 기준정보 값 뽑기 회귀 테스트 (T12-2).
 *
 *   node species-catalog/tests/kna-taxon-text.mjs
 *
 * 네트워크를 쓰지 않는다 — 문자열만 넣는다.
 *
 * 계약
 *   ① 원문이 말한 것만 뽑는다 — 말하지 않았으면 `null`
 *   ② 열매·결실의 달을 개화월로 읽지 않는다
 *   ③ "반양지" 를 "양지" 로 자르지 않는다
 *   ④ 파생값과 함께 **원문을 싣는다** — 대조할 수 없는 값은 만들지 않는다
 */

const { floweringMonthsFrom, growthFormFrom, sunlightFrom, toTaxonRow, isDisplayComplete }
  = await import("../services/knaTaxonText.js");

let pass = 0, fail = 0; const failed = [];
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : (fail++, failed.push(label));
  console.log(`${ok ? "✓" : "✗"} ${label}` +
              (ok ? "" : `\n    기대: ${JSON.stringify(expected)}\n    실제: ${JSON.stringify(actual)}`));
}
function section(t) { console.log(`\n── ${t} ${"─".repeat(Math.max(0, 48 - t.length))}`); }


// ============================================================
section("① 개화월 — 원문이 말한 달만");
// ============================================================
check("구간", floweringMonthsFrom("꽃은 6~7월에 피고 산방꽃차례에 달린다."), [6, 7]);
check("물결 문자가 달라도", floweringMonthsFrom("꽃은 6∼8월에 핀다."), [6, 7, 8]);
check("하이픈", floweringMonthsFrom("개화기는 5-6월이다."), [5, 6]);
check("한 달", floweringMonthsFrom("꽃은 7월에 핀다."), [7]);
check("떨어진 두 달", floweringMonthsFrom("꽃은 5월과 9월에 두 번 핀다."), [5, 9]);
check("해를 넘기는 구간", floweringMonthsFrom("꽃은 11~2월에 핀다."), [1, 2, 11, 12]);
check("공백이 있어도", floweringMonthsFrom("꽃은 6 ~ 7 월에 핀다."), [6, 7]);

check("달을 말하지 않으면 null", floweringMonthsFrom("꽃은 흰색으로 핀다."), null);
check("꽃 이야기가 없으면 null", floweringMonthsFrom("높이 1m 내외로 자란다."), null);
check("빈 문자열", floweringMonthsFrom(""), null);
check("null 입력", floweringMonthsFrom(null), null);
check("범위 밖 숫자는 버린다", floweringMonthsFrom("꽃은 13월에 핀다."), null);

// ============================================================
section("② 열매의 달을 개화월로 읽지 않는다");
// ============================================================
check("문장이 나뉘어 있으면 꽃 문장만",
      floweringMonthsFrom("꽃은 6~7월에 핀다. 열매는 9~10월에 익는다."), [6, 7]);
check("결실 문장만 있으면 null",
      floweringMonthsFrom("열매는 9월에 익는다."), null);
check("한 문장에 둘이 섞이면 **버린다** — 가려낼 수 없다",
      floweringMonthsFrom("꽃은 6월에 피고 열매는 9월에 익는다"), null);
check("종자 서술도 제외", floweringMonthsFrom("꽃이 진 뒤 종자는 10월에 여문다."), null);

// ============================================================
section("③ 생육형 — 쓰인 낱말만 조합");
// ============================================================
check("낙엽 활엽 관목", growthFormFrom("낙엽 활엽 관목이다."), "낙엽 활엽 관목");
check("상록 침엽 교목", growthFormFrom("상록 침엽 교목으로 높이 20m."), "상록 침엽 교목");
check("잎 성질이 없으면 형태만", growthFormFrom("관목이다."), "관목");
check("여러해살이풀", growthFormFrom("여러해살이풀이다."), "여러해살이풀");
check("덩굴", growthFormFrom("낙엽 덩굴나무."), "낙엽 덩굴나무");
check("반관목이 관목보다 먼저", growthFormFrom("반관목이다."), "반관목");
check("소교목이 교목보다 먼저", growthFormFrom("낙엽 소교목."), "낙엽 소교목");
check("형태를 말하지 않으면 null — '낙엽' 하나로는 생육형이 아니다",
      growthFormFrom("낙엽이 진다."), null);
check("빈 문자열", growthFormFrom(""), null);

// ============================================================
section("④ 광조건 — 서식지 서술에서 끌어내지 않는다");
// ============================================================
check("반양지", sunlightFrom("반양지에서 잘 자란다."), "반양지");
check("반음지", sunlightFrom("반음지를 좋아한다."), "반음지");
check("양지", sunlightFrom("양지바른 곳에서 자란다."), "양지");
check("반양지를 양지로 자르지 않는다", sunlightFrom("반양지"), "반양지");
check("둘 다 적혀 있으면 둘 다", sunlightFrom("양지 또는 반음지."), "반음지 · 양지");
check("광 조건을 말하지 않으면 null — 추론하지 않는다",
      sunlightFrom("산지 숲 속에서 자란다."), null);
check("빈 문자열", sunlightFrom(""), null);
check("null", sunlightFrom(null), null);

// ============================================================
section("⑤ toTaxonRow — 원문을 함께 싣는다");
// ============================================================
{
  const detail = {
    recordId: "12345",
    koreanName: "산수국",
    scientificName: "Hydrangea serrata (Thunb.) Ser.",
    familyNameKo: "범의귀과", familyNameLatin: "Saxifragaceae",
    genusNameKo: "수국속", genusNameLatin: "Hydrangea",
    formRaw: "낙엽 활엽 관목이다. 꽃은 6~7월에 산방꽃차례로 핀다. 열매는 9월에 익는다.",
    growthEnvironmentRaw: "산지의 계곡에서 자라며 반양지를 좋아한다."
  };
  const row = toTaxonRow(detail, { syncedAt: "2026-09-23T04:15:00Z" });

  check("학명은 원문 그대로 — 명명자를 자르지 않는다",
        row.scientific_name, "Hydrangea serrata (Thunb.) Ser.");
  check("국명", row.korean_name, "산수국");
  check("과", row.family, "범의귀과");
  check("속", row.genus, "수국속");
  check("생육형", row.growth_form, "낙엽 활엽 관목");
  check("광조건", row.sunlight, "반양지");
  check("개화월 — 열매의 9월이 섞이지 않았다", row.flowering_months, [6, 7]);
  check("형태 원문 보관", row.shpe_raw, detail.formRaw);
  check("생육환경 원문 보관", row.grw_evrnt_raw, detail.growthEnvironmentRaw);
  check("동기화", row.synced_at, "2026-09-23T04:15:00Z");
  // `plant_taxa` 에 없는 컬럼은 만들지 않는다 — 적재가 통째로 거절된다.
  check("표에 없는 칸을 만들지 않는다", Object.keys(row).sort(),
        ["family", "flowering_months", "genus", "growth_form", "grw_evrnt_raw",
         "korean_name", "scientific_name", "shpe_raw", "sunlight", "synced_at"].sort());
  check("화면 기준 충족", isDisplayComplete(row), true);
}
{
  // 서술이 비어 있는 행 — 실제로 많다. 행을 버리지는 않는다.
  const row = toTaxonRow({
    recordId: "9", koreanName: "어떤풀", scientificName: "Genus species",
    familyNameKo: "벼과", genusNameKo: "속",
    formRaw: "", growthEnvironmentRaw: ""
  });
  check("파생값은 전부 null", [row.growth_form, row.sunlight, row.flowering_months],
        [null, null, null]);
  check("원문이 비면 null 로 둔다", [row.shpe_raw, row.grw_evrnt_raw], [null, null]);
  check("과·속은 남는다", [row.family, row.genus], ["벼과", "속"]);
  check("화면 기준 미충족 — 적재 후 이것을 세어야 한다", isDisplayComplete(row), false);
}
check("학명 없는 행은 만들지 않는다",
      toTaxonRow({ recordId: "1", koreanName: "이름만" }), null);
check("빈 입력", toTaxonRow(null), null);


// ============================================================
section("⑥ 응답 해석 — XML item");
// ============================================================
const { parseItems, apiError, toSql, fetchTaxon, TABLE,
        API_BASE, TIMEOUT_MS, normalizeServiceKey, maskUrl, writeSql, UTF8_BOM }
  = await import("./import-plant-taxa.mjs");

check("item 둘", parseItems(`
  <response><body><items>
    <item><plantPilbkNo>1</plantPilbkNo><plantGnrlNm>산수국</plantGnrlNm></item>
    <item><plantPilbkNo>2</plantPilbkNo><plantGnrlNm>수국</plantGnrlNm></item>
  </items></body></response>`).map(r => r.plantGnrlNm), ["산수국", "수국"]);

check("CDATA 를 푼다",
      parseItems("<item><shpe><![CDATA[낙엽 활엽 관목]]></shpe></item>")[0].shpe,
      "낙엽 활엽 관목");
check("엔티티를 푼다",
      parseItems("<item><note>&lt;b&gt;굵게&lt;/b&gt; &amp; 또</note></item>")[0].note,
      "<b>굵게</b> & 또");
check("item 이 없으면 빈 배열", parseItems("<response/>"), []);
check("빈 입력", parseItems(""), []);

// ============================================================
section("⑦ HTTP 200 으로 오는 오류를 잡는다");
// ============================================================
// KNA 는 키가 틀려도 200 을 준다. 놓치면 "결과 0건" 으로 보여 조용히 빈 적재가 된다.
check("정상 코드는 오류 아님",
      apiError("<returnReasonCode>00</returnReasonCode><item/>"), "");
check("오류 코드",
      apiError("<returnReasonCode>30</returnReasonCode><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg>"),
      "30 SERVICE_KEY_IS_NOT_REGISTERED_ERROR");
check("코드 없이 메시지만 있어도 잡는다",
      apiError("<errMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR</errMsg>"),
      "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR");
check("평범한 응답은 통과", apiError("<item><plantPilbkNo>1</plantPilbkNo></item>"), "");

// ============================================================
section("⑧ fetchTaxon — 2단계 조회 (네트워크 없이)");
// ============================================================
{
  const calls = [];
  const call = async (op, params) => {
    calls.push({ op, params });
    if (op === "plantPilbkSearch") return [{ plantPilbkNo: "777" }];
    return [{
      plantPilbkNo: "777", plantGnrlNm: "산수국",
      plantSpecsScnm: "Hydrangea serrata (Thunb.) Ser.",
      familyKorNm: "범의귀과", genusKorNm: "수국속",
      shpe: "낙엽 활엽 관목이다. 꽃은 6~7월에 핀다.",
      grwEvrntDesc: "반양지에서 자란다."
    }];
  };
  const { row } = await fetchTaxon("산수국", { call, syncedAt: "2026-09-23T00:00:00Z" });
  check("검색 → 상세 두 번 부른다", calls.map(c => c.op),
        ["plantPilbkSearch", "plantPilbkInfo"]);
  check("상세는 검색이 준 번호로 부른다", calls[1].params.reqPlantPilbkNo, "777");
  check("행이 만들어진다",
        [row.korean_name, row.family, row.growth_form, row.sunlight, row.flowering_months],
        ["산수국", "범의귀과", "낙엽 활엽 관목", "반양지", [6, 7]]);
}
{
  const call = async () => [];
  const got = await fetchTaxon("없는이름", { call });
  check("검색 결과 없으면 행을 만들지 않는다", [got.row, got.reason], [null, "검색 결과 없음"]);
}

// ── 국명 완전 일치 ────────────────────────────────────────────────────
// 실측(2026-09-23): plantPilbkSearch("산수국") 이 떡잎산수국을 **먼저**
// 돌려줬고, 첫 결과를 그냥 받던 코드가 다른 분류군을 조용히 채택했다.
const KNA_DB = {
  "42087": { plantPilbkNo: "42087", plantGnrlNm: "떡잎산수국",
             plantSpecsScnm: "Hydrangea serrata (Thunb.) Ser. f. coreana (Nakai) T.B.Lee",
             familyKorNm: "범의귀과", genusKorNm: "수국속",
             shpe: "꽃은 7~8월에 핀다.", grwEvrntDesc: "산지에서 자란다." },
  "42090": { plantPilbkNo: "42090", plantGnrlNm: "산수국",
             plantSpecsScnm: "Hydrangea serrata (Thunb.) Ser.",
             familyKorNm: "범의귀과", genusKorNm: "수국속",
             shpe: "낙엽 활엽 관목이다. 꽃은 6~7월에 핀다.",
             grwEvrntDesc: "반양지에서 자란다." }
};
/** 검색은 `order` 순서로 도감번호를 돌려준다. 상세는 번호로 찾는다. */
const knaCall = order => async (op, p) =>
  op === "plantPilbkSearch" ? order.map(no => ({ plantPilbkNo: no }))
                            : [KNA_DB[p.reqPlantPilbkNo]].filter(Boolean);

{
  // 떡잎산수국이 먼저 와도 산수국을 골라야 한다.
  const got = await fetchTaxon("산수국", { call: knaCall(["42087", "42090"]) });
  check("국명이 정확히 같은 후보를 고른다", got.row.korean_name, "산수국");
  check("학명도 그 후보의 것", got.row.scientific_name, "Hydrangea serrata (Thunb.) Ser.");
  check("후보 수를 보고한다", got.candidates, 2);
  check("확인한 후보를 남긴다", got.seen.map(s => s.name), ["떡잎산수국", "산수국"]);
}
{
  // 첫 후보가 이미 정답이면 뒤는 보지 않는다.
  const got = await fetchTaxon("산수국", { call: knaCall(["42090", "42087"]) });
  check("맞는 것을 찾으면 멈춘다", got.seen.map(s => s.name), ["산수국"]);
}
{
  // 정확히 일치하는 것이 없으면 **비슷한 것을 대신 주지 않는다.**
  const got = await fetchTaxon("산수국", { call: knaCall(["42087"]) });
  check("일치 후보 없으면 행을 만들지 않는다", got.row, null);
  check("이유에 후보를 적는다", got.reason.includes("떡잎산수국"), true);
  check("부분 일치로 넘어가지 않는다", got.reason.includes("정확히 일치하는 후보 없음"), true);
}
{
  // 반대 방향 — 요청이 더 긴 이름이어도 부분 일치로 붙지 않는다.
  const got = await fetchTaxon("떡잎산수국", { call: knaCall(["42090"]) });
  check("요청 ⊃ 후보 여도 붙이지 않는다", got.row, null);
}

// ============================================================
section("⑨ upsert SQL");
// ============================================================
{
  const sql = toSql([{
    scientific_name: "Hydrangea serrata", korean_name: "산수국",
    family: "범의귀과", genus: "수국속", growth_form: "낙엽 활엽 관목",
    sunlight: "반양지", flowering_months: [6, 7],
    shpe_raw: "따옴표'가 든 원문", grw_evrnt_raw: null,
    synced_at: "2026-09-23T00:00:00Z"
  }]);
  check("대상 테이블", sql.includes(`insert into public.${TABLE}`), true);
  check("배열은 Postgres 배열 리터럴", sql.includes("'{6,7}'"), true);
  check("따옴표를 이스케이프한다", sql.includes("'따옴표''가 든 원문'"), true);
  check("null 은 null 로", sql.includes("null"), true);
  check("학명 충돌 시 갱신", sql.includes("on conflict (scientific_name) do update set"), true);
  check("학명 자신은 갱신 대상이 아니다",
        /do update set[\s\S]*scientific_name = excluded/.test(sql), false);
}
check("빈 입력이면 SQL 도 없다", toSql([]), "");

// ============================================================
section("⑩ 요청 주소 · 키 · 타임아웃");
// ============================================================
// 이전 주소는 근거 없이 추측한 것이었고, 응답이 오지 않아 출력 한 줄 없이
// 매달렸다. 공공데이터포털에서 확인한 주소로 고정한다 (2026-09-23).
check("공공데이터포털 확인 주소", API_BASE, "https://apis.data.go.kr/1400119/PlantResource");
check("https 다", API_BASE.startsWith("https://"), true);
check("추측했던 주소를 쓰지 않는다", API_BASE.includes("api.nature.go.kr"), false);
check("타임아웃 15초", TIMEOUT_MS, 15000);

// 포털이 내려주는 키는 이미 URL 인코딩돼 있다. 다시 인코딩하면 `%`가
// `%25`가 되어 다른 키가 되고, 서버는 등록되지 않은 키라고 답한다.
check("인코딩된 키는 한 번 푼다",
      normalizeServiceKey("abc%2Bdef%3D"), "abc+def=");
check("인코딩 안 된 키는 그대로", normalizeServiceKey("abc+def="), "abc+def=");
check("깨진 인코딩은 원문 유지 — 던지지 않는다",
      normalizeServiceKey("abc%ZZ"), "abc%ZZ");
check("앞뒤 공백 제거", normalizeServiceKey("  key  "), "key");
check("빈 키", normalizeServiceKey(null), "");

// 로그에 키가 남으면 안 된다.
check("serviceKey 를 가린다",
      maskUrl("https://x/y?serviceKey=SECRET123&reqSearchWrd=%EC%82%B0"),
      "https://x/y?serviceKey=***&reqSearchWrd=%EC%82%B0");
check("첫 인자여도 가린다",
      maskUrl("https://x/y?serviceKey=SECRET"), "https://x/y?serviceKey=***");
check("다른 인자는 남긴다",
      maskUrl("https://x/y?a=1&serviceKey=S&b=2"), "https://x/y?a=1&serviceKey=***&b=2");
check("키가 없으면 그대로", maskUrl("https://x/y?a=1"), "https://x/y?a=1");

// ============================================================
section("⑪ SQL 파일 인코딩 — 한글이 살아 있는가");
// ============================================================
// 실측(2026-09-23): 파일은 정상 UTF-8 이었는데 PowerShell 5.1 의
// `Get-Content` 가 CP949 로 읽어 `산수국` → `?곗닔援?` 로 보였다.
// BOM 세 바이트를 붙여 Windows 도구가 UTF-8 을 알아보게 한다.
{
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sqlenc-"));
  const sql = toSql([{
    scientific_name: "Hydrangea serrata (Thunb.) Ser.", korean_name: "산수국",
    family: "범의귀과", genus: "수국속", growth_form: "낙엽 활엽 관목",
    sunlight: null, flowering_months: [7, 8],
    shpe_raw: "그늘진 계곡에서 자란다", grw_evrnt_raw: "내음성이 강하다",
    synced_at: "2026-09-23T07:00:00.000Z"
  }]);

  const withBom = writeSql(path.join(dir, "bom.sql"), sql);
  const buf = fs.readFileSync(withBom);
  check("BOM 세 바이트로 시작한다", [...buf.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  check("UTF-8 로 읽으면 한글 그대로", buf.toString("utf8").includes("산수국"), true);
  check("과·속·생육형도 그대로",
        ["범의귀과", "수국속", "낙엽 활엽 관목"].every(s => buf.toString("utf8").includes(s)), true);
  check("원문도 그대로",
        ["그늘진 계곡에서 자란다", "내음성이 강하다"].every(s => buf.toString("utf8").includes(s)), true);
  check("BOM 뒤는 곧바로 SQL", buf.toString("utf8").slice(1).startsWith("insert into"), true);

  const noBom = writeSql(path.join(dir, "nobom.sql"), sql, { bom: false });
  const buf2 = fs.readFileSync(noBom);
  check("--no-bom 이면 BOM 없음", buf2[0] === 0xef, false);
  check("--no-bom 이어도 한글은 그대로", buf2.toString("utf8").includes("산수국"), true);
  check("BOM 만 다르고 내용은 같다",
        buf.toString("utf8").slice(1) === buf2.toString("utf8"), true);

  // CP949 로 읽으면 깨지는 것이 정상이다 — 그것이 이번 사건의 원인이었다.
  check("CP949 로 읽으면 깨진다 (읽는 쪽 문제였음을 고정)",
        new TextDecoder("euc-kr").decode(buf2).includes("산수국"), false);

  check("BOM 상수", UTF8_BOM, "﻿");
  fs.rmSync(dir, { recursive: true, force: true });
}


console.log("\n" + "=".repeat(52));
console.log(`통과 ${pass} · 실패 ${fail}`);
if (failed.length) console.log("실패 항목:\n  - " + failed.join("\n  - "));
console.log("=".repeat(52));
process.exit(fail ? 1 : 0);
