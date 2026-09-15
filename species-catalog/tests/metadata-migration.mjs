#!/usr/bin/env node
/**
 * metadataMigration 회귀 테스트 (T11-1).
 *
 *   node species-catalog/tests/metadata-migration.mjs
 *
 * 계약
 *   ① upgradeMetadata 가 모든 스키마 변경의 입구다
 *   ② 반환은 { metadata, upgraded, fromVersion, toVersion }
 *   ③ 순수 함수 — 입력을 변형하지 않고, 실행 시점에 결과가 달라지지 않는다
 *   ④ SEMI_EVERGREEN 을 추측으로 만들지 않는다
 *   ⑤ STALE 은 저장하지 않고 계산한다
 */

const {
  upgradeMetadata, resolveMetadataStatus, versionOf,
  CURRENT_SCHEMA_VERSION, UNVERSIONED, STORED_METADATA_STATUS
} = await import("../services/metadataMigration.js");
const { EVERGREEN_ENUM, METADATA_STATUS_ENUM, normalizeEvergreen, normalizeMetadataStatus }
  = await import("../services/plantNormalizer.js");

let pass = 0, fail = 0; const failed = [];
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : (fail++, failed.push(label));
  console.log(`${ok ? "✓" : "✗"} ${label}` +
              (ok ? "" : `\n    기대: ${JSON.stringify(expected)}\n    실제: ${JSON.stringify(actual)}`));
}
function section(t) { console.log(`\n── ${t} ${"─".repeat(Math.max(0, 48 - t.length))}`); }

// ============================================================
section("1. 계약 — 반환 모양");
// ============================================================
check("현재 버전 2", CURRENT_SCHEMA_VERSION, 2);
const r = upgradeMetadata({});
check("반환 키", Object.keys(r).sort(), ["fromVersion", "metadata", "toVersion", "upgraded"]);
check("버전 없음 → 0", r.fromVersion, UNVERSIONED);
check("현재까지 올린다", r.toVersion, CURRENT_SCHEMA_VERSION);
check("upgraded = true", r.upgraded, true);
check("결과 버전", r.metadata.schema_version, CURRENT_SCHEMA_VERSION);

const already = upgradeMetadata({ schema_version: 2, evergreen: "EVERGREEN" });
check("최신이면 단계 없음", already.upgraded, false);
check("fromVersion = toVersion", [already.fromVersion, already.toVersion], [2, 2]);
check("값 보존", already.metadata.evergreen, "EVERGREEN");

const future = upgradeMetadata({ schema_version: 99 });
check("미래 버전은 건드리지 않는다", future.upgraded, false);
check("미래 버전 유지", future.metadata.schema_version, 99);

check("versionOf 정수만", [versionOf({ schema_version: 3 }), versionOf({ schema_version: "x" }),
      versionOf(null)], [3, 0, 0]);

// ============================================================
section("2. Migration Snapshot — 구버전 레코드");
// ============================================================
const legacy = {
  image_url: "https://x/old.jpg",
  evergreen: false,
  plant_api_source: "kna",
  plant_api_id: "KNA00001234",
  plant_api_synced_at: "2026-09-01T00:00:00Z"
};
const snapshotInput = JSON.stringify(legacy);
const up = upgradeMetadata(legacy);

check("schema_version → 2", up.metadata.schema_version, 2);
check("fromVersion 0", up.fromVersion, 0);
check("upgraded", up.upgraded, true);
check("photos 1장", up.metadata.photos.length, 1);
check("photos 내용", up.metadata.photos[0],
      { url: "https://x/old.jpg", type: "", caption: "", source: "kna" });
check("provider.name", up.metadata.provider.name, "kna");
check("provider.record_id", up.metadata.provider.record_id, "KNA00001234");
check("provider.synced_at", up.metadata.provider.synced_at, "2026-09-01T00:00:00Z");
check("evergreen → DECIDUOUS", up.metadata.evergreen, "DECIDUOUS");
check("metadata_status → SYNCED", up.metadata.metadata_status, "SYNCED");
check("입력을 변형하지 않는다", JSON.stringify(legacy), snapshotInput);

// ============================================================
section("3. 상태 추론 — 마이그레이션 시 1회");
// ============================================================
check("아무것도 없음 → PENDING", upgradeMetadata({}).metadata.metadata_status, "PENDING");
check("사람이 넣은 값 → USER_EDITED",
      upgradeMetadata({ soil: "습윤" }).metadata.metadata_status, "USER_EDITED");
check("사진만 있어도 USER_EDITED",
      upgradeMetadata({ photos: [{ url: "u" }] }).metadata.metadata_status, "USER_EDITED");
check("출처가 있으면 SYNCED",
      upgradeMetadata({ plant_api_source: "gbif" }).metadata.metadata_status, "SYNCED");
check("저장된 상태가 있으면 그대로",
      upgradeMetadata({ metadata_status: "USER_EDITED", plant_api_source: "kna" })
        .metadata.metadata_status, "USER_EDITED");
check("STALE 은 저장값으로 받지 않는다", normalizeMetadataStatus("STALE"), "");
check("저장 가능한 상태 3종", STORED_METADATA_STATUS, ["PENDING", "SYNCED", "USER_EDITED"]);
check("상태 enum 4종", METADATA_STATUS_ENUM,
      ["PENDING", "SYNCED", "USER_EDITED", "STALE"]);

// ============================================================
section("4. evergreen enum — 추측하지 않는다");
// ============================================================
check("enum 4종", EVERGREEN_ENUM, ["EVERGREEN", "DECIDUOUS", "SEMI_EVERGREEN", "UNKNOWN"]);
check("true → EVERGREEN", normalizeEvergreen(true), "EVERGREEN");
check("false → DECIDUOUS", normalizeEvergreen(false), "DECIDUOUS");
check("빈 값 → UNKNOWN", normalizeEvergreen(""), "UNKNOWN");
check("모르는 값 → UNKNOWN", normalizeEvergreen("아무거나"), "UNKNOWN");
check("반상록은 출처가 말할 때만", normalizeEvergreen("반상록"), "SEMI_EVERGREEN");
check("semi-evergreen 영문", normalizeEvergreen("semi-evergreen"), "SEMI_EVERGREEN");
check("enum 그대로", normalizeEvergreen("SEMI_EVERGREEN"), "SEMI_EVERGREEN");
check("구버전 '상록'", normalizeEvergreen("상록"), "EVERGREEN");
check("불리언에서 SEMI 를 만들지 않는다",
      [upgradeMetadata({ evergreen: true }).metadata.evergreen,
       upgradeMetadata({ evergreen: false }).metadata.evergreen],
      ["EVERGREEN", "DECIDUOUS"]);
check("미지정도 SEMI 가 되지 않는다",
      upgradeMetadata({ evergreen: "" }).metadata.evergreen, "UNKNOWN");

// ============================================================
section("5. STALE — 저장 + 계산 혼합");
// ============================================================
const synced = upgradeMetadata({
  plant_api_source: "kna", plant_api_id: "K1"
}).metadata;
synced.provider.version = "2026-09";

check("최신 판 정보 없으면 SYNCED", resolveMetadataStatus(synced, {}), "SYNCED");
check("같은 판이면 SYNCED", resolveMetadataStatus(synced, { kna: "2026-09" }), "SYNCED");
check("새 판이 있으면 STALE", resolveMetadataStatus(synced, { kna: "2026-10" }), "STALE");
check("다른 출처의 판은 무관", resolveMetadataStatus(synced, { gbif: "2026-10" }), "SYNCED");

const noVersion = upgradeMetadata({ plant_api_source: "kna" }).metadata;
check("우리 판 정보가 없으면 비교 불가 → SYNCED",
      resolveMetadataStatus(noVersion, { kna: "2026-10" }), "SYNCED");

const userEdited = upgradeMetadata({ soil: "습윤" }).metadata;
check("사용자 값은 STALE 이 되지 않는다",
      resolveMetadataStatus(userEdited, { kna: "2026-10" }), "USER_EDITED");
check("빈 레코드", resolveMetadataStatus({}, { kna: "2026-10" }), "PENDING");

// ============================================================
section("6. 순수 함수");
// ============================================================
const src = await (await import("node:fs/promises")).readFile(
  new URL("../services/metadataMigration.js", import.meta.url), "utf8");
const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
for (const api of ["fetch(", "localStorage", "sessionStorage", "indexedDB",
                   "new Date", "Date.now", "Math.random", "console."]) {
  check(`${api} 를 쓰지 않는다`, codeOnly.includes(api), false);
}
const twice = f => JSON.stringify(f()) === JSON.stringify(f());
check("upgradeMetadata 결정적", twice(() => upgradeMetadata(legacy)), true);
check("resolveMetadataStatus 결정적", twice(() => resolveMetadataStatus(synced, { kna: "2026-10" })), true);
check("null 입력 안전", upgradeMetadata(null).metadata.schema_version, CURRENT_SCHEMA_VERSION);
check("배열 입력 안전", upgradeMetadata([1, 2]).metadata.schema_version, CURRENT_SCHEMA_VERSION);
check("얼린 입력 처리", upgradeMetadata(Object.freeze({ evergreen: true })).metadata.evergreen, "EVERGREEN");

// ============================================================
section("7. 멱등성 — 두 번 돌려도 같다");
// ============================================================
/**
 * Species Catalog 는 한 레코드에 업그레이드를 여러 번 건다 — Cloud 로드 ·
 * LocalStorage 로드 · Sync 후 저장이 각각 같은 metadata 를 지나간다. 두 번째
 * 통과에서 값이 달라지면 화면과 저장본이 갈라지고, 그건 조용히 일어난다.
 *
 * 이 테스트는 지금을 지키는 게 아니라 **v3 를 지킨다.** 새 단계를 STEPS 에
 * 더할 때 그 단계가 자기 출력에 다시 걸리면 여기서 걸린다.
 */
const idempotentCases = {
  "구버전 전체":   legacy,
  "빈 레코드":     {},
  "v1 레코드":     { schema_version: 1, evergreen: true, soil: "사질양토" },
  "사람이 넣은 값": { sunlight: "full_sun", description: "설명" },
  "연동 레코드":   { plant_api_source: "kna", plant_api_id: "K1", image_url: "https://x/a.jpg" }
};
for (const [label, input] of Object.entries(idempotentCases)) {
  const once  = upgradeMetadata(input).metadata;
  const twice = upgradeMetadata(once).metadata;
  check(`${label} — 두 번째가 같다`, twice, once);
  check(`${label} — 두 번째는 upgraded=false`, upgradeMetadata(once).upgraded, false);
}
// 최신 판 레코드는 단계를 타지 않는다 — fromVersion 이 곧 toVersion 이다.
const settled = upgradeMetadata(legacy).metadata;
check("정착 후 fromVersion", upgradeMetadata(settled).fromVersion, CURRENT_SCHEMA_VERSION);
check("정착 후 toVersion", upgradeMetadata(settled).toVersion, CURRENT_SCHEMA_VERSION);

// ============================================================
console.log("\n" + "=".repeat(52));
console.log(`통과 ${pass} · 실패 ${fail}`);
if (fail) { console.log("\n실패 항목:"); for (const l of failed) console.log("  ✗ " + l); }
console.log("=".repeat(52));
process.exit(fail ? 1 : 0);
