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
  iconFor, METADATA_FIELDS, SUNLIGHT_OPTIONS, EVERGREEN_OPTIONS
} = await import("../js/utils.js");

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
console.log("\n" + "=".repeat(52));
console.log(`통과 ${pass} · 실패 ${fail}`);
if (fail) { console.log("\n실패 항목:"); for (const l of failed) console.log("  ✗ " + l); }
console.log("=".repeat(52));
process.exit(fail ? 1 : 0);
