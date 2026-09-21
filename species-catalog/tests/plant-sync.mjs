#!/usr/bin/env node
/**
 * 저장 직후 도감 동기화 end-to-end 테스트 (T11-5).
 *
 *   node --experimental-strip-types species-catalog/tests/plant-sync.mjs
 *
 * 네트워크를 쓰지 않는다. Edge Function 을 **실제로 태우고** fetch 만 Fixture 로
 * 대신한다 — 세 계층(Edge Function → Provider → 병합 → 저장)이 맞물리는지를
 * 보는 것이 목적이라, 중간을 가짜로 채우면 볼 것이 없어진다.
 *
 * ## Fixture 의 출처
 *
 *   scnmSearch-success.json   **실호출 응답 원문.** 마커가 없다.
 *   그 밖의 파일               계약 모양으로 쓴 것. `_fixture_source` 로 표시.
 *
 * `tests/fixtures/kna/` 는 실측 전용 폴더이므로, 마커가 남아 있는 파일은
 * 아직 실호출로 교체되지 않았다는 뜻이다 — 아래에서 그 사실을 고정한다.
 *
 * 결과 구분
 *   실응답 그대로 정명 2건  → AMBIGUOUS (조회 조건이 안 걸린 응답이다)
 *   정명 1건      실응답 행 → SYNCED
 *   소나무        결과 없음 → NO_MATCH  (조회는 성공했다)
 *   조팝나무      이명만    → SYNONYM_ONLY
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const F   = await import("../../supabase/functions/plant-search-kna/index.ts");
const svc = await import("../services/speciesService.js");
const { resolveSyncStatus } = await import("../services/metadataMigration.js");

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "fixtures", "kna");

let pass = 0, fail = 0; const failed = [];
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : (fail++, failed.push(label));
  console.log(`${ok ? "✓" : "✗"} ${label}` +
              (ok ? "" : `\n    기대: ${JSON.stringify(expected)}\n    실제: ${JSON.stringify(actual)}`));
}
function section(t) { console.log(`\n── ${t} ${"─".repeat(Math.max(0, 48 - t.length))}`); }

const KEY = "SECRET-KEY-0001";
const NOW = new Date("2026-09-21T00:00:00.000Z");
const CFG = { endpoint: "https://example.invalid/KpniService", serviceKey: KEY, now: NOW };

const fixture = async name => readFile(join(FIXTURES, name), "utf8");

const mockRes = body => ({
  ok: true, status: 200,
  headers: { get: () => "application/json" },
  async text() { return body; }
});

/** Edge Function 을 그대로 태우는 invoke — 네트워크만 Fixture 로 대신한다. */
const invokeWith = body => async (_fn, req) => {
  const r = await F.searchPlants(req.query, { ...CFG, fetchImpl: async () => mockRes(body) });
  if (!r.ok) throw new Error(r.error);
  return r.body;
};

/** 저장 직후의 수종 — 아직 출처와 연결되지 않았다. */
const pending = (id, name) => ({ id, name, latin: "", metadata: { sync_status: "PENDING" } });

/** applyPatch 를 가로채 무엇이 적용됐는지 본다. */
function collector() {
  const applied = [];
  return { applied, applyPatch: (id, patch) => { applied.push({ id, patch }); } };
}

// ============================================================
section("0. Fixture 출처 표시");
// ============================================================
/**
 * 실호출 응답에는 마커가 없어야 한다. 마커는 "아직 실측이 아님"을 뜻하므로,
 * 교체가 끝난 파일에 남아 있으면 그 자체가 오류다.
 */
const realRaw = JSON.parse(await fixture("scnmSearch-success.json"));
check("실응답에는 _fixture_source 가 없다", "_fixture_source" in realRaw, false);
check("실응답에는 _note 가 없다", "_note" in realRaw, false);
check("응답 껍데기 그대로", Object.keys(realRaw), ["response"]);
check("resultCode", realRaw.response.header.resultCode, "00");
check("totalCount", realRaw.response.body.totalCount, 39603);
check("items.item 3건", realRaw.response.body.items.item.length, 3);

// 아직 교체되지 않은 파일은 표시가 남아 있다.
for (const name of ["scnmSearch-empty.json", "scnmSearch-multi.json",
                    "scnmSearch-synonym-only.json", "scnmSearch-mixed.json"]) {
  const raw = JSON.parse(await fixture(name));
  check(`${name} — 아직 계약 모양 (실측 대기)`, raw._fixture_source, "contract_shape");
}

// ============================================================
section("0-1. 실호출 응답 그대로 — 조건이 안 걸린 조회");
// ============================================================
/**
 * 이 응답은 조회 조건이 걸리지 않은 것으로 보인다 — totalCount 가 39603 이고
 * 내용이 국가표준식물목록 앞머리(가거개별꽃 · 가거꼬리고사리)다. 한 수종의
 * 조회 결과로 쓰면 정명이 2건이라 채택되지 않는다. 그 동작을 고정해 둔다 —
 * 조건이 안 걸린 응답으로 자동 채움이 되면 안 된다.
 */
const realSpecies = [pending("sp-107", "가거꼬리고사리")];
const real = collector();
const rReal = await svc.syncMetadata(realSpecies, {
  invoke: invokeWith(await fixture("scnmSearch-success.json")),
  applyPatch: real.applyPatch
});
check("정명이 2건이라 채택하지 않는다", rReal.updated.length, 0);
check("사유는 AMBIGUOUS", rReal.skipped.map(s => s.reason), [svc.SKIP_REASON.AMBIGUOUS]);
check("아무것도 적용하지 않는다", real.applied.length, 0);
check("PENDING 으로 남는다", resolveSyncStatus(realSpecies[0].metadata), "PENDING");

// ============================================================
section("1. 정명 1건 → SYNCED (실응답 행으로 구성)");
// ============================================================
/**
 * 실응답에서 **정명 행 하나만** 담은 조회 결과를 만든다. 값은 원문에서 그대로
 * 가져오고 지어내지 않는다 — 조건이 제대로 걸린 조회가 어떤 모양일지를 실측
 * 값으로 재현한다.
 */
const oneReal = {
  response: { header: realRaw.response.header,
              body: { items: { item: [realRaw.response.body.items.item[1]] },
                      numOfRows: 10, pageNo: 1, totalCount: 1 } }
};
const sugukSpecies = [pending("sp-101", "가거꼬리고사리")];
const suguk = collector();
const r1 = await svc.syncMetadata(sugukSpecies, {
  invoke: invokeWith(JSON.stringify(oneReal)),
  applyPatch: suguk.applyPatch,
  now: NOW.toISOString()
});

check("갱신 1건", r1.updated.map(u => u.id), ["sp-101"]);
check("patch 적용 1건", suguk.applied.length, 1);
const p1 = suguk.applied[0].patch;
check("학명이 들어간다", p1.metadata.scientific_name, "Asplenium yoshinagae Makino");
check("출처가 붙는다", p1.metadata.provider.name, "kna");
check("출처 ID 가 붙는다", p1.metadata.provider.record_id, "1002511");
check("metadata.source_id 도 같은 값", p1.metadata.source_id, "1002511");
// 과·속은 학명 쪽을 정본으로 쓴다.
check("과 — 학명이 정본", p1.metadata.family, "Aspleniaceae");
check("과 국명은 따로", p1.metadata.family_ko, "꼬리고사리과");
check("속", p1.metadata.genus, "Asplenium");
check("판이 실린다", p1.metadata.provider.version, "2026-09-21");
check("상태가 SYNCED", p1.metadata.sync_status, "SYNCED");
check("species.latin 도 채운다", p1.latin, "Asplenium yoshinagae Makino");
// scnmSearch 는 도감 정보를 주지 않는다 — 없는 값을 만들지 않는다.
check("개화월은 비어 있다", p1.metadata.flowering_months, []);
check("사진도 없다", p1.metadata.photos, []);
check("bloomMonths 는 patch 에 없다", "bloomMonths" in p1, false);
// UPDATE ONLY
check("새 수종을 만들지 않는다", suguk.applied.every(a => a.id === "sp-101"), true);
check("원본을 변형하지 않는다", sugukSpecies[0].metadata.sync_status, "PENDING");

// ============================================================
section("2. 소나무 — 결과 없음 → NO_MATCH");
// ============================================================
const pineSpecies = [pending("sp-102", "소나무")];
const pine = collector();
const r2 = await svc.syncMetadata(pineSpecies, {
  invoke: invokeWith(await fixture("scnmSearch-empty.json")),
  applyPatch: pine.applyPatch
});

check("갱신 없음", r2.updated.length, 0);
check("실패가 아니다 — 조회는 성공했다", r2.failed.length, 0);
check("사유는 '없음'", r2.skipped.map(s => s.reason), [svc.SKIP_REASON.NO_MATCH]);
check("patch 를 적용하지 않는다", pine.applied.length, 0);
check("PENDING 으로 남는다", resolveSyncStatus(pineSpecies[0].metadata), "PENDING");

// ============================================================
section("3. 만생조팝 — 정명 2건 → AMBIGUOUS");
// ============================================================
const spiraeaSpecies = [pending("sp-103", "만생조팝")];
const spiraea = collector();
const r3 = await svc.syncMetadata(spiraeaSpecies, {
  invoke: invokeWith(await fixture("scnmSearch-multi.json")),
  applyPatch: spiraea.applyPatch
});

check("갱신 없음", r3.updated.length, 0);
check("사유는 '정명 다건'", r3.skipped.map(s => s.reason), [svc.SKIP_REASON.AMBIGUOUS]);
check("아무것도 고르지 않는다", spiraea.applied.length, 0);
check("PENDING 으로 남는다", resolveSyncStatus(spiraeaSpecies[0].metadata), "PENDING");

// ============================================================
section("3-1. 이명만 있으면 채택하지 않는다");
// ============================================================
/**
 * 이명(synonym)은 같은 식물의 **폐기된 이름**이다. 후보로는 유효하지만 정본이
 * 아니라서, 그대로 채우면 그 뒤의 갱신이 전부 옛 이름을 따라간다.
 */
const synSpecies = [pending("sp-105", "조팝나무")];
const syn = collector();
const rSyn = await svc.syncMetadata(synSpecies, {
  invoke: invokeWith(await fixture("scnmSearch-synonym-only.json")),
  applyPatch: syn.applyPatch
});
check("채택하지 않는다", rSyn.updated.length, 0);
check("사유는 '이명만'", rSyn.skipped.map(s => s.reason), [svc.SKIP_REASON.SYNONYM_ONLY]);
check("이명을 버리지 않고 알려 준다", rSyn.skipped[0].synonyms,
      ["Spiraea prunifolia var. simpliciflora Nakai"]);
check("patch 를 적용하지 않는다", syn.applied.length, 0);
check("PENDING 으로 남는다", resolveSyncStatus(synSpecies[0].metadata), "PENDING");

// ============================================================
section("3-2. 정명과 이명이 섞이면 정명을 고른다");
// ============================================================
const mixSpecies = [pending("sp-106", "조팝나무")];
const mix = collector();
const rMix = await svc.syncMetadata(mixSpecies, {
  invoke: invokeWith(await fixture("scnmSearch-mixed.json")),
  applyPatch: mix.applyPatch
});
check("정명 하나를 채택한다", rMix.updated.map(u => u.id), ["sp-106"]);
check("이명이 섞여 있어도 AMBIGUOUS 가 아니다", rMix.skipped.length, 0);
check("채택된 것은 정명",
      mix.applied[0].patch.metadata.scientific_name, "Spiraea prunifolia Siebold & Zucc.");
check("이명 ID 를 쓰지 않는다", mix.applied[0].patch.metadata.source_id, "61002");

// ============================================================
section("4. 조회 실패 — NO_MATCH 와 구분된다");
// ============================================================
/**
 * 서비스 키 만료·파라미터 오류는 200 에 0건으로 오거나 resultCode 로 온다.
 * 이걸 "식물 DB 에 없음"으로 보고하면 원인이 묻힌다 — 대응이 완전히 다르다.
 */
const errSpecies = [pending("sp-104", "수국")];
const err = collector();
const r4 = await svc.syncMetadata(errSpecies, {
  invoke: invokeWith(JSON.stringify({
    resultCode: "30", resultMsg: "SERVICE KEY IS NOT REGISTERED"
  })),
  applyPatch: err.applyPatch
});
check("실패로 보고한다", r4.failed.map(f => f.id), ["sp-104"]);
check("없음으로 묻히지 않는다", r4.skipped.length, 0);
check("원인을 전한다", r4.failed[0].reason.includes("30"), true);
check("patch 를 적용하지 않는다", err.applied.length, 0);
check("PENDING 으로 남는다", resolveSyncStatus(errSpecies[0].metadata), "PENDING");

// ============================================================
section("5. 대상 선별 — PENDING 인 것만");
// ============================================================
const mixed = [
  pending("sp-201", "수국"),
  { id: "sp-202", name: "느티나무", metadata: { sync_status: "USER_EDITED", soil: "사질양토" } },
  { id: "sp-203", name: "산수국",
    metadata: { sync_status: "SYNCED", provider: { name: "kna", record_id: "K1" } } }
];
check("PENDING 만 고른다", svc.pendingSpecies(mixed).map(s => s.id), ["sp-201"]);

const only = collector();
await svc.syncMetadata(mixed, {
  // 정명 1건이 오는 응답이어야 실제로 적용까지 간다.
  invoke: invokeWith(JSON.stringify(oneReal)),
  applyPatch: only.applyPatch
});
check("사람이 넣은 값은 건드리지 않는다", only.applied.map(a => a.id), ["sp-201"]);
check("이미 연동된 것도 건드리지 않는다",
      only.applied.some(a => a.id === "sp-203"), false);

// ============================================================
console.log("\n" + "=".repeat(52));
console.log(`통과 ${pass} · 실패 ${fail}`);
if (fail) { console.log("\n실패 항목:"); for (const l of failed) console.log("  ✗ " + l); }
console.log("=".repeat(52));
process.exit(fail ? 1 : 0);
