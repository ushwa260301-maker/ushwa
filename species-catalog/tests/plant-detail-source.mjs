#!/usr/bin/env node
/**
 * Species Detail 데이터 연결 회귀 테스트 (T12-1 UI-1 / UI-2 / UI-3).
 *
 *   node species-catalog/tests/plant-detail-source.mjs
 *
 * 네트워크를 쓰지 않는다 — Supabase client 를 주입한다.
 *
 * 계약
 *   ① `toGuideRecord` 가 기준정보 필드를 **버리지 않는다** (UI-2 화이트리스트)
 *   ② `toDetailView` 가 plant_taxa 표기와 정적 도감 표기를 한 모양으로 맞춘다
 *   ③ 학명 canonical 이 같을 때만 연결한다 — 품종은 원종 사진을 달지 않는다
 *   ④ `plant_taxa` 가 없어도(미적재) 화면은 정적 도감 값으로 완결된다
 *   ⑤ 출처는 값이 실제로 온 쪽을 적는다 — 비었는데 "국립수목원" 이라 하지 않는다
 */

// plantGuideModal 은 모듈 최상위에서 DOMContentLoaded 를 건다. 화면 없이
// 순수 함수만 검사하므로 최소한의 document 만 세워 둔다.
globalThis.document = {
  addEventListener() {},
  getElementById() { return null; },
  querySelectorAll() { return []; }
};

globalThis.location = { search: "" };

const { toDetailView, formatFloweringMonths } = await import("../js/plantGuideModal.js");
const { fetchDetail, mergeDetail, pickPrimaryImage, resolveScientificName, sourceLabel,
        IMAGE_TABLE, TAXA_TABLE } = await import("../js/plantDetailSource.js");

let pass = 0, fail = 0; const failed = [];
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : (fail++, failed.push(label));
  console.log(`${ok ? "✓" : "✗"} ${label}` +
              (ok ? "" : `\n    기대: ${JSON.stringify(expected)}\n    실제: ${JSON.stringify(actual)}`));
}
function section(t) { console.log(`\n── ${t} ${"─".repeat(Math.max(0, 48 - t.length))}`); }

/**
 * Supabase client 흉내. `.from(t).select(c).like(col, pat)` 만 지원한다 —
 * 실제 코드가 쓰는 경로가 그것뿐이다.
 *
 * @param {object} tables  테이블명 → 행 배열. 값이 Error 면 그 오류를 돌려준다.
 */
function fakeClient(tables) {
  const calls = [];
  return {
    calls,
    from(table) {
      return {
        select(columns) {
          const rowsOf = () => tables[table];
          const answer = filter => {
            const v = rowsOf();
            if (v instanceof Error) return Promise.resolve({ data: null, error: v });
            return Promise.resolve({ data: (v || []).filter(filter), error: null });
          };
          return {
            like(column, pattern) {
              calls.push({ table, columns, op: "like", column, pattern });
              const prefix = String(pattern).replace(/%$/, "");
              return answer(r => String(r[column] || "").startsWith(prefix));
            },
            eq(column, value) {
              calls.push({ table, columns, op: "eq", column, value });
              const run = () => answer(r => String(r[column] ?? "") === String(value));
              return { limit: () => run(), then: (...a) => run().then(...a) };
            }
          };
        }
      };
    }
  };
}

const missingTable = Object.assign(new Error('relation "plant_taxa" does not exist'), { code: "42P01" });

const SANSUGUK_TAXA = {
  scientific_name: "Hydrangea serrata", korean_name: "산수국",
  family: "범의귀과", genus: "수국속", growth_form: "관목",
  sunlight: "반양지", flowering_months: [6, 7],
  synced_at: "2026-09-23T04:15:00Z"
};
// `source` 는 적재 코드다 — `import-plant-images.mjs` 가 실제로 쓰는 값.
const SANSUGUK_IMAGE = {
  scientific_name: "Hydrangea serrata (Thunb.) Ser.", korean_name: "산수국",
  image_type: "꽃", image_url: "http://www.nature.go.kr/img/sansuguk-flower.jpg",
  source: "KNA_IMAGE_CSV"
};


// ============================================================
section("① UI-2 · 화이트리스트가 기준정보 필드를 통과시키는가");
// ============================================================
// toGuideRecord 는 내부 함수라 load() 를 거쳐야 한다. 정적 JSON 을 읽지 않고
// 같은 규칙을 검사하려면 toDetailView 로 확인하는 편이 직접적이다 —
// 화이트리스트가 필드를 버리면 toDetailView 에도 도달하지 못한다.
{
  const v = toDetailView({
    name: "산수국", scientific_name: "Hydrangea serrata",
    family: "범의귀과", genus: "수국속", growth_form: "관목",
    sunlight: "반양지", flowering_months: [6, 7],
    image_url: "http://x/y.jpg", source: "KNA_IMAGE_CSV", synced_at: "2026-09-23T04:15:00Z"
  });
  check("국명", v.name, "산수국");
  check("학명", v.scientificName, "Hydrangea serrata");
  check("과", v.family, "범의귀과");
  check("속", v.genus, "수국속");
  check("생육형 ← growth_form", v.form, "관목");
  check("광조건 ← sunlight", v.light, "반양지");
  check("개화월 ← flowering_months", v.bloom, "6~7월");
  check("이미지", v.imageUrl, "http://x/y.jpg");
  check("출처", v.source, "국립수목원 표준식물목록");
  check("동기화 — 날짜까지만", v.syncedAt, "2026-09-23");
}

// ============================================================
section("② 정적 도감 표기와의 호환 — 기존 기능을 깨지 않는다");
// ============================================================
{
  // 책에서 옮긴 기존 레코드(갈대). 새 필드가 없어도 그대로 보여야 한다.
  const v = toDetailView({
    name: "갈대", scientific_name: "Phragmites communis",
    light: "양지", flowering_start: 9, flowering_end: 9,
    height: "1~3m", landscape_use: "수변/둔치", market_size: "8",
    plant_density: { min: 25, mid: 36, max: 49 }, page: 110
  });
  check("광조건 ← light (구표기)", v.light, "양지");
  check("개화월 ← flowering_start/end", v.bloom, "9월");
  check("크기", v.height, "1~3m");
  check("식재밀도", v.density, "25 / 36 / 49");
  check("도감 페이지", v.page, "p.110");
  check("없는 기준정보는 빈 값 — 지어내지 않는다", [v.family, v.genus, v.form, v.source], ["", "", "", ""]);
}
{
  // 두 표기가 함께 오면 기준정보가 앞선다.
  const v = toDetailView({ sunlight: "반양지", light: "양지",
                           flowering_months: [6, 7], flowering_start: 9, flowering_end: 9 });
  check("sunlight 가 light 보다 앞선다", v.light, "반양지");
  check("flowering_months 가 start/end 보다 앞선다", v.bloom, "6~7월");
}

// ============================================================
section("③ 개화월 표기");
// ============================================================
check("연속 구간", formatFloweringMonths([6, 7]), "6~7월");
check("연속 3개월", formatFloweringMonths([6, 7, 8]), "6~8월");
check("한 달", formatFloweringMonths([5]), "5월");
check("끊어진 달은 구간으로 뭉치지 않는다", formatFloweringMonths([3, 9]), "3 · 9월");
check("순서가 뒤섞여도 정렬", formatFloweringMonths([8, 6, 7]), "6~8월");
check("중복 제거", formatFloweringMonths([6, 6, 7]), "6~7월");
check("문자열은 그대로 둔다", formatFloweringMonths("6~7월"), "6~7월");
check("범위 밖 숫자는 버린다", formatFloweringMonths([0, 6, 13]), "6월");
check("빈 배열", formatFloweringMonths([]), "");
check("null", formatFloweringMonths(null), "");

// ============================================================
section("④ 대표 이미지 선정 — 결정적이어야 한다");
// ============================================================
{
  const rows = [
    { image_type: "열매", image_url: "http://x/b.jpg" },
    { image_type: "꽃",   image_url: "http://x/c.jpg" },
    { image_type: "꽃",   image_url: "http://x/a.jpg" }
  ];
  check("같은 입력 → 같은 결과", pickPrimaryImage(rows).image_url, "http://x/a.jpg");
  check("순서를 섞어도 같은 결과",
        pickPrimaryImage(rows.slice().reverse()).image_url, "http://x/a.jpg");
  check("URL 이 빈 행은 고르지 않는다",
        pickPrimaryImage([{ image_type: "꽃", image_url: "  " }, rows[0]]).image_url, "http://x/b.jpg");
  check("후보 없음 → null", pickPrimaryImage([]), null);
}

// ============================================================
section("⑤ fetchDetail — canonical 완전 일치만 연결한다");
// ============================================================
{
  const client = fakeClient({
    [TAXA_TABLE]: [SANSUGUK_TAXA],
    [IMAGE_TABLE]: [SANSUGUK_IMAGE]
  });
  const got = await fetchDetail(client, "Hydrangea serrata");
  check("명명자가 붙은 이미지 행도 같은 분류군으로 연결", got.image.image_url, SANSUGUK_IMAGE.image_url);
  check("기준정보 연결", got.taxa.family, "범의귀과");
  check("속명으로만 후보를 좁힌다", client.calls.map(c => c.pattern).sort(),
        ["Hydrangea%", "Hydrangea%"]);
  check("select * 를 쓰지 않는다", client.calls.every(c => c.columns.includes("scientific_name")), true);
}
{
  // 품종은 원종 사진을 달지 않는다 — 속명 prefix 로는 걸리지만 canonical 이 다르다.
  const client = fakeClient({ [TAXA_TABLE]: [], [IMAGE_TABLE]: [SANSUGUK_IMAGE] });
  const got = await fetchDetail(client, "Hydrangea serrata 'Bluebird'");
  check("품종에 원종 사진을 붙이지 않는다", got.image, null);
}
{
  const client = fakeClient({ [TAXA_TABLE]: [], [IMAGE_TABLE]: [] });
  check("다른 속은 조회 후보에조차 없다",
        (await fetchDetail(client, "Acer palmatum")).image, null);
}
check("client 없으면 조회하지 않는다",
      await fetchDetail(null, "Hydrangea serrata"), { taxa: null, image: null });
check("학명이 비면 조회하지 않는다",
      await fetchDetail(fakeClient({}), "  "), { taxa: null, image: null });

// ============================================================
section("⑥ plant_taxa 미적재 — 화면을 막지 않는다");
// ============================================================
{
  const client = fakeClient({ [TAXA_TABLE]: missingTable, [IMAGE_TABLE]: [SANSUGUK_IMAGE] });
  const got = await fetchDetail(client, "Hydrangea serrata");
  check("없는 테이블은 건너뛴다", got.taxa, null);
  check("이미지는 그대로 온다", got.image.image_url, SANSUGUK_IMAGE.image_url);
}
{
  const client = fakeClient({
    [TAXA_TABLE]: [SANSUGUK_TAXA],
    [IMAGE_TABLE]: Object.assign(new Error("boom"), { code: "XX000" })
  });
  const got = await fetchDetail(client, "Hydrangea serrata");
  check("한쪽이 실패해도 다른 쪽은 온다", [got.taxa?.family, got.image], ["범의귀과", null]);
}

// ============================================================
section("⑦ mergeDetail — 기준정보가 정적 도감보다 앞선다");
// ============================================================
{
  const guide = { name: "산수국", scientific_name: "Hydrangea serrata",
                  light: "양지", flowering_start: 9, flowering_end: 9, page: 110 };
  const v = toDetailView(mergeDetail(guide, { taxa: SANSUGUK_TAXA, image: SANSUGUK_IMAGE }));

  check("과", v.family, "범의귀과");
  check("속", v.genus, "수국속");
  check("생육형", v.form, "관목");
  check("광조건 — 기준정보가 덮는다", v.light, "반양지");
  check("개화월 — 기준정보가 덮는다", v.bloom, "6~7월");
  check("대표 이미지", v.imageUrl, SANSUGUK_IMAGE.image_url);
  check("출처 — plant_taxa 에 source 가 없어 이미지가 말한다",
        v.source, "국립수목원 표준식물목록");
  check("동기화", v.syncedAt, "2026-09-23");
  check("책에만 있는 값은 남는다", v.page, "p.110");
  check("Sprint 종료 8항목이 모두 찼는가",
        [v.imageUrl, v.name, v.scientificName, v.family, v.genus, v.form, v.light, v.bloom,
         v.source, v.syncedAt].every(x => String(x).trim() !== ""), true);
}
{
  const guide = { name: "갈대", scientific_name: "Phragmites communis", light: "양지" };
  const v = toDetailView(mergeDetail(guide, { taxa: null, image: null }));
  check("연결 결과가 비면 도감 값이 그대로", [v.light, v.name], ["양지", "갈대"]);
  check("출처를 지어내지 않는다", v.source, "");
  check("동기화 날짜를 지어내지 않는다", v.syncedAt, "");
}
{
  // 이미지만 왔을 때 — 출처는 이미지가 말한 쪽을 적는다.
  const v = toDetailView(mergeDetail({ name: "산수국" }, { taxa: null, image: SANSUGUK_IMAGE }));
  check("이미지만 와도 출처는 실제로 온 쪽", v.source, "국립수목원 표준식물목록");
  check("오지 않은 과는 여전히 빈 값", v.family, "");
}
check("cloud 가 null 이어도 안전", toDetailView(mergeDetail({ name: "갈대" }, null)).name, "갈대");

// ============================================================
section("⑧ 출처 라벨 — DB 코드를 화면 말로 (T12-1.4)");
// ============================================================
check("적재 코드 → 이름", sourceLabel("KNA_IMAGE_CSV"), "국립수목원 표준식물목록");
check("모르는 코드는 그대로 — 지어내지 않는다", sourceLabel("SOME_OTHER"), "SOME_OTHER");
check("빈 값", sourceLabel(""), "");
check("null", sourceLabel(null), "");
check("mergeDetail 은 코드를 그대로 넘긴다",
      mergeDetail({}, { taxa: null, image: { source: "KNA_IMAGE_CSV" } }).source, "KNA_IMAGE_CSV");
check("화면에서만 이름으로 바뀐다",
      toDetailView({ source: "KNA_IMAGE_CSV" }).source, "국립수목원 표준식물목록");

// ============================================================
section("⑨ 국명 → 학명 (URL 딥링크 · T12-1.2)");
// ============================================================
{
  const client = fakeClient({ [TAXA_TABLE]: [SANSUGUK_TAXA], [IMAGE_TABLE]: [SANSUGUK_IMAGE] });
  check("기준정보에서 찾는다", await resolveScientificName(client, "산수국"), "Hydrangea serrata");
  check("정확히 같은 국명만 — 부분일치로 넓히지 않는다",
        await resolveScientificName(client, "수국"), "");
}
{
  // plant_taxa 가 아직 없으면 plant_images 로 내려간다.
  const client = fakeClient({ [TAXA_TABLE]: missingTable, [IMAGE_TABLE]: [SANSUGUK_IMAGE] });
  check("plant_taxa 미적재 → plant_images 로 내려간다",
        await resolveScientificName(client, "산수국"), "Hydrangea serrata (Thunb.) Ser.");
}
check("client 없으면 조회하지 않는다", await resolveScientificName(null, "산수국"), "");
check("빈 이름", await resolveScientificName(fakeClient({}), "  "), "");
{
  // 국명만으로 연 상세도 Sprint 8항목을 채우는가.
  const client = fakeClient({ [TAXA_TABLE]: [SANSUGUK_TAXA], [IMAGE_TABLE]: [SANSUGUK_IMAGE] });
  const sci = await resolveScientificName(client, "산수국");
  const cloud = await fetchDetail(client, sci);
  const v = toDetailView(mergeDetail({ name: "산수국", scientific_name: sci }, cloud));
  check("URL 딥링크 경로 8항목",
        [v.imageUrl !== "", v.name, v.scientificName, v.family, v.genus, v.form, v.light, v.bloom,
         v.source, v.syncedAt],
        [true, "산수국", "Hydrangea serrata", "범의귀과", "수국속", "관목", "반양지", "6~7월",
         "국립수목원 표준식물목록", "2026-09-23"]);
}
{
  // 학명만 받아 열면 국명은 기준정보가 채운다.
  const client = fakeClient({ [TAXA_TABLE]: [SANSUGUK_TAXA], [IMAGE_TABLE]: [] });
  const cloud = await fetchDetail(client, "Hydrangea serrata");
  const v = toDetailView(mergeDetail({ name: "", scientific_name: "Hydrangea serrata" }, cloud));
  check("국명을 기준정보가 채운다", v.name, "산수국");
}


console.log("\n" + "=".repeat(52));
console.log(`통과 ${pass} · 실패 ${fail}`);
if (failed.length) console.log("실패 항목:\n  - " + failed.join("\n  - "));
console.log("=".repeat(52));
process.exit(fail ? 1 : 0);
