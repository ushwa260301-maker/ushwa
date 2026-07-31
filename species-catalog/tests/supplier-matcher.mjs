/**
 * supplierMatcher.js 단위 테스트 — 브라우저 없이 실행된다.
 *
 *   node species-catalog/tests/supplier-matcher.mjs
 *
 * 검증 대상
 *   ① normSupplierName() 이 DB 의 fn_norm_supplier_name() 과 같은 결과를
 *      내는가. 다르면 supplier_alias 의 CHECK 제약이 INSERT 를 거부한다.
 *      PG_SPACE 집합은 PostgreSQL 16(UTF8/C.UTF-8)에서 1..0xFFFF 전
 *      코드포인트를 실측해 얻은 값이다.
 *   ② matchSupplier() 의 3-tier 판정 (exact / alias / 유사도 / 신규)
 *   ③ 모호한 alias 는 자동 적용되지 않는가 (OCR_DATA_POLICY §5 규칙 4)
 *   ④ 실환경 OCR 상호 10건의 판정 결과 (오매칭 0 확인)
 */

import {
  normSupplierName,
  matchSupplier,
  SUPPLIER_MATCH_THRESHOLD,
  SUPPLIER_POSSIBLE_THRESHOLD
} from "../js/supplierMatcher.js";

let pass = 0, fail = 0;
const ok = (cond, label, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else      { fail++; console.log(`  ✗ ${label}${detail ? "  — " + detail : ""}`); }
};
const eq = (got, want, label) =>
  ok(got === want, label, `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);

// ============================================================
console.log("\n① normSupplierName ↔ fn_norm_supplier_name 동등성");
// ============================================================

// PostgreSQL 16 이 \s 로 취급한 코드포인트 (실측)
const PG_SPACE = [
  0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x20, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006,
  0x2008, 0x2009, 0x200A, 0x2028, 0x2029, 0x205F, 0x3000
];
// Postgres 가 유지한 문자 — JS 의 \s 는 이 중 4개를 제거해버린다.
const PG_KEEPS = [0x00A0, 0x2007, 0x202F, 0x200B, 0xFEFF];

let spaceMismatch = [];
for (const cp of PG_SPACE) {
  if (normSupplierName("a" + String.fromCharCode(cp) + "b") !== "ab") {
    spaceMismatch.push("U+" + cp.toString(16).toUpperCase().padStart(4, "0") + " 미제거");
  }
}
for (const cp of PG_KEEPS) {
  const ch = String.fromCharCode(cp);
  if (normSupplierName("a" + ch + "b") !== "a" + ch + "b") {
    spaceMismatch.push("U+" + cp.toString(16).toUpperCase().padStart(4, "0") + " 과잉 제거");
  }
}
ok(spaceMismatch.length === 0,
   `공백 문자 ${PG_SPACE.length + PG_KEEPS.length}종이 Postgres 와 동일하게 처리됨`,
   spaceMismatch.join(", "));

// JS 의 \s 를 그대로 썼다면 실패했을 케이스 — 회귀 방지용 명시 검사
eq(normSupplierName("대림 원예"), "대림 원예", "NBSP 는 유지 (Postgres 와 동일)");
eq(normSupplierName("대림﻿원예"), "대림﻿원예", "BOM 은 유지 (Postgres 와 동일)");

eq(normSupplierName("대림 원예 가든"), "대림원예가든", "한글 + 공백 제거");
eq(normSupplierName("ABC Farm"),       "abcfarm",     "Latin 소문자화 + 공백 제거");
eq(normSupplierName("  앞뒤 공백  "),   "앞뒤공백",     "앞뒤 공백 제거");
eq(normSupplierName(null),             "",            "null → 빈 문자열");
eq(normSupplierName(undefined),        "",            "undefined → 빈 문자열");
eq(normSupplierName(""),               "",            "빈 문자열 유지");
eq(normSupplierName(normSupplierName("대림 원예")), "대림원예", "멱등 (두 번 적용해도 동일)");

// ============================================================
console.log("\n② matchSupplier — 3-tier 판정");
// ============================================================

const S = (id, name) => ({ id, name, norm_name: normSupplierName(name) });
const suppliers = [
  S("s1", "대림원예가든센터"),
  S("s2", "대림원예가든"),
  S("s3", "귀거래향"),
  S("s4", "지호식물원"),
  S("s5", "나무생각")
];

let r = matchSupplier("대림원예가든센터", suppliers, []);
eq(r.status, "match",  "완전 일치 → match");
eq(r.via,    "exact",  "완전 일치 → via=exact");
eq(r.supplier.id, "s1", "완전 일치 → 올바른 공급처");
eq(r.score, 1,          "완전 일치 → score 1");

r = matchSupplier("대림 원예 가든 센터", suppliers, []);
eq(r.via, "exact", "공백 변형도 완전 일치 (정규화 후)");

r = matchSupplier("대림원예가듣센테", suppliers, []);
eq(r.status, "match",      "OCR 오탈자 → match");
eq(r.via,    "similarity", "OCR 오탈자 → via=similarity");
eq(r.supplier.id, "s1",    "OCR 오탈자 → 대림원예가든센터로 연결");
ok(r.score >= SUPPLIER_MATCH_THRESHOLD, `score ${r.score.toFixed(3)} ≥ ${SUPPLIER_MATCH_THRESHOLD}`);

r = matchSupplier("귀커래향", suppliers, []);
eq(r.status, "match",   "귀커래향 → match");
eq(r.supplier.id, "s3", "귀커래향 → 귀거래향으로 연결");

r = matchSupplier("경)| BEA 물시랑로 241(주암동) 과", suppliers, []);
eq(r.status, "new", "파서 쓰레기 → new (오매칭 없음)");
eq(r.supplier, null, "파서 쓰레기 → supplier null");

r = matchSupplier("노는", suppliers, []);
eq(r.status, "new", "잡음 토큰 → new");

r = matchSupplier("", suppliers, []);
eq(r.status, "new", "빈 입력 → new");
r = matchSupplier("대림원예가든센터", [], []);
eq(r.status, "new", "공급처 목록 없음 → new");
r = matchSupplier("대림원예가든센터", null, null);
eq(r.status, "new", "null 인자 → new (예외 없음)");

// 서로 다른 실제 업체가 자동 병합되지 않는가
r = matchSupplier("대림원예가든", suppliers.filter(s => s.id === "s1"), []);
ok(r.status !== "match" || r.score < SUPPLIER_MATCH_THRESHOLD,
   `대림원예가든 ↔ 대림원예가든센터 자동 병합 안 됨 (score ${r.score.toFixed(3)}, status ${r.status})`);
ok(r.status === "possible", "접미어만 다른 업체는 possible 로 사람 확인 요청");

// ============================================================
console.log("\n③ alias 경로");
// ============================================================

const A = (text, supplierId, extra = {}) =>
  ({ norm_alias: normSupplierName(text), supplier_id: supplierId, is_active: true, ...extra });

r = matchSupplier("대림원예가듣센테", suppliers, [A("대림원예가듣센테", "s2")]);
eq(r.status, "match", "alias 등록됨 → match");
eq(r.via,    "alias", "alias 경로 → via=alias");
eq(r.supplier.id, "s2", "alias 가 유사도(s1)를 이긴다 — 사람이 고른 결과가 우선");

r = matchSupplier("대림원예가듣센테", suppliers, [A("대림원예가듣센테", "s2", { is_active: false })]);
eq(r.via, "similarity", "비활성 alias 는 무시 → 유사도로 폴백");
eq(r.supplier.id, "s1", "비활성 alias 무시 후 유사도 최고값 선택");

r = matchSupplier("어떤상호", suppliers, [A("어떤상호", "s99")]);
eq(r.status, "new", "존재하지 않는 supplier_id 를 가리키는 alias 는 무시");

// §5 규칙 4 — 같은 alias 가 서로 다른 업체로 등록된 경우
r = matchSupplier("대림원예가듣센테", suppliers,
                  [A("대림원예가듣센테", "s1"), A("대림원예가듣센테", "s2")]);
eq(r.status, "possible",        "모호한 alias → 자동 적용 금지");
eq(r.via,    "ambiguous-alias", "모호한 alias → via=ambiguous-alias");
eq(r.supplier, null,            "모호한 alias → supplier null (사람이 고른다)");
eq(r.candidates.length, 2,      "모호한 alias → 후보 2건 제시");

r = matchSupplier("대림 원예 가듣센테", suppliers, [A("대림원예가듣센테", "s2")]);
eq(r.via, "alias", "alias 조회도 정규화를 거친다 (공백 변형 흡수)");

// ============================================================
console.log("\n④ 실환경 OCR 상호 10건");
// ============================================================
// 각 스냅샷의 supplier.name(파서 출력)과 사용자가 입력한 정답.
// 정답이 suppliers 에 이미 있다고 가정했을 때의 판정을 본다.
const REAL = [
  ["inv-050", "",                                 "대림원예가든"],
  ["inv-051", "대림원예가든센터",                    "대림원예가든센터"],
  ["inv-052", "대림원예가든센터",                    "대림원예가든센터"],
  ["inv-053", "경)| BEA 물시랑로 241(주암동) 과",     "지호식물원"],
  ["inv-054", "",                                 "신농원"],
  ["inv-055", "",                                 "진영원예"],
  ["inv-056", "",                                 "지리산농"],
  ["inv-057", "",                                 "송죽식물원"],
  ["inv-058", "노는",                              "귀거래향"],
  ["inv-059", "= 호 |나루척착 명 | 대환 AQ 주식회사 수무 귀하", "나무생각"]
];
const realSuppliers = [...new Set(REAL.map(([, , truth]) => truth))]
  .map((name, i) => S("r" + i, name));

let mismatched = 0;
for (const [id, ocr, truth] of REAL) {
  const res = matchSupplier(ocr, realSuppliers, []);
  const picked = res.supplier?.name ?? null;
  const wrong = res.status === "match" && picked !== truth;
  if (wrong) mismatched++;
  console.log(`  ${id}  ocr=${JSON.stringify(ocr).padEnd(34)} → ${res.status.padEnd(8)}` +
              ` ${res.score.toFixed(3)}  ${picked ?? "—"}${wrong ? "   ← 오매칭" : ""}`);
}
ok(mismatched === 0, `실환경 10건 오매칭 0건 (틀린 업체로 자동 연결된 건 없음)`);

// 위험 검증 — 실제 업체끼리 자동 병합되지 않는가
let merged = [];
for (const a of realSuppliers) {
  const others = realSuppliers.filter(s => s.id !== a.id);
  const res = matchSupplier(a.name, others, []);
  if (res.status === "match") merged.push(`${a.name} → ${res.supplier.name} (${res.score.toFixed(3)})`);
}
ok(merged.length === 0, "서로 다른 실제 업체가 자동 병합되지 않음", merged.join(", "));

// ============================================================
console.log(`\n${"=".repeat(56)}`);
console.log(`통과 ${pass} · 실패 ${fail}`);
console.log(`임계값  match ≥ ${SUPPLIER_MATCH_THRESHOLD} · possible ≥ ${SUPPLIER_POSSIBLE_THRESHOLD}`);
console.log("=".repeat(56));
process.exit(fail === 0 ? 0 : 1);
