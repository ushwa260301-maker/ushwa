#!/usr/bin/env node
/**
 * knaProvider 회귀 테스트 (T11-3.2).
 *
 *   node species-catalog/tests/providers/knaProvider.mjs
 *
 * 네트워크를 쓰지 않는다. Provider 는 API 를 직접 부르지 않으므로
 * Edge Function 호출자(`invoke`)를 주입하고, 응답은 Fixture 에서 읽는다.
 *
 * 계약
 *   ① Provider 는 **이름만 바꾼다** — 월 배열·enum·HTML·사진 타입을 만들지 않는다
 *   ② recordId 없는 행은 레코드가 되지 않는다 (출처를 되짚을 수 없다)
 *   ③ 판(version)은 Edge Function 이 준다 — Provider 가 만들지 않는다
 *   ④ 매핑이 비어 있으면 조회하지 않는다
 *
 * Fixture 는 `tests/fixtures/kna/` 에 **응답 원문 그대로** 둔다. 가공한 것을
 * 넣으면 응답이 바뀌었을 때 회귀를 못 잡는다.
 */

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const kna = await import("../../services/plantProviders/knaProvider.js");
const { PLANT_RECORD_FIELDS } = await import("../../services/plantRecord.js");

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(HERE, "..", "fixtures", "kna");
/** 규격 확정 시 반드시 있어야 하는 Fixture. */
const REQUIRED_FIXTURES = [
  "hydrangea-serrata.json",      // 산수국
  "spiraea-prunifolia.json",     // 설유화
  "hydrangea-limelight.json"     // 라임라이트
];

let pass = 0, fail = 0, pending = 0;
const failed = [];
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : (fail++, failed.push(label));
  console.log(`${ok ? "✓" : "✗"} ${label}` +
              (ok ? "" : `\n    기대: ${JSON.stringify(expected)}\n    실제: ${JSON.stringify(actual)}`));
}
function todo(label, why) {
  pending++;
  console.log(`⏸ ${label} — ${why}`);
}
function section(t) { console.log(`\n── ${t} ${"─".repeat(Math.max(0, 48 - t.length))}`); }

// ============================================================
section("1. Provider 계약");
// ============================================================
check("출처 코드", kna.SOURCE, "kna");
check("표시 이름", kna.LABEL, "국립수목원");
check("Edge Function 이름", kna.FUNCTION_NAME, "plant-search-kna");

// ============================================================
section("2. 매핑 미설정 — 추측하지 않는다");
// ============================================================
let invoked = 0;
const spyInvoke = async (fn, body) => { invoked++; spyInvoke.last = { fn, body }; return {}; };

const notReady = await kna.search("산수국", { invoke: spyInvoke });
check("mapRow 가 비어 있으면 notConfigured", notReady.notConfigured, true);
check("후보를 만들지 않는다", notReady.candidates, undefined);
check("Edge Function 을 부르지도 않는다", invoked, 0);

// ============================================================
section("3. recordId 규칙 (P0) — 출처를 되짚을 수 없으면 만들지 않는다");
// ============================================================
/**
 * provider.name 이 "kna" 인데 recordId 가 비면, SYNCED 인데 어느 행에서 왔는지
 * 말하지 못하는 레코드가 된다. 갱신도 검증도 불가능하다.
 */
check("recordId 있으면 레코드가 된다",
      kna.toCandidate({ recordId: "KNA00012345" }, "2026-09")?.provider,
      { name: "kna", recordId: "KNA00012345", version: "2026-09" });
check("recordId 없으면 null", kna.toCandidate({ koreanName: "산수국" }, "2026-09"), null);
check("빈 문자열도 없는 것", kna.toCandidate({ recordId: "   " }, "2026-09"), null);
check("mapRow 가 null 이면 null", kna.toCandidate(null, "2026-09"), null);
check("객체가 아니어도 안전", kna.toCandidate("K1", "2026-09"), null);

// 학명은 식별자가 못 된다 — 같은 학명에 여러 행이 있을 수 있다.
check("학명만으로는 레코드가 되지 않는다",
      kna.toCandidate({ scientificName: "Hydrangea serrata" }, "2026-09"), null);

// ============================================================
section("4. 판(version)은 Edge Function 이 준다");
// ============================================================
check("준 판을 그대로 쓴다",
      kna.toCandidate({ recordId: "K1" }, "2026-09").provider.version, "2026-09");
check("판이 없으면 빈 값 — 만들어 내지 않는다",
      kna.toCandidate({ recordId: "K1" }).provider.version, "");
check("빈 판도 빈 값", kna.toCandidate({ recordId: "K1" }, "").provider.version, "");

/**
 * mapRow 는 판을 만들 수 없다. 행이 판을 들고 와도 toCandidate 가 provider 를
 * 통째로 다시 조립하므로 인자로 받은 판만 남는다 — 한 행이 자기 출처나 판을
 * 잘못 말할 수 없게 하는 것이 이 조립의 목적이다.
 */
check("행이 판을 들고 와도 무시한다",
      kna.toCandidate({ recordId: "K1", version: "9999-99" }, "2026-09").provider.version,
      "2026-09");
check("행이 출처를 속여도 무시한다",
      kna.toCandidate({ recordId: "K1", provider: { name: "gbif", version: "9999-99" } },
                      "2026-09").provider,
      { name: "kna", recordId: "K1", version: "2026-09" });

// ============================================================
section("5. 빈 필드 — 지어내지 않는다");
// ============================================================
const bare = kna.toCandidate({ recordId: "K1" }, "2026-09");
check("PlantRecord 모양", Object.keys(bare).sort(), [...PLANT_RECORD_FIELDS].sort());
check("사진 없으면 빈 배열", bare.photosRaw, []);
check("개화기 없으면 null", bare.floweringMonthsRaw, null);
check("결실기 없으면 null", bare.fruitingMonthsRaw, null);
check("국명 없으면 null", bare.koreanName, null);
check("설명 없으면 null", bare.descriptionRaw, null);

// ============================================================
section("6. Fixture 기반 매핑");
// ============================================================
let fixtures = [];
try {
  fixtures = (await readdir(FIXTURE_DIR)).filter(f => f.endsWith(".json")).sort();
} catch { /* 폴더가 아직 없다 */ }

/**
 * Fixture 는 Provider 가 보는 모양 — Edge Function 응답이다.
 * `{ records: [...] }` 든 배열이든 단일 행이든 받아서 행 목록으로 편다.
 */
function rowsOf(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.records)) return json.records;
  return json && typeof json === "object" ? [json] : [];
}

if (!kna.isReady()) {
  // mapRow 가 아직 비어 있다. Fixture 가 있어도 검사할 것이 없다.
  todo("Fixture 매핑 검사",
       `mapRow 미구현 (Fixture ${fixtures.length}개 대기 중). ` +
       "국립수목원 실제 응답 규격 확정 후 진행");
} else {
  // 여기부터는 매핑이 채워진 상태 — Fixture 가 없으면 검사가 공회전한다.
  check("규격 확정 시 Fixture 3종이 있어야 한다",
        REQUIRED_FIXTURES.filter(f => !fixtures.includes(f)), []);

  for (const name of fixtures) {
    const json = JSON.parse(await readFile(join(FIXTURE_DIR, name), "utf8"));
    const rows = rowsOf(json);
    check(`${name} — 행이 있다`, rows.length > 0, true);

    const mapped = rows.map(r => kna.mapRow(r));
    check(`${name} — 최소 1건은 해석된다`, mapped.some(Boolean), true);

    for (const m of mapped.filter(Boolean)) {
      const id = String(m.recordId ?? "").trim();
      check(`${name} — recordId 가 있다`, Boolean(id), true);
      check(`${name} — 학명을 ID 로 쓰지 않는다`, id === String(m.scientificName ?? ""), false);

      // 값 변환 금지 — Provider 는 원문을 나른다. 배열이면 이미 변환한 것이다.
      for (const f of ["floweringMonthsRaw", "fruitingMonthsRaw", "sunlightRaw",
                       "nativeStatusRaw", "plantTypeRaw", "evergreenRaw", "descriptionRaw"]) {
        const v = m[f];
        check(`${name} — ${f} 는 원문(문자열|null)`,
              v === null || v === undefined || typeof v === "string", true);
      }
      check(`${name} — photosRaw 는 배열`, Array.isArray(m.photosRaw ?? []), true);
    }

    const candidates = mapped.map(r => kna.toCandidate(r, "fixture")).filter(Boolean);
    check(`${name} — PlantRecord 로 변환된다`, candidates.length > 0, true);
    for (const c of candidates) {
      check(`${name} — 계약 필드만`, Object.keys(c).sort(), [...PLANT_RECORD_FIELDS].sort());
    }
  }

  // Edge Function 응답 계약 — 요청 본문과 응답 키.
  const first = JSON.parse(await readFile(join(FIXTURE_DIR, fixtures[0]), "utf8"));
  const res = await kna.search("산수국", { invoke: async (fn, body) => {
    check("Edge Function 이름으로 부른다", fn, "plant-search-kna");
    check("요청 본문은 { query }", body, { query: "산수국" });
    return first;
  } });
  check("후보를 돌려준다", res.ok, true);
}

// ============================================================
console.log("\n" + "=".repeat(52));
console.log(`통과 ${pass} · 실패 ${fail}` + (pending ? ` · 대기 ${pending}` : ""));
if (fail) { console.log("\n실패 항목:"); for (const l of failed) console.log("  ✗ " + l); }
if (pending) console.log("\n⏸ 대기 항목은 실제 KNA 응답 규격이 확정되면 자동으로 실행된다.");
console.log("=".repeat(52));
process.exit(fail ? 1 : 0);
