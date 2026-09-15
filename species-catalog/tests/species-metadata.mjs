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
  normalizeMonths, metadataSource, normalizeEvergreen,
  normalizeSunlight, normalizeNativeStatus, normalizeDescription, normalizePhotos,
  SUNLIGHT_ENUM, NATIVE_STATUS_ENUM, PHOTO_TYPES, labelForEnum,
  SUNLIGHT_LABELS, NATIVE_STATUS_LABELS,
  isApiLinked, isMetadataReadOnly, renderBloomMonths, iconFor,
  METADATA_FIELDS, DISPLAY_FIELDS, API_FIELDS,
  METADATA_TEXT_FIELDS, METADATA_MONTH_FIELDS, EVERGREEN_ENUM,
  SUNLIGHT_OPTIONS, PROVIDER_LABELS,
  CURRENT_SCHEMA_VERSION, META_VERSION_FIELD, PHOTO_SOURCES, normalizeProvider,
  upgradeMetadata, resolveSyncStatus
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
check("필드 구성", METADATA_FIELDS.length, 1 /* schema_version */ + DISPLAY_FIELDS.length + API_FIELDS.length);
check("표시 필드 구성", DISPLAY_FIELDS.length,
      METADATA_TEXT_FIELDS.length + METADATA_MONTH_FIELDS.length +
      1 /* sunlight */ + 3 /* nativeStatus · evergreen · sync_status */ +
      1 /* description */ + 1 /* photos */);
check("DISPLAY + API + 버전 = 전체", 1 + DISPLAY_FIELDS.length + API_FIELDS.length, METADATA_FIELDS.length);

// ============================================================
section("2. T10 확장 필드");
// ============================================================
const m = normalizeMetadata({
  scientific_name: "Hydrangea serrata", family: "Hydrangeaceae", genus: "Hydrangea",
  flowering_months: [6, 7, 8], fruiting_months: [9, 10],
  sunlight: ["partial_shade"], soil: "습윤", plant_type: "관목", evergreen: "DECIDUOUS",
  indoorOutdoor: "실외", nativeStatus: "native",
  description: { summary: "산수국", source: "국립수목원" },
  photos: [{ url: "https://x/1.jpg", type: "flower", source: "kna" }],
  provider: { name: "kna", record_id: "KNA00012345",
              synced_at: "2026-09-15T07:30:00Z", version: "2026-09" },
  schema_version: 2, sync_status: "SYNCED"
});
check("학명", m.scientific_name, "Hydrangea serrata");
check("과", m.family, "Hydrangeaceae");
check("속", m.genus, "Hydrangea");
check("개화월", m.flowering_months, [6, 7, 8]);
check("결실월", m.fruiting_months, [9, 10]);
check("토양", m.soil, "습윤");
check("분류", m.plant_type, "관목");
check("낙엽 enum", m.evergreen, "DECIDUOUS");
check("사진 배열이 source of truth", m.photos,
      [{ url: "https://x/1.jpg", type: "flower", caption: "", source: "kna" }]);
check("image_url 은 photos 에서 파생", m.image_url, "https://x/1.jpg");
check("thumbnail_url 도 파생", m.thumbnail_url, "https://x/1.jpg");
check("광 조건 enum 배열", m.sunlight, ["partial_shade"]);
check("자생 enum", m.nativeStatus, "native");
check("설명 구조", m.description, { summary: "산수국", source: "국립수목원", note: "" });
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
check("enum 4종", EVERGREEN_ENUM, ["EVERGREEN", "DECIDUOUS", "SEMI_EVERGREEN", "UNKNOWN"]);
check("구버전 true → EVERGREEN", normalizeEvergreen(true), "EVERGREEN");
check("구버전 false → DECIDUOUS", normalizeEvergreen(false), "DECIDUOUS");
check("구버전 '상록' 문자열", normalizeEvergreen("상록"), "EVERGREEN");
check("반상록", normalizeEvergreen("반상록"), "SEMI_EVERGREEN");
check("미지정", normalizeEvergreen(""), "UNKNOWN");
check("알 수 없는 값 → UNKNOWN", normalizeEvergreen("아무거나"), "UNKNOWN");
check("DECIDUOUS 도 값으로 센다", hasMetadata(normalizeMetadata({ evergreen: false })), true);
check("UNKNOWN 은 값으로 세지 않는다", hasMetadata(normalizeMetadata({ evergreen: "" })), false);

// ============================================================
section("4. 알 수 없는 필드 차단");
// ============================================================
const dirty = normalizeMetadata({ sunlight: "shade", hackField: "x", id: "sp-999" });
check("알려진 필드만", Object.keys(dirty).sort(), [...METADATA_FIELDS].sort());
check("주입 없음", dirty.hackField, undefined);

// ============================================================
section("5. 출처 — 국립수목원 / 사용자 추가 / 미연동");
// ============================================================
check("API 연동", metadataSource(m),
      { kind: "api", status: "SYNCED", code: "kna", label: "국립수목원" });
check("새 판이 있으면 갱신 필요", metadataSource(m, { kna: "2026-10" }).kind, "stale");
check("nire 라벨", metadataSource({ plant_api_source: "nire" }).label, "국립생물자원관");
check("gbif 라벨", metadataSource({ plant_api_source: "gbif" }).label, "GBIF");
check("모르는 코드는 그대로", metadataSource({ plant_api_source: "zzz" }).label, "zzz");
check("사용자 입력", metadataSource(normalizeMetadata({ sunlight: "full_sun" })).kind, "user");
check("미연동", metadataSource(emptyMetadata()).kind, "none");
// 상태 필드 없이 v2 로 기록된 레코드도 정규화와 계산이 같은 답을 내야 한다.
check("v2 인데 상태가 없으면 추론",
      normalizeMetadata({ schema_version: 2, provider: { name: "kna" } }).sync_status, "SYNCED");
check("정규화와 계산이 같은 답",
      normalizeMetadata({ schema_version: 2, provider: { name: "kna" } }).sync_status,
      resolveSyncStatus({ schema_version: 2, provider: { name: "kna" } }));
check("PROVIDER_LABELS 3종", Object.keys(PROVIDER_LABELS).sort(), ["gbif", "kna", "nire"]);

check("연동 = 읽기 전용", isMetadataReadOnly(m), true);
check("사용자 입력 = 편집 가능", isMetadataReadOnly(normalizeMetadata({ sunlight: "full_sun" })), false);
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
check("양지 표기", labelForEnum(SUNLIGHT_LABELS, "full_sun"), "☀️ 양지");

// ============================================================
section("8. T10.1 — enum · 사진 · 설명 구조");
// ============================================================
check("SUNLIGHT_ENUM", SUNLIGHT_ENUM, ["full_sun", "partial_sun", "partial_shade", "shade"]);
check("NATIVE_STATUS_ENUM", NATIVE_STATUS_ENUM, ["native", "naturalized", "introduced", "cultivar"]);
check("PHOTO_TYPES", PHOTO_TYPES, ["flower", "leaf", "habit", "fruit"]);

check("normalizeSunlight 한글 → enum", normalizeSunlight("반음지"), ["partial_shade"]);
check("구분자로 붙은 원문", normalizeSunlight("양지/반음지"), ["full_sun", "partial_shade"]);
check("enum 순서로 정렬", normalizeSunlight(["shade", "full_sun"]), ["full_sun", "shade"]);
check("중복 제거", normalizeSunlight(["양지", "full_sun"]), ["full_sun"]);
check("모르는 값은 버린다", normalizeSunlight("아무거나"), []);
check("빈 값", normalizeSunlight(""), []);

check("normalizeNativeStatus 한글", normalizeNativeStatus("자생종"), "native");
check("귀화종", normalizeNativeStatus("귀화종"), "naturalized");
check("외래종", normalizeNativeStatus("외래종"), "introduced");
check("재배품종", normalizeNativeStatus("재배품종"), "cultivar");
check("enum 그대로", normalizeNativeStatus("cultivar"), "cultivar");
check("모르는 값은 빈 문자열", normalizeNativeStatus("???"), "");
check("자생 표기", labelForEnum(NATIVE_STATUS_LABELS, "naturalized"), "🌾 귀화종");

check("설명 문자열 → 구조", normalizeDescription("설명입니다", "국립수목원"),
      { summary: "설명입니다", source: "국립수목원", note: "" });
check("HTML 은 저장하지 않는다",
      normalizeDescription("<p>산지 <b>계곡</b>에 자란다</p>").summary, "산지 계곡에 자란다");
check("br 은 공백으로", normalizeDescription("가<br>나").summary, "가 나");
check("엔티티 복원", normalizeDescription("가&amp;나").summary, "가&나");
check("빈 설명은 출처도 비움", normalizeDescription("", "국립수목원"),
      { summary: "", source: "", note: "" });
check("구조 그대로 받기", normalizeDescription({ summary: "가", source: "GBIF" }),
      { summary: "가", source: "GBIF", note: "" });
// note 는 사용자 메모다 — 출처가 주지 않고, 동기화가 지우지 않는다.
check("사용자 메모 보존", normalizeDescription({ summary: "가", note: "현장 메모" }).note, "현장 메모");
check("메모도 HTML 은 벗긴다", normalizeDescription({ note: "<b>메모</b>" }).note, "메모");

check("사진 문자열 배열도 받는다",
      normalizePhotos(["https://x/a.jpg"]), [{ url: "https://x/a.jpg", type: "", caption: "", source: "" }]);
check("종류 한글 → enum",
      normalizePhotos([{ url: "u", type: "꽃" }])[0].type, "flower");
check("모르는 종류는 빈 값 (habit 으로 밀어 넣지 않는다)",
      normalizePhotos([{ url: "u", type: "???" }])[0].type, "");
check("URL 중복 제거", normalizePhotos(["u", "u"]).length, 1);
check("최대 5장", normalizePhotos(Array.from({ length: 9 }, (_, i) => `u${i}`)).length, 5);
check("url 없는 항목은 버린다", normalizePhotos([{ type: "flower" }]), []);

// 구버전 데이터 호환
const legacyMeta = normalizeMetadata({
  sunlight: "양지", nativeStatus: "외래종", description: "<b>옛 설명</b>",
  image_url: "https://x/old.jpg", evergreen: "낙엽"
});
check("구버전 sunlight 문자열", legacyMeta.sunlight, ["full_sun"]);
check("구버전 nativeStatus", legacyMeta.nativeStatus, "introduced");
check("구버전 description 문자열", legacyMeta.description.summary, "옛 설명");
check("구버전 image_url → photos", legacyMeta.photos, [{ url: "https://x/old.jpg", type: "", caption: "", source: "" }]);
check("구버전 evergreen 문자열", legacyMeta.evergreen, "DECIDUOUS");
check("구버전도 hasMetadata", hasMetadata(legacyMeta), true);

// ============================================================
section("9. P0 — schema_version · provider · photos[].source");
// ============================================================
check("빈 metadata 에도 버전", emptyMetadata()[META_VERSION_FIELD], CURRENT_SCHEMA_VERSION);
check("현재 버전은 2", CURRENT_SCHEMA_VERSION, 2);
check("버전 없으면 현재 판으로", normalizeMetadata({})[META_VERSION_FIELD], CURRENT_SCHEMA_VERSION);
check("정수가 아니면 현재 판", normalizeMetadata({ schema_version: 0.5 })[META_VERSION_FIELD], CURRENT_SCHEMA_VERSION);
check("읽은 값은 항상 현재 판", normalizeMetadata({ schema_version: 1 })[META_VERSION_FIELD], CURRENT_SCHEMA_VERSION);
check("업그레이드 후 상태 부여", normalizeMetadata({ schema_version: 1 }).sync_status, "PENDING");

check("provider 구조", m.provider,
      { name: "kna", record_id: "KNA00012345", synced_at: "2026-09-15T07:30:00Z", version: "2026-09" });
check("데이터셋 판 보존", m.provider.version, "2026-09");
check("plant_api_* 는 provider 파생", [m.plant_api_source, m.plant_api_id],
      ["kna", "KNA00012345"]);
check("빈 provider", normalizeProvider(null), { name: "", record_id: "", synced_at: "", version: "" });
check("name 없으면 나머지도 비운다", normalizeProvider({ record_id: "X" }).record_id, "");

// 구버전(plant_api_* 만 있는 레코드) → provider 복원
const legacyProvider = normalizeMetadata({
  plant_api_source: "gbif", plant_api_id: "G-1", plant_api_synced_at: "2026-01-01T00:00:00Z"
});
check("구버전에서 provider 복원", legacyProvider.provider.name, "gbif");
check("record_id 복원", legacyProvider.provider.record_id, "G-1");
check("판 정보는 없으면 빈 값", legacyProvider.provider.version, "");
check("구버전도 연동으로 인식", isApiLinked(legacyProvider), true);
check("구버전 출처 라벨", metadataSource(legacyProvider).label, "GBIF");

check("PHOTO_SOURCES 4종", PHOTO_SOURCES, ["kna", "nire", "gbif", "user"]);
check("사진 출처 보존", normalizePhotos([{ url: "u", source: "user" }])[0].source, "user");
check("모르는 출처는 빈 값", normalizePhotos([{ url: "u", source: "zzz" }])[0].source, "");
check("기본 출처 주입", normalizePhotos([{ url: "u" }], 5, "nire")[0].source, "nire");
check("항목 출처가 기본보다 우선",
      normalizePhotos([{ url: "u", source: "user" }], 5, "kna")[0].source, "user");

// ============================================================
section("11. 멱등성 — normalizeMetadata 를 여러 번 지나간다");
// ============================================================
/**
 * 실제 호출 경로가 이렇다: Cloud 로드에서 한 번 · LocalStorage 병합에서 한 번 ·
 * 저장 직전에 다시 한 번. 같은 레코드가 세 번 정규화되므로, 두 번째 통과에서
 * 값이 바뀌면 사용자가 본 화면과 DB 에 들어간 값이 달라진다.
 */
for (const [label, input] of Object.entries({
  "빈 입력":       {},
  "구버전 사진":   { image_url: "https://x/a.jpg" },
  "구버전 연동":   { plant_api_source: "kna", plant_api_id: "K1", evergreen: false },
  "한글 구버전":   { sunlight: "양지", description: "설명 문장", flowering_months: [5, 6] },
  "사용자 입력":   { sunlight: "full_sun", soil: "사질양토" }
})) {
  const once = normalizeMetadata(input);
  check(`${label} — 두 번째가 같다`, normalizeMetadata(once), once);
  check(`${label} — 왕복 후에도 같다`, normalizeMetadata(JSON.parse(JSON.stringify(once))), once);
}

// ============================================================
console.log("\n" + "=".repeat(52));
console.log(`통과 ${pass} · 실패 ${fail}`);
if (fail) { console.log("\n실패 항목:"); for (const l of failed) console.log("  ✗ " + l); }
console.log("=".repeat(52));
process.exit(fail ? 1 : 0);
