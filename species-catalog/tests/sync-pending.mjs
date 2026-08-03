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
console.log("\n" + "=".repeat(58));
console.log(`통과 ${pass} · 실패 ${fail}`);
if (fail) {
  console.log("\n실패 항목:");
  for (const r of results.filter(x => !x.ok)) console.log(`  ✗ ${r.label}`);
}
console.log("=".repeat(58));
process.exit(fail ? 1 : 0);
