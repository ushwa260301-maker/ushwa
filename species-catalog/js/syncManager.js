/**
 * syncManager.js — T6 Phase 3: 최소 sync 상태 관리 (pending / retry).
 *
 * 목적: Cloud-first read(Phase 1)가 로컬 캐시를 Cloud 로 덮어쓰기 전에,
 * mirror 실패로 아직 Cloud 에 반영되지 않은 로컬 변경(pending)을 보호하고
 * 재시도한다. 이는 순서·충돌을 보장하는 Offline Queue 가 아니라,
 * "실패한 쓰기를 잃지 않기" 위한 최소 상태 저장이다.
 *
 * 이 모듈은 순수 상태 저장소다 — Cloud/state/UI 를 모른다. 재-mirror
 * 오케스트레이션은 호출자(app.js)가 수행한다.
 *
 * 저장 (LocalStorage · storage.js 와 분리된 자체 키):
 *   species-catalog:sync:pending    [{ kind, id }]
 *   species-catalog:sync:lastSync   ISO 문자열
 *
 * kind ∈ "invoiceCreate" | "invoice" | "invoiceDelete" | "species"
 *      | "speciesDelete" | "attachment" | "ocrCorrection"
 *
 * `invoiceCreate` 와 `invoice` 를 나누는 이유
 *   둘 다 "invoice" 였을 때, 재시도는 종류를 알 수 없어 전부 update 로
 *   보냈다. 그런데 **생성 실패**를 update 로 재시도하면 같은 id 가 Cloud 에
 *   이미 있을 때 그 행을 덮어쓴다 — 생성이 실패한 이유가 바로 "그 id 가
 *   이미 있다"(PK 충돌)인 경우, 재시도가 남의 거래명세서를 지운다.
 *   실제로 inv-066~068 이 이 경로에 걸렸다.
 *
 *   pending 에 남아 있다는 것은 "아직 Cloud 저장이 확인되지 않았다"는 뜻이다.
 *   따라서 `invoiceCreate` 는 곧 "이 id 로 Cloud 에 행을 만든 적 없음"이고,
 *   그 id 가 Cloud 에 있다면 그것은 **다른 문서**다. 생성 재시도는 생성으로만
 *   해야 하며, 충돌하면 덮어쓰지 말고 실패로 남겨야 한다.
 */

const PENDING_KEY  = "species-catalog:sync:pending";
const LASTSYNC_KEY = "species-catalog:sync:lastSync";

function read() {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || "[]"); }
  catch { return []; }
}
function write(list) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(list)); }
  catch (err) { console.warn("[sync] pending 저장 실패:", err?.message || err); }
}

/** pending 항목 추가 (같은 kind+id 중복 제거). */
export function addPending(kind, id) {
  if (!id) return;
  const list = read().filter(e => !(e.kind === kind && e.id === id));
  list.push({ kind, id });
  write(list);
}

/** pending 항목 제거. */
export function removePending(kind, id) {
  write(read().filter(e => !(e.kind === kind && e.id === id)));
}

/** 현재 pending 목록 (복사본). */
export function listPending() {
  return read();
}

/** pending 존재 여부. */
export function hasPending() {
  return read().length > 0;
}

/**
 * pending kind → 재시도 동작. 라우팅 규칙을 이 한 곳에만 둔다.
 *
 * app.js 의 재시도 루프가 이 값으로 분기하므로, 여기서 매핑이 틀리면
 * 즉시 잘못된 미러 함수가 호출된다 — 그래서 순수 함수로 분리해
 * `tests/sync-pending.mjs` 가 직접 검증할 수 있게 한다.
 *
 * 알 수 없는 kind 는 null 을 돌려준다. 호출자는 이를 "처리 불가 → 폐기"
 * 로 다루며, 이는 분기 전 동작(else 절에서 removePending)과 동일하다.
 *
 * @param {string} kind
 * @returns {"invoiceSave"|"invoiceUpdate"|"invoiceDelete"|"speciesSave"|"speciesDelete"|"attachmentSave"|"ocrCorrectionSave"|null}
 */
export function replayAction(kind) {
  switch (kind) {
    case "invoiceCreate": return "invoiceSave";     // 생성 재시도 — 절대 update 로 가지 않는다
    case "invoice":       return "invoiceUpdate";   // 수정 재시도 — 기존 행이 있어야 정상
    case "invoiceDelete": return "invoiceDelete";
    case "species":       return "speciesSave";
    case "speciesDelete": return "speciesDelete";
    case "attachment":    return "attachmentSave";
    case "ocrCorrection": return "ocrCorrectionSave";
    default:              return null;
  }
}

/** 마지막 성공 동기화 시각 기록. */
export function setLastSync(ts = new Date().toISOString()) {
  try { localStorage.setItem(LASTSYNC_KEY, ts); } catch { /* ignore */ }
  return ts;
}

/** 마지막 성공 동기화 시각 조회. */
export function getLastSync() {
  try { return localStorage.getItem(LASTSYNC_KEY); } catch { return null; }
}
