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
 * kind ∈ "invoice" | "invoiceDelete" | "species" | "speciesDelete"
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

/** 마지막 성공 동기화 시각 기록. */
export function setLastSync(ts = new Date().toISOString()) {
  try { localStorage.setItem(LASTSYNC_KEY, ts); } catch { /* ignore */ }
  return ts;
}

/** 마지막 성공 동기화 시각 조회. */
export function getLastSync() {
  try { return localStorage.getItem(LASTSYNC_KEY); } catch { return null; }
}
