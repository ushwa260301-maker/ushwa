#!/usr/bin/env node
/**
 * 식물 도감 메타데이터 회귀 테스트.
 *
 *   node species-catalog/tests/species-meta.mjs
 *
 * 이 파일이 지키는 계약
 *   ① 메타데이터가 없는 기존 수종도 오류 없이 열린다 (빈 값 객체 반환)
 *   ② 저장 → 조회가 왕복한다
 *   ③ 값이 전부 비면 항목을 만들지 않는다 (빈 껍데기를 쌓지 않음)
 *   ④ 알 수 없는 필드는 저장하지 않는다
 *   ⑤ Cloud 와 분리된 자체 키를 쓴다 — storage.js 의 4개 키를 건드리지 않아야
 *      loadCloudFirst 의 storage.save(merged) 에 덮이지 않는다
 */

// localStorage 셰임 — 모듈 import 전에 설치한다.
const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
  clear: () => mem.clear()
};

const {
  loadSpeciesMeta, getSpeciesMeta, setSpeciesMeta, hasSpeciesMeta,
  allSpeciesMeta, emptyMeta, iconFor, META_FIELDS, SUNLIGHT_OPTIONS
} = await import("../js/speciesMeta.js");

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
section("1. 기존 수종 호환 — 메타데이터 없음");
// ============================================================
loadSpeciesMeta();
check("빈 저장소에서 조회 → 빈 값 객체", getSpeciesMeta("sp-001"), emptyMeta());
check("undefined id 도 던지지 않는다", getSpeciesMeta(undefined), emptyMeta());
check("hasSpeciesMeta = false", hasSpeciesMeta("sp-001"), false);
check("빈 값 객체의 필드 수", Object.keys(emptyMeta()).length, META_FIELDS.length);

// ============================================================
section("2. 저장 → 조회 왕복");
// ============================================================
setSpeciesMeta("sp-010", {
  sunlight: "반양지", indoorOutdoor: "실외", nativeStatus: "외래종",
  evergreen: "낙엽", description: "여름에 흰 꽃이 피는 관목"
});
check("sunlight", getSpeciesMeta("sp-010").sunlight, "반양지");
check("indoorOutdoor", getSpeciesMeta("sp-010").indoorOutdoor, "실외");
check("nativeStatus", getSpeciesMeta("sp-010").nativeStatus, "외래종");
check("evergreen", getSpeciesMeta("sp-010").evergreen, "낙엽");
check("description", getSpeciesMeta("sp-010").description, "여름에 흰 꽃이 피는 관목");
check("hasSpeciesMeta = true", hasSpeciesMeta("sp-010"), true);

check("다른 수종은 영향 없음", getSpeciesMeta("sp-011"), emptyMeta());

// 새로고침 재현 — 다시 로드해도 살아 있어야 한다
loadSpeciesMeta();
check("재로드 후에도 유지 (새로고침 생존)", getSpeciesMeta("sp-010").sunlight, "반양지");

// ============================================================
section("3. 일부 필드만 입력");
// ============================================================
setSpeciesMeta("sp-020", { sunlight: "양지" });
check("입력한 필드", getSpeciesMeta("sp-020").sunlight, "양지");
check("입력 안 한 필드는 빈 문자열", getSpeciesMeta("sp-020").description, "");
check("hasSpeciesMeta = true", hasSpeciesMeta("sp-020"), true);

// ============================================================
section("4. 빈 값 — 껍데기를 만들지 않는다");
// ============================================================
setSpeciesMeta("sp-030", { sunlight: "", indoorOutdoor: "", description: "   " });
check("전부 비면 항목 미생성", Object.keys(allSpeciesMeta()).includes("sp-030"), false);
check("hasSpeciesMeta = false", hasSpeciesMeta("sp-030"), false);

// 있던 항목을 비우면 제거된다
setSpeciesMeta("sp-020", { sunlight: "" });
check("값을 비우면 항목 삭제", Object.keys(allSpeciesMeta()).includes("sp-020"), false);

check("id 없으면 아무 일도 없다", (setSpeciesMeta("", { sunlight: "양지" }),
      Object.keys(allSpeciesMeta()).includes("")), false);

// ============================================================
section("5. 알 수 없는 필드는 버린다");
// ============================================================
setSpeciesMeta("sp-040", { sunlight: "음지", hackField: "x", __proto__: "y" });
check("알려진 필드만 저장", Object.keys(allSpeciesMeta()["sp-040"]).sort(), ["sunlight"]);
check("조회 결과에도 없음", getSpeciesMeta("sp-040").hackField, undefined);

// ============================================================
section("6. Cloud 데이터 키와 분리");
// ============================================================
const CLOUD_KEYS = [
  "species-catalog:v2:species",
  "species-catalog:v2:invoices",
  "species-catalog:v2:invoiceItems",
  "species-catalog:v2:meta"
];
const touched = CLOUD_KEYS.filter(k => mem.has(k));
check("storage.js 의 4개 키를 건드리지 않는다", touched, []);
check("자체 키를 쓴다", mem.has("species-catalog:v2:speciesMeta"), true);

// ============================================================
section("7. 아이콘 조회");
// ============================================================
check("양지 아이콘", iconFor(SUNLIGHT_OPTIONS, "양지"), "☀️");
check("없는 값 → 빈 문자열", iconFor(SUNLIGHT_OPTIONS, "해당없음"), "");
check("빈 값 → 빈 문자열", iconFor(SUNLIGHT_OPTIONS, ""), "");

// ============================================================
section("8. 깨진 저장값 복구");
// ============================================================
mem.set("species-catalog:v2:speciesMeta", "{{{ not json");
loadSpeciesMeta();
check("JSON 파싱 실패 → 빈 저장소", allSpeciesMeta(), {});
check("이후 조회도 정상", getSpeciesMeta("sp-001"), emptyMeta());

mem.set("species-catalog:v2:speciesMeta", "[1,2,3]");
loadSpeciesMeta();
check("배열이 들어와도 객체로 초기화", allSpeciesMeta(), {});

// ============================================================
console.log("\n" + "=".repeat(52));
console.log(`통과 ${pass} · 실패 ${fail}`);
if (fail) { console.log("\n실패 항목:"); for (const l of failed) console.log("  ✗ " + l); }
console.log("=".repeat(52));
process.exit(fail ? 1 : 0);
