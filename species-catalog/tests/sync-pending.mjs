#!/usr/bin/env node
/**
 * sync pending queue 회귀 테스트.
 *
 *   node species-catalog/tests/sync-pending.mjs
 *
 * 배경 — 이 테스트가 지키는 사고
 *   신규 invoice 저장이 PK 충돌로 실패하면 pending 에 남는다. 예전에는
 *   생성과 수정이 모두 kind="invoice" 라, 재시도 루프가 그 항목을
 *   mirrorUpdateInvoice 로 보냈다. 그 함수는 Cloud 에 같은 id 행이 있으면
 *   **그 행을 수정**하므로, 재시도가 다른 거래명세서를 덮어썼다
 *   (실환경 inv-066~068).
 *
 *   따라서 이 파일의 핵심 단언은 하나다:
 *     replayAction("invoiceCreate") 은 절대 update 경로를 돌려주지 않는다.
 *
 * syncManager.js 는 localStorage 에만 의존하므로 Node 에서 shim 으로
 * 그대로 검증할 수 있다 — DOM 도 네트워크도 필요 없다.
 */

// ---------- localStorage shim (import 前에 설치해야 한다) ----------
globalThis.localStorage = {
  _m: new Map(),
  getItem(k)      { return this._m.has(k) ? this._m.get(k) : null; },
  setItem(k, v)   { this._m.set(k, String(v)); },
  removeItem(k)   { this._m.delete(k); },
  clear()         { this._m.clear(); }
};

const {
  replayAction, addPending, removePending, listPending, hasPending,
  setLastSync, getLastSync
} = await import("../js/syncManager.js");

const {
  isDifferentInvoiceRecord, INVOICE_CREATED_AT_TOLERANCE_MS,
  isUniqueViolation, isForeignKeyViolation
} = await import("../js/cloudStore.js");

let pass = 0, fail = 0;
const results = [];

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : fail++;
  results.push({ ok, label, actual, expected });
  console.log(`${ok ? "✓" : "✗"} ${label}` +
              (ok ? "" : `\n    기대: ${JSON.stringify(expected)}\n    실제: ${JSON.stringify(actual)}`));
}
function section(t) { console.log(`\n── ${t} ${"─".repeat(Math.max(0, 56 - t.length))}`); }

const reset = () => localStorage.clear();

// ============================================================
section("1. replayAction — kind → 재시도 동작 매핑");
// ============================================================
check("invoiceCreate → invoiceSave", replayAction("invoiceCreate"), "invoiceSave");
check("invoice       → invoiceUpdate", replayAction("invoice"), "invoiceUpdate");
check("invoiceDelete → invoiceDelete", replayAction("invoiceDelete"), "invoiceDelete");
check("species       → speciesSave", replayAction("species"), "speciesSave");
check("speciesDelete → speciesDelete", replayAction("speciesDelete"), "speciesDelete");
check("attachment    → attachmentSave", replayAction("attachment"), "attachmentSave");
check("ocrCorrection → ocrCorrectionSave", replayAction("ocrCorrection"), "ocrCorrectionSave");

// ============================================================
section("2. 데이터 손실 방지 — 생성이 수정으로 승격되지 않는다");
// ============================================================
// 이 단언이 깨지면 실환경에서 남의 거래명세서가 지워진다.
check("invoiceCreate 는 invoiceUpdate 가 아니다",
      replayAction("invoiceCreate") !== "invoiceUpdate", true);
check("invoiceCreate 는 save 경로 하나뿐",
      replayAction("invoiceCreate"), "invoiceSave");
check("생성/수정이 서로 다른 동작으로 갈린다",
      replayAction("invoiceCreate") !== replayAction("invoice"), true);

// ============================================================
section("3. 알 수 없는 kind 는 폐기 대상(null)");
// ============================================================
// 호출자는 null 을 "처리 불가 → removePending" 으로 다룬다. 여기서 실수로
// 문자열을 돌려주면 미분류 항목이 엉뚱한 미러 함수로 흘러간다.
check("빈 문자열", replayAction(""), null);
check("미등록 kind", replayAction("invoiceUpsert"), null);
check("undefined", replayAction(undefined), null);
check("null", replayAction(null), null);
check("객체", replayAction({ kind: "invoice" }), null);

// ============================================================
section("4. addPending / removePending / listPending");
// ============================================================
reset();
check("초기 상태는 비어 있다", listPending(), []);
check("hasPending() false", hasPending(), false);

addPending("invoiceCreate", "inv-066");
check("1건 추가", listPending(), [{ kind: "invoiceCreate", id: "inv-066" }]);
check("hasPending() true", hasPending(), true);

addPending("invoiceCreate", "inv-066");
check("같은 kind+id 중복 추가는 1건 유지",
      listPending(), [{ kind: "invoiceCreate", id: "inv-066" }]);

addPending("attachment", "att-1");
check("다른 kind 는 별도 항목",
      listPending(), [{ kind: "invoiceCreate", id: "inv-066" },
                      { kind: "attachment", id: "att-1" }]);

removePending("invoiceCreate", "inv-066");
check("kind+id 로 정확히 제거", listPending(), [{ kind: "attachment", id: "att-1" }]);

removePending("invoiceCreate", "없는-id");
check("없는 항목 제거는 무해", listPending(), [{ kind: "attachment", id: "att-1" }]);

reset();
addPending("invoiceCreate", "");
check("빈 id 는 추가하지 않는다", listPending(), []);

// ============================================================
section("5. 같은 id 의 create 와 update 는 독립 항목");
// ============================================================
// 한 invoice 가 생성 실패 후 수정 실패까지 겪을 수 있다. 두 항목이
// 서로를 지우면 한쪽 재시도가 사라진다.
reset();
addPending("invoiceCreate", "inv-066");
addPending("invoice", "inv-066");
check("두 항목이 모두 남는다",
      listPending(), [{ kind: "invoiceCreate", id: "inv-066" },
                      { kind: "invoice", id: "inv-066" }]);

removePending("invoiceCreate", "inv-066");
check("create 만 제거되고 update 는 남는다",
      listPending(), [{ kind: "invoice", id: "inv-066" }]);

// ============================================================
section("6. 손상된 저장값에서도 죽지 않는다");
// ============================================================
reset();
localStorage.setItem("species-catalog:sync:pending", "{not json");
check("JSON 파싱 실패 → 빈 목록", listPending(), []);
check("hasPending() false", hasPending(), false);

addPending("invoiceCreate", "inv-072");
check("손상 후에도 정상 기록", listPending(), [{ kind: "invoiceCreate", id: "inv-072" }]);

// ============================================================
section("7. lastSync");
// ============================================================
reset();
check("초기값 null", getLastSync(), null);
const ts = setLastSync("2026-08-03T07:00:00.000Z");
check("setLastSync 는 기록한 값을 돌려준다", ts, "2026-08-03T07:00:00.000Z");
check("getLastSync 왕복", getLastSync(), "2026-08-03T07:00:00.000Z");

// ============================================================
section("8. id 재사용 가드 — 실측 데이터 (2026-08-03 inv-066~068)");
// ============================================================
// 배포 전에 기록된 pending 은 kind="invoice" 라 생성/수정을 구분할 수 없다.
// 그 항목은 update 경로로 흘러가므로, 덮어쓰기 직전에 created_at 으로
// 한 번 더 막는다. 아래 값은 실제 사고 데이터 그대로다.
const CLOUD = {
  "inv-066": "2026-08-03T06:30:11.806Z",
  "inv-067": "2026-08-03T06:31:38.610Z",
  "inv-068": "2026-08-03T06:34:03.134Z"
};

// 같은 레코드 — 로컬 저장과 서버 insert 사이 2~3초 지연
check("inv-066 상부농원 (Δ −3s) → 같은 문서",
      isDifferentInvoiceRecord("2026-08-03T06:30:08.675Z", CLOUD["inv-066"]), false);
check("inv-067 코리아가든 (Δ −3s) → 같은 문서",
      isDifferentInvoiceRecord("2026-08-03T06:31:35.710Z", CLOUD["inv-067"]), false);
check("inv-068 행운농원 (Δ −2s) → 같은 문서",
      isDifferentInvoiceRecord("2026-08-03T06:34:00.767Z", CLOUD["inv-068"]), false);

// 다른 레코드 — id 가 재발급된 신규 문서
check("inv-066 대림원예가든센터 (Δ +2912s) → 다른 문서 · 차단",
      isDifferentInvoiceRecord("2026-08-03T07:18:43.636Z", CLOUD["inv-066"]), true);
check("inv-067 초심농원 (Δ +3063s) → 다른 문서 · 차단",
      isDifferentInvoiceRecord("2026-08-03T07:22:41.867Z", CLOUD["inv-067"]), true);
check("inv-068 상부농원 9/2 (Δ +3116s) → 다른 문서 · 차단",
      isDifferentInvoiceRecord("2026-08-03T07:25:59.231Z", CLOUD["inv-068"]), true);

// ============================================================
section("9. id 재사용 가드 — 경계와 폴백");
// ============================================================
check("임계값은 300초", INVOICE_CREATED_AT_TOLERANCE_MS, 300_000);

const base = "2026-08-03T06:00:00.000Z";
const shift = ms => new Date(Date.parse(base) + ms).toISOString();
check("Δ = 0 (Cloud 에서 읽어온 레코드 수정 — 가장 흔한 정상 경로)",
      isDifferentInvoiceRecord(base, base), false);
check("Δ = +300초 (경계 · 초과 아님) → 통과",
      isDifferentInvoiceRecord(shift(300_000), base), false);
check("Δ = +300.001초 (초과) → 차단",
      isDifferentInvoiceRecord(shift(300_001), base), true);
check("Δ = −300.001초 (음수 방향도 대칭) → 차단",
      isDifferentInvoiceRecord(shift(-300_001), base), true);

// 판정 불가 → 기존 동작(통과). createdAt 없는 구 레코드가 수정 자체를
// 못 하게 되는 편이 덮어쓰기 위험보다 더 나쁘다.
check("로컬 createdAt 없음 → 기존 동작(통과)",
      isDifferentInvoiceRecord(undefined, base), false);
check("Cloud created_at 없음 → 기존 동작(통과)",
      isDifferentInvoiceRecord(base, null), false);
check("둘 다 없음 → 기존 동작(통과)",
      isDifferentInvoiceRecord(undefined, undefined), false);
check("파싱 불가 문자열 → 기존 동작(통과)",
      isDifferentInvoiceRecord("어제", base), false);
check("빈 문자열 → 기존 동작(통과)",
      isDifferentInvoiceRecord("", base), false);

// 표기 차이가 오탐을 만들지 않는지 — 같은 순간의 다른 표현
check("Z 표기 vs +00:00 오프셋 → 같은 순간으로 인식",
      isDifferentInvoiceRecord("2026-08-03T06:00:00.000Z",
                               "2026-08-03T06:00:00+00:00"), false);
check("Postgres 마이크로초 표기 → 같은 순간으로 인식",
      isDifferentInvoiceRecord("2026-08-03T06:00:00.000Z",
                               "2026-08-03T06:00:00.000123+00:00"), false);

// 임계값을 호출자가 좁힐 수 있는지 (진단용)
check("toleranceMs 인자 재정의 동작",
      isDifferentInvoiceRecord(shift(10_000), base, 5_000), true);

// ============================================================
section("10. 영구 실패 판별 — FK 위반 (실환경 speciesDelete:sp-005)");
// ============================================================
// 이 판별이 무너지면 영구 실패가 pending 에 남고, loadCloudFirst 가 Cloud
// 읽기를 영구히 건너뛴다 → 로컬 캐시가 낡음 → 잘못된 삭제·id 재발급.
// 실환경에서 이 한 건이 invoice 3건 덮어쓰기까지 연쇄시켰다.
const FK_MSG = 'update or delete on table "species" violates foreign key ' +
               'constraint "invoice_items_species_id_fkey" on table "invoice_items"';

check("PostgREST code + message", isForeignKeyViolation({ code: "23503", message: FK_MSG }), true);
check("code 없음 · message 만", isForeignKeyViolation({ message: FK_MSG }), true);
check("code 만", isForeignKeyViolation({ code: "23503" }), true);
check("실환경 sp-005 원문 그대로", isForeignKeyViolation({ message: FK_MSG }), true);

// 다른 실패 유형과 섞이면 안 된다 — 각기 처리 경로가 다르다.
check("PK 충돌(23505)은 FK 가 아니다",
      isForeignKeyViolation({ code: "23505", message: "duplicate key value violates unique constraint" }), false);
check("인증 만료는 FK 가 아니다", isForeignKeyViolation({ message: "JWT expired" }), false);
check("네트워크 오류는 FK 가 아니다", isForeignKeyViolation({ message: "Failed to fetch" }), false);
check("VERSION_CONFLICT 는 FK 가 아니다",
      isForeignKeyViolation({ message: "VERSION_CONFLICT: invoice inv-066 (expected v2)" }), false);
check("null", isForeignKeyViolation(null), false);
check("undefined", isForeignKeyViolation(undefined), false);

// ============================================================
section("11. 실패 유형은 서로 배타적이다");
// ============================================================
// 같은 오류가 conflict 로도 permanent 로도 분류되면 처리 경로가 갈린다.
check("FK 오류 → isUniqueViolation false", isUniqueViolation({ code: "23503", message: FK_MSG }), false);
check("FK 오류 → isForeignKeyViolation true", isForeignKeyViolation({ code: "23503", message: FK_MSG }), true);

const PK_ERR = { code: "23505", message: 'duplicate key value violates unique constraint "invoices_pkey"' };
check("PK 오류 → isUniqueViolation true", isUniqueViolation(PK_ERR), true);
check("PK 오류 → isForeignKeyViolation false", isForeignKeyViolation(PK_ERR), false);

// 영구 실패 메시지가 "전역 장애" 패턴에 걸리면 재시도 루프가 break 로 빠져나가
// 항목이 큐에 남는다 — 고치려는 버그가 그대로 재현된다.
const GLOBAL_RE_NET  = /SDK 로드 실패|Failed to fetch|NetworkError|Load failed|net::|ERR_INTERNET|timeout|fetch failed/i;
const GLOBAL_RE_AUTH = /JWT|Unauthorized|not authenticated|invalid token|token is expired|401/i;
const looksGlobal = m => GLOBAL_RE_NET.test(m) || GLOBAL_RE_AUTH.test(m);
check("FK 메시지가 전역 장애로 오분류되지 않는다", looksGlobal(FK_MSG), false);
check("PK 메시지가 전역 장애로 오분류되지 않는다", looksGlobal(PK_ERR.message), false);
check("ID_REUSE_GUARD 메시지가 전역 장애로 오분류되지 않는다",
      looksGlobal("ID_REUSE_GUARD: inv-066 의 Cloud 행은 다른 거래명세서입니다"), false);

// ============================================================
console.log("\n" + "=".repeat(58));
console.log(`통과 ${pass} · 실패 ${fail}`);
if (fail) {
  console.log("\n실패 항목:");
  for (const r of results.filter(x => !x.ok)) console.log(`  ✗ ${r.label}`);
}
console.log("=".repeat(58));
process.exit(fail ? 1 : 0);
