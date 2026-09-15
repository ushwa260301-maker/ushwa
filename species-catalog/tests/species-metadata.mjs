#!/usr/bin/env node
/**
 * 식물 도감 메타데이터 회귀 테스트 — `species.metadata`.
 *
 *   node species-catalog/tests/species-metadata.mjs
 *
 * 이 파일이 지키는 계약
 *   ① metadata 는 **Species 레코드 안에 산다** (별도 저장소 없음)
 *   ② metadata 가 없는 기존 Species 도 그대로 열린다 (빈 객체 자동 부여)
 *   ③ 알 수 없는 필드는 저장하지 않는다
 *   ④ Cloud 에서 읽어온 Species(metadata 컬럼 없음)도 빈 객체를 갖는다
 *   ⑤ species 배열이 통째로 직렬화되므로 JSON 저장/불러오기가 자동으로 따라온다
 */

const {
  emptyMetadata, normalizeMetadata, hasMetadata, withMetadata,
  iconFor, METADATA_FIELDS, DISPLAY_FIELDS, API_FIELDS,
  SUNLIGHT_OPTIONS, EVERGREEN_OPTIONS,
  renderBloomMonths, isApiLinked, isInfoPending, isMetadataReadOnly
} = await import("../js/utils.js");

/** 최소 DOM 스텁 — renderBloomMonths 가 쓰는 API 만 흉내낸다. */
function stubEl() {
  const el = {
    children: [], innerHTML: "", className: "", textContent: "", attrs: {},
    appendChild(c) { this.children.push(c); },
    setAttribute(k, v) { this.attrs[k] = v; }
  };
  return el;
}
globalThis.document = {
  createElement: () => stubEl()
};

let pass = 0, fail = 0;
const failed = [];
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : (fail++, failed.push(label));
  console.log(`${ok ? "✓" : "✗"} ${label}` +
              (ok ? "" : `\n    기대: ${JSON.stringify(expected)}\n    실제: ${JSON.stringify(actual)}`));
}
function section(t) { console.log(`\n── ${t} ${"─".repeat(Math.max(0, 50 - t.length))}`); }

// ============================================================
section("1. 기존 Species 자동 호환");
// ============================================================
const legacy = { id: "sp-001", name: "느티나무", latin: "Zelkova serrata", category: "교목" };
check("metadata 없는 Species → 빈 metadata 부여",
      withMetadata(legacy).metadata, emptyMetadata());
check("기존 필드는 그대로 보존",
      (({ id, name, latin, category }) => ({ id, name, latin, category }))(withMetadata(legacy)),
      { id: "sp-001", name: "느티나무", latin: "Zelkova serrata", category: "교목" });
check("원본을 변형하지 않는다", legacy.metadata, undefined);
check("빈 metadata 필드 수", Object.keys(emptyMetadata()).length, METADATA_FIELDS.length);
check("hasMetadata(빈 값) = false", hasMetadata(emptyMetadata()), false);
check("undefined 도 던지지 않는다", normalizeMetadata(undefined), emptyMetadata());
check("null 도 던지지 않는다", normalizeMetadata(null), emptyMetadata());
check("문자열이 들어와도 빈 객체", normalizeMetadata("아무거나"), emptyMetadata());

// ============================================================
section("2. metadata 는 Species 안에 산다");
// ============================================================
const sp = withMetadata({
  id: "sp-010", name: "라임라이트", latin: "Hydrangea paniculata 'Limelight'",
  category: "관목", bloomMonths: [6, 7, 8, 9],
  metadata: { sunlight: "반양지", indoorOutdoor: "실외", nativeStatus: "외래종",
              evergreen: "낙엽", description: "여름에 흰 꽃이 피는 관목" }
});
check("sunlight", sp.metadata.sunlight, "반양지");
check("indoorOutdoor", sp.metadata.indoorOutdoor, "실외");
check("nativeStatus", sp.metadata.nativeStatus, "외래종");
check("evergreen", sp.metadata.evergreen, "낙엽");
check("description", sp.metadata.description, "여름에 흰 꽃이 피는 관목");
check("hasMetadata = true", hasMetadata(sp.metadata), true);

// 학명·분류·개화는 중복하지 않는다 — 기존 Species 필드가 담당
check("학명은 species.latin", sp.latin, "Hydrangea paniculata 'Limelight'");
check("분류는 species.category", sp.category, "관목");
check("개화는 species.bloomMonths", sp.bloomMonths, [6, 7, 8, 9]);
check("metadata 에 학명 중복 없음", "scientificName" in sp.metadata, false);

// ============================================================
section("3. JSON 왕복 — 별도 저장소 없이 따라온다");
// ============================================================
const roundTripped = JSON.parse(JSON.stringify({ species: [sp] })).species[0];
check("JSON 왕복 후에도 metadata 유지", roundTripped.metadata, sp.metadata);
check("왕복 후 hasMetadata", hasMetadata(roundTripped.metadata), true);

// ============================================================
section("4. 일부 필드만 입력");
// ============================================================
const partial = normalizeMetadata({ sunlight: "양지" });
check("입력한 필드", partial.sunlight, "양지");
check("입력 안 한 필드는 빈 문자열", partial.description, "");
check("hasMetadata = true", hasMetadata(partial), true);
check("공백만 입력 → 빈 값으로 정규화",
      normalizeMetadata({ description: "   " }).description, "");
check("공백만 있으면 hasMetadata = false",
      hasMetadata(normalizeMetadata({ description: "   " })), false);

// ============================================================
section("5. 알 수 없는 필드는 버린다");
// ============================================================
const dirty = normalizeMetadata({ sunlight: "음지", hackField: "x", id: "sp-999" });
check("알려진 필드만 남는다", Object.keys(dirty).sort(), [...METADATA_FIELDS].sort());
check("주입된 필드 없음", dirty.hackField, undefined);
check("id 주입 없음", dirty.id, undefined);
check("숫자도 문자열로 정규화", normalizeMetadata({ sunlight: 3 }).sunlight, "3");

// ============================================================
section("6. Cloud 에서 읽어온 Species (metadata 컬럼 없음)");
// ============================================================
// cloudStore.speciesFromDb 는 8개 필드만 돌려준다 — metadata 가 없다.
const fromCloud = { id: "sp-020", name: "설유화", latin: "", category: "관목",
                    bloomMonths: [4, 5], colors: [], suppliers: [], notes: "" };
check("Cloud Species 도 빈 metadata 를 갖는다",
      withMetadata(fromCloud).metadata, emptyMetadata());
check("카드가 영역을 감출 수 있다",
      hasMetadata(withMetadata(fromCloud).metadata), false);

// ============================================================
section("7. 아이콘 조회");
// ============================================================
check("양지 아이콘", iconFor(SUNLIGHT_OPTIONS, "양지"), "☀️");
check("낙엽 아이콘", iconFor(EVERGREEN_OPTIONS, "낙엽"), "🍂");
check("없는 값 → 빈 문자열", iconFor(SUNLIGHT_OPTIONS, "해당없음"), "");
check("빈 값 → 빈 문자열", iconFor(SUNLIGHT_OPTIONS, ""), "");

// ============================================================
section("8. 개화 월 블록 — 1~12월 항상 표시");
// ============================================================
const strip = stubEl();
renderBloomMonths(strip, [3, 4, 5, 6]);
check("항상 12칸", strip.children.length, 12);
check("3월 활성", strip.children[2].className, "ph-cell active");
check("1월 비활성", strip.children[0].className, "ph-cell");
check("6월 활성", strip.children[5].className, "ph-cell active");
check("7월 비활성", strip.children[6].className, "ph-cell");
check("활성 칸 수 = 4", strip.children.filter(c => c.className.includes("active")).length, 4);
check("칸 내용은 월 숫자", strip.children.map(c => c.textContent).join(","),
      "1,2,3,4,5,6,7,8,9,10,11,12");
check("활성 칸 title", strip.children[2].title, "3월 개화");
check("비활성 칸 title", strip.children[0].title, "1월");

const empty = stubEl();
renderBloomMonths(empty, []);
check("개화월 없음 → 12칸 전부 비활성", empty.children.filter(c => c.className.includes("active")).length, 0);
check("개화월 없어도 12칸은 그린다", empty.children.length, 12);

const undef = stubEl();
renderBloomMonths(undef, undefined);
check("undefined 도 12칸", undef.children.length, 12);
check("null container 는 던지지 않는다", (renderBloomMonths(null, [1]), true), true);

const strNums = stubEl();
renderBloomMonths(strNums, ["5", "6"]);
check("문자열 월도 인식", strNums.children.filter(c => c.className.includes("active")).length, 2);

// ============================================================
section("9. 국가 식물 DB 연동 (Ticket #002)");
// ============================================================
check("METADATA_FIELDS = 표시 + 연결", METADATA_FIELDS.length,
      DISPLAY_FIELDS.length + API_FIELDS.length);
check("연결 필드 3개", [...API_FIELDS].sort(),
      ["plant_api_id", "plant_api_source", "plant_api_synced_at"]);

const linked = normalizeMetadata({
  plant_api_id: "KNA-12345", plant_api_source: "국립수목원",
  plant_api_synced_at: "2026-09-15T02:00:00Z",
  sunlight: "양지"
});
check("isApiLinked = true", isApiLinked(linked), true);
check("읽기 전용", isMetadataReadOnly(linked), true);
check("내용이 있으면 준비중 아님", isInfoPending(linked), false);
check("연결 필드 보존", linked.plant_api_id, "KNA-12345");
check("출처 보존", linked.plant_api_source, "국립수목원");

const pending = normalizeMetadata({ plant_api_id: "KNA-99999", plant_api_source: "국립수목원" });
check("연결됐지만 내용 없음 → 정보 준비중", isInfoPending(pending), true);
check("표시할 값은 없다", hasMetadata(pending), false);
check("그래도 읽기 전용", isMetadataReadOnly(pending), true);

const plain = normalizeMetadata({ sunlight: "음지" });
check("연결 없으면 isApiLinked = false", isApiLinked(plain), false);
check("연결 없으면 준비중 아님 (영역 감춤)", isInfoPending(plain), false);
check("연결 없으면 편집 가능", isMetadataReadOnly(plain), false);

const none = emptyMetadata();
check("아무것도 없으면 준비중 아님", isInfoPending(none), false);
check("아무것도 없으면 표시 안 함", hasMetadata(none), false);

check("연결 정보는 hasMetadata 에 세지 않는다",
      hasMetadata(normalizeMetadata({ plant_api_id: "X" })), false);
check("빈 문자열 id 는 연결 아님", isApiLinked(normalizeMetadata({ plant_api_id: "  " })), false);

const legacyLinked = withMetadata({ id: "sp-050", name: "소나무" });
check("기존 Species 는 연결 필드도 빈 값", legacyLinked.metadata.plant_api_id, "");
check("기존 Species 는 준비중 아님", isInfoPending(legacyLinked.metadata), false);

// ============================================================
console.log("\n" + "=".repeat(52));
console.log(`통과 ${pass} · 실패 ${fail}`);
if (fail) { console.log("\n실패 항목:"); for (const l of failed) console.log("  ✗ " + l); }
console.log("=".repeat(52));
process.exit(fail ? 1 : 0);
