#!/usr/bin/env node
/**
 * 도감 메타데이터 회귀 테스트 — `species.metadata` (T10 구조).
 *
 *   node species-catalog/tests/species-metadata.mjs
 *
 * 계약
 *   ① metadata 는 Species 레코드 안에 산다 (별도 저장소 없음)
 *   ② metadata 없는 기존 Species 도 그대로 열린다
 *   ③ 알 수 없는 필드는 저장하지 않는다
 *   ④ 출처를 항상 말할 수 있다 — 국립수목원 / 사용자 추가 / 미연동
 */

const {
  emptyMetadata, normalizeMetadata, hasMetadata, withMetadata,
  normalizeMonths, normalizeTriBool, metadataSource,
  isApiLinked, isMetadataReadOnly, renderBloomMonths, iconFor,
  METADATA_FIELDS, DISPLAY_FIELDS, API_FIELDS,
  METADATA_TEXT_FIELDS, METADATA_MONTH_FIELDS, METADATA_BOOL_FIELDS,
  SUNLIGHT_OPTIONS, PROVIDER_LABELS
} = await import("../js/utils.js");

function stubEl() {
  return { children: [], innerHTML: "", className: "", textContent: "", attrs: {},
           appendChild(c) { this.children.push(c); },
           setAttribute(k, v) { this.attrs[k] = v; } };
}
globalThis.document = { createElement: () => stubEl() };

let pass = 0, fail = 0; const failed = [];
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : (fail++, failed.push(label));
  console.log(`${ok ? "✓" : "✗"} ${label}` +
              (ok ? "" : `\n    기대: ${JSON.stringify(expected)}\n    실제: ${JSON.stringify(actual)}`));
}
function section(t) { console.log(`\n── ${t} ${"─".repeat(Math.max(0, 48 - t.length))}`); }

// ============================================================
section("1. 기존 Species 자동 호환");
// ============================================================
const legacy = { id: "sp-001", name: "느티나무", latin: "Zelkova serrata", category: "교목" };
check("빈 metadata 부여", withMetadata(legacy).metadata, emptyMetadata());
check("원본 불변", legacy.metadata, undefined);
check("기존 필드 보존", withMetadata(legacy).name, "느티나무");
check("hasMetadata = false", hasMetadata(emptyMetadata()), false);
check("null 안전", normalizeMetadata(null), emptyMetadata());
check("문자열 입력 안전", normalizeMetadata("x"), emptyMetadata());
check("필드 구성", METADATA_FIELDS.length,
      METADATA_TEXT_FIELDS.length + METADATA_MONTH_FIELDS.length +
      METADATA_BOOL_FIELDS.length + API_FIELDS.length);
check("DISPLAY + API = 전체", DISPLAY_FIELDS.length + API_FIELDS.length, METADATA_FIELDS.length);

// ============================================================
section("2. T10 확장 필드");
// ============================================================
const m = normalizeMetadata({
  scientific_name: "Hydrangea serrata", family: "Hydrangeaceae", genus: "Hydrangea",
  flowering_months: [6, 7, 8], fruiting_months: [9, 10],
  sunlight: "반음지", soil: "습윤", plant_type: "관목", evergreen: false,
  indoorOutdoor: "실외", nativeStatus: "자생종", description: "산수국",
  image_url: "https://x/1.jpg", thumbnail_url: "https://x/t.jpg",
  plant_api_source: "kna", plant_api_id: "KNA00012345",
  plant_api_synced_at: "2026-09-15T07:30:00Z"
});
check("학명", m.scientific_name, "Hydrangea serrata");
check("과", m.family, "Hydrangeaceae");
check("속", m.genus, "Hydrangea");
check("개화월", m.flowering_months, [6, 7, 8]);
check("결실월", m.fruiting_months, [9, 10]);
check("토양", m.soil, "습윤");
check("분류", m.plant_type, "관목");
check("낙엽(false)", m.evergreen, false);
check("대표 사진", m.image_url, "https://x/1.jpg");
check("썸네일", m.thumbnail_url, "https://x/t.jpg");
check("출처 코드", m.plant_api_source, "kna");
check("출처 id", m.plant_api_id, "KNA00012345");
check("hasMetadata = true", hasMetadata(m), true);

// ============================================================
section("3. 값 정규화");
// ============================================================
check("월 범위 밖 제거", normalizeMonths([0, 3, 13, 5]), [3, 5]);
check("월 문자열 → 숫자", normalizeMonths(["4", "5"]), [4, 5]);
check("월 단건 → 배열", normalizeMonths(6), [6]);
check("월 null", normalizeMonths(null), []);
check("상록 true", normalizeTriBool(true), true);
check("낙엽 false", normalizeTriBool(false), false);
check("구버전 '상록' 문자열", normalizeTriBool("상록"), true);
check("구버전 '낙엽' 문자열", normalizeTriBool("낙엽"), false);
check("미지정", normalizeTriBool(""), "");
check("알 수 없는 값 → 미지정", normalizeTriBool("아무거나"), "");
check("evergreen false 도 값으로 센다", hasMetadata(normalizeMetadata({ evergreen: false })), true);

// ============================================================
section("4. 알 수 없는 필드 차단");
// ============================================================
const dirty = normalizeMetadata({ sunlight: "음지", hackField: "x", id: "sp-999" });
check("알려진 필드만", Object.keys(dirty).sort(), [...METADATA_FIELDS].sort());
check("주입 없음", dirty.hackField, undefined);

// ============================================================
section("5. 출처 — 국립수목원 / 사용자 추가 / 미연동");
// ============================================================
check("API 연동", metadataSource(m), { kind: "api", code: "kna", label: "국립수목원" });
check("nire 라벨", metadataSource({ plant_api_source: "nire" }).label, "국립생물자원관");
check("gbif 라벨", metadataSource({ plant_api_source: "gbif" }).label, "GBIF");
check("모르는 코드는 그대로", metadataSource({ plant_api_source: "zzz" }).label, "zzz");
check("사용자 입력", metadataSource(normalizeMetadata({ sunlight: "양지" })),
      { kind: "user", code: "", label: "사용자 추가" });
check("미연동", metadataSource(emptyMetadata()), { kind: "none", code: "", label: "미연동" });
check("PROVIDER_LABELS 3종", Object.keys(PROVIDER_LABELS).sort(), ["gbif", "kna", "nire"]);

check("연동 = 읽기 전용", isMetadataReadOnly(m), true);
check("사용자 입력 = 편집 가능", isMetadataReadOnly(normalizeMetadata({ sunlight: "양지" })), false);
check("연결 정보만 있으면 표시값 없음", hasMetadata(normalizeMetadata({ plant_api_source: "kna" })), false);
check("그래도 연동 상태", isApiLinked(normalizeMetadata({ plant_api_source: "kna" })), true);

// ============================================================
section("6. JSON 왕복");
// ============================================================
const sp = withMetadata({ id: "sp-010", name: "산수국", metadata: m });
const rt = JSON.parse(JSON.stringify({ species: [sp] })).species[0];
check("왕복 후 유지", rt.metadata, sp.metadata);
check("왕복 후 출처", metadataSource(rt.metadata).label, "국립수목원");

// ============================================================
section("7. 개화 월 블록");
// ============================================================
const strip = stubEl();
renderBloomMonths(strip, [3, 4, 5, 6]);
check("항상 12칸", strip.children.length, 12);
check("3월 활성", strip.children[2].className, "ph-cell active");
check("1월 비활성", strip.children[0].className, "ph-cell");
check("활성 4칸", strip.children.filter(c => c.className.includes("active")).length, 4);
const empty = stubEl(); renderBloomMonths(empty, []);
check("빈 값도 12칸", empty.children.length, 12);
check("null container 안전", (renderBloomMonths(null, [1]), true), true);
check("양지 아이콘", iconFor(SUNLIGHT_OPTIONS, "양지"), "☀️");

// ============================================================
console.log("\n" + "=".repeat(52));
console.log(`통과 ${pass} · 실패 ${fail}`);
if (fail) { console.log("\n실패 항목:"); for (const l of failed) console.log("  ✗ " + l); }
console.log("=".repeat(52));
process.exit(fail ? 1 : 0);
