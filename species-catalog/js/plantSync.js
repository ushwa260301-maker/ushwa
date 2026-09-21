/**
 * plantSync — 수종 저장 직후 도감 메타데이터를 채우는 앱 계층 배선 (T11-5).
 *
 * `speciesService` 는 state · storage · supabase 를 모른다(순수 오케스트레이션).
 * 그 바깥을 여기서 잇는다 — Edge Function 호출자, patch 적용, 결과 기록.
 *
 * ## 언제 도는가
 *
 * 저장이 **성공한 뒤**, 그 수종이 `PENDING` 일 때만. 이미 연동됐거나 사용자가
 * 값을 넣은 수종은 건드리지 않는다 — 자동 채움이 사람 입력을 밀어내면 안 된다.
 *
 * ## 실패해도 저장을 되돌리지 않는다
 *
 * 동기화는 **부가 작업**이다. 수종 저장은 이미 끝났고, 도감 정보를 못 받았다고
 * 그 저장이 무효가 되지 않는다. 그래서 여기서 나온 오류는 저장 흐름으로
 * 올라가지 않고 기록과 토스트로만 표면화한다.
 */

import { state } from "./state.js";
import { storage } from "./storage.js";
import { getSupabase, isCloudConfigured } from "./supabaseClient.js";
import { mirrorSaveSpecies } from "./cloudStore.js";
import { normalizeMetadata } from "./utils.js";
import { syncMetadata, SKIP_REASON } from "../services/speciesService.js";
import { FUNCTION_NAME } from "../services/plantProviders/knaProvider.js";
import { resolveSyncStatus } from "../services/metadataMigration.js";

/**
 * 동기화 결과 구분.
 *
 * ⚠ 이 값들은 `metadata.sync_status` 에 저장하지 **않는다.** 저장 가능한 상태는
 *   PENDING · SYNCED · USER_EDITED 셋뿐이고(plantNormalizer), 여기에 실패 사유를
 *   섞으면 "출처와의 동기화 상태"라는 필드의 뜻이 흐려진다. 셋 다 결과적으로는
 *   **동기화되지 않았으므로 PENDING 으로 남는다** — 다음 기회에 다시 시도된다.
 *   무엇이 왜 안 됐는지는 아래 로그가 답한다.
 */
export const SYNC_OUTCOME = {
  SYNCED:    "SYNCED",      // 채워짐
  NO_MATCH:  "NO_MATCH",    // 식물 DB 에 없음 — 재시도해도 같다
  AMBIGUOUS: "AMBIGUOUS",   // 후보가 둘 이상 — 사람이 골라야 한다
  FAILED:    "FAILED",      // 조회 자체가 실패 — 키·파라미터·네트워크
  SKIPPED:   "SKIPPED"      // 대상이 아님 (PENDING 이 아니거나 이름이 없음)
};

/** 결과 기록처. 최근 것부터 쌓인다. */
export const SYNC_LOG_KEY = "species-catalog:sync:plant-metadata";
export const SYNC_LOG_MAX = 100;

/**
 * 결과를 남긴다.
 *
 * ⚠ DB 의 `audit_log` 에는 쓰지 않는다 — 쓸 수 없다. `policies.sql` 이 앱에
 *   SELECT 만 허용하고, 기록은 트리거(SECURITY DEFINER)만 한다. 대신 동기화가
 *   **성공해서 species 행이 바뀌면** 그 UPDATE 는 `trg_audit_species` 가
 *   자동으로 audit_log 에 남긴다. 여기 로그가 답하는 것은 그 반대편 —
 *   **행이 바뀌지 않은 이유**다. 서버는 일어나지 않은 일을 기록하지 않는다.
 */
export function recordOutcome(entry) {
  const row = { at: new Date().toISOString(), ...entry };
  let log = [];
  try {
    log = JSON.parse(localStorage.getItem(SYNC_LOG_KEY) || "[]");
    if (!Array.isArray(log)) log = [];
  } catch { log = []; }
  log.unshift(row);
  try {
    localStorage.setItem(SYNC_LOG_KEY, JSON.stringify(log.slice(0, SYNC_LOG_MAX)));
  } catch { /* 용량 초과 — 기록을 못 남겨도 동기화는 계속한다 */ }
  return row;
}

/** 쌓인 결과를 읽는다 (디버그 패널 · 관리 화면용). */
export function readOutcomes() {
  try {
    const log = JSON.parse(localStorage.getItem(SYNC_LOG_KEY) || "[]");
    return Array.isArray(log) ? log : [];
  } catch { return []; }
}

/** Edge Function 호출자. 서비스 키는 함수 쪽에 있고 여기로 오지 않는다. */
export async function edgeInvoke(fnName, body) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.functions.invoke(fnName, { body });
  if (error) throw error;
  return data;
}

/**
 * patch 를 반영한다. **기존 수종만 갱신한다 — 새 번호를 만들지 않는다.**
 * 찾지 못하면 아무 일도 하지 않는다(그 편이 잘못된 행을 만드는 것보다 낫다).
 */
async function applyPatch(id, patch) {
  const idx = state.data.species.findIndex(s => s.id === id);
  if (idx < 0) return;

  const before = state.data.species[idx];
  const next = { ...before, ...patch, id };
  next.metadata = normalizeMetadata(patch.metadata);
  state.data.species[idx] = next;

  storage.save(state.data);

  // latin · category · bloomMonths 는 Cloud 컬럼이라 미러한다.
  // metadata 자체는 species 테이블에 컬럼이 없어 로컬에만 남는다(별건).
  if (isCloudConfigured()) {
    try { await mirrorSaveSpecies(next); }
    catch { /* 미러 실패가 로컬 반영을 되돌리지 않는다 */ }
  }
}

/** speciesService 의 건너뜀 사유 → 결과 구분. */
function outcomeForSkip(reason) {
  if (reason === SKIP_REASON.AMBIGUOUS) return SYNC_OUTCOME.AMBIGUOUS;
  if (reason === SKIP_REASON.NO_MATCH)  return SYNC_OUTCOME.NO_MATCH;
  return SYNC_OUTCOME.SKIPPED;
}

/**
 * 수종 하나를 저장 직후 동기화한다. **절대 throw 하지 않는다.**
 *
 * @param {object} species  방금 저장된 Species
 * @param {object} [ctx]    테스트에서 invoke · applyPatch 를 갈아 끼운다
 * @returns {Promise<{outcome:string, id:string, reason?:string}>}
 */
export async function syncAfterSave(species, ctx = {}) {
  const id = String(species?.id || "");
  if (!id) return { outcome: SYNC_OUTCOME.SKIPPED, id, reason: "id 없음" };

  // PENDING 인 것만. 사람이 넣은 값이나 이미 연동된 것은 손대지 않는다.
  const status = resolveSyncStatus(species.metadata,
                                   state.referenceData?.latestProviderVersions);
  if (status !== "PENDING") {
    return { outcome: SYNC_OUTCOME.SKIPPED, id, reason: `대상 아님 (${status})` };
  }

  const invoke = ctx.invoke ?? edgeInvoke;
  // Cloud 설정이 없으면 Edge Function 도 없다 — 조용히 넘어간다.
  if (ctx.invoke === undefined && !isCloudConfigured()) {
    return { outcome: SYNC_OUTCOME.SKIPPED, id, reason: "Cloud 미설정" };
  }

  let res;
  try {
    res = await syncMetadata([species], {
      invoke,
      applyPatch: ctx.applyPatch ?? applyPatch,
      latestVersions: state.referenceData?.latestProviderVersions,
      limit: 1
    });
  } catch (err) {
    const row = { outcome: SYNC_OUTCOME.FAILED, id, reason: err?.message || String(err) };
    recordOutcome({ ...row, fn: FUNCTION_NAME });
    return row;
  }

  // 출처가 알려 준 최신 판은 전역 기준값 한 벌로 둔다.
  if (res.latestVersions && state.referenceData) {
    state.referenceData.latestProviderVersions = res.latestVersions;
  }

  let row;
  if (res.updated.length) {
    row = { outcome: SYNC_OUTCOME.SYNCED, id, name: species.name };
  } else if (res.failed.length) {
    row = { outcome: SYNC_OUTCOME.FAILED, id, name: species.name,
            reason: res.failed[0].reason };
  } else {
    const skip = res.skipped[0] || {};
    row = { outcome: outcomeForSkip(skip.reason), id, name: species.name,
            reason: skip.reason };
  }
  recordOutcome({ ...row, fn: FUNCTION_NAME });
  return row;
}
