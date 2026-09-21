/**
 * speciesService — 도감 메타데이터 자동 동기화 (T11-5).
 *
 * 아직 출처와 연결되지 않은 수종(`sync_status === "PENDING"`)만 골라 식물 DB 를
 * 조회하고, 받은 값을 기존 metadata 위에 **얹는다.**
 *
 * ## 이 계층이 하지 않는 일
 *
 *   API 를 직접 부르지 않는다   Edge Function 이 부른다. 서비스 키는 프론트에
 *                              오지 않는다 — 정적 배포라 넣는 순간 공개된다.
 *   수종을 만들지 않는다        기존 레코드만 갱신한다. 새 번호를 발급하지
 *                              않는다(sp-060~063 사고의 경로가 그것이었다).
 *   값을 정규화하지 않는다      plantNormalizer 가 한다.
 *   덮어쓰지 않는다             toSpeciesPatch 가 병합한다 — 사용자가 넣은
 *                              토양·실내외·메모·사진은 살아남는다.
 *
 * ## 애매하면 건너뛴다
 *
 * 후보가 둘 이상이면 갱신하지 않는다. 같은 이름의 식물이 여러 건일 때 어느
 * 쪽인지 정할 근거가 없고, 잘못 붙은 출처는 없는 출처보다 나쁘다 — 그 뒤로는
 * 모든 갱신이 틀린 원본을 따라간다.
 *
 * ## 의존성은 주입받는다
 *
 * state · storage · supabase 를 모른다. 호출자가 `invoke`(Edge Function 호출자)와
 * `applyPatch`(저장)를 넣어 준다. 그래야 네트워크 없이 검사할 수 있다.
 */

import { search } from "./plantService.js";
import { toSpeciesPatch, ACCEPTED_NAME_STATUS } from "./plantRecord.js";
import { resolveSyncStatus } from "./metadataMigration.js";
import { attachPhotos } from "./plantProviders/plantImageProvider.js";

/** 자동 동기화 대상 상태. 사람이 손댄 것(USER_EDITED)은 건드리지 않는다. */
export const SYNCABLE_STATUS = "PENDING";

/** 한 번에 처리하는 최대 건수 — 공공 API 쿼터를 한꺼번에 태우지 않는다. */
export const DEFAULT_LIMIT = 20;

/** 건너뛴 이유 — 보고용. 무엇을 왜 안 했는지 말할 수 있어야 한다. */
export const SKIP_REASON = {
  NOT_PENDING: "이미 연동됐거나 사용자가 입력한 값이 있음",
  NO_NAME:     "조회할 이름이 없음",
  NO_MATCH:    "식물 DB 에 없음",
  SYNONYM_ONLY: "이명만 있음 — 정명이 없어 채택하지 않음",
  AMBIGUOUS:   "정명 후보가 둘 이상 — 어느 쪽인지 정할 근거가 없음",
  NO_CHANGE:   "받은 값에 새로운 내용이 없음"
};

/**
 * 동기화 대상만 고른다.
 *
 * `resolveSyncStatus` 를 쓰는 이유는 저장된 상태가 없는 구버전 레코드도
 * 같은 규칙으로 판정하기 위해서다 — 상태를 정하는 곳은 한 군데여야 한다.
 */
export function pendingSpecies(list, latestVersions = {}) {
  return (list || []).filter(sp =>
    sp?.id && resolveSyncStatus(sp.metadata, latestVersions) === SYNCABLE_STATUS
  );
}

/** 값을 말했는가. 빈 문자열·null 은 "말하지 않음"이다. */
function told(v) {
  return v !== null && v !== undefined && String(v).trim() !== "";
}

/** 조회에 쓸 이름. 국명이 먼저고, 없으면 학명으로 찾는다. */
function queryFor(sp) {
  return String(sp?.name || sp?.latin || "").trim();
}

/**
 * 수종 하나를 동기화한다. **절대 throw 하지 않는다.**
 *
 * @returns {{status:"updated"|"skipped"|"failed", id:string, reason?:string,
 *            patch?:object, source?:string}}
 */
export async function syncOne(sp, ctx = {}) {
  const id = String(sp?.id || "");
  const query = queryFor(sp);
  if (!query) return { status: "skipped", id, reason: SKIP_REASON.NO_NAME };

  let res;
  try {
    res = await search(query, {
      invoke: ctx.invoke,
      cache: ctx.cache,
      // 자동 동기화는 관리자 동작이다 — 여기서만 외부 조회를 허용한다.
      allowRemote: ctx.allowRemote !== false
    });
  } catch (err) {
    // plantService 는 던지지 않지만, 주입된 invoke 가 던질 수 있다.
    return { status: "failed", id, reason: err?.message || String(err) };
  }

  if (!res?.ok) return { status: "failed", id, reason: res?.error || "조회 실패" };

  /**
   * 정명만 자동 채택한다.
   *
   * 이명(synonym)은 같은 식물을 가리키는 **폐기된 이름**이다. 후보로는 유효하지만
   * 정본이 아니라서, 그대로 채워 넣으면 그 뒤의 모든 갱신이 옛 이름을 따라간다.
   * 출처가 지위를 말하지 않는 Provider(nire · gbif)는 거르지 않는다 —
   * 말하지 않은 것을 이명으로 취급하면 멀쩡한 후보가 사라진다.
   */
  const all = res.candidates || [];
  const stated = all.filter(c => told(c?.scientificNameStatus));
  const candidates = stated.length
    ? stated.filter(c => c.scientificNameStatus === ACCEPTED_NAME_STATUS)
    : all;

  // 정명이 없고 이명만 있으면 "없음"이다 — 채택할 이름이 없다.
  if (candidates.length === 0 && all.length > 0) {
    return { status: "skipped", id, reason: SKIP_REASON.SYNONYM_ONLY,
             synonyms: all.map(c => c.scientificName).filter(Boolean) };
  }

  if (candidates.length === 0) {
    /**
     * plantService 는 Provider 가 실패해도 다음 Provider 로 내려가므로, 전부
     * 실패해도 `ok: true` 에 후보 0건으로 돌아온다. 그걸 "없음"으로 보고하면
     * 서비스 키 만료·파라미터 오류가 **검색 결과 없음으로 묻힌다** — 둘은
     * 대응이 완전히 다르다. 문제가 보고됐으면 실패로 올린다.
     */
    if (res.problems?.length) {
      return { status: "failed", id, reason: res.problems.join(" · ") };
    }
    return { status: "skipped", id, reason: SKIP_REASON.NO_MATCH };
  }
  if (candidates.length > 1) return { status: "skipped", id, reason: SKIP_REASON.AMBIGUOUS };

  /**
   * 사진은 별도 출처에서 **학명 완전 일치**로만 붙인다.
   *
   * 도감 API 는 사진을 주지 않고, 두 출처를 잇는 ID 도 없어 학명 문자열이
   * 유일한 고리다. 느슨하게 맞추면 품종이 원종 사진을 달게 된다 — 조경 현장에서
   * 사진을 보고 수종을 고르는데 그게 다른 식물이면 없는 것보다 나쁘다.
   *
   * 못 찾으면 원본 그대로 진행한다. photosRaw 가 [] 로 남을 뿐, 나머지
   * metadata 는 정상적으로 채워진다 — 사진이 없다고 도감 정보를 버리지 않는다.
   */
  let chosen = candidates[0];
  if (ctx.images?.select || ctx.images?.invoke) {
    try {
      chosen = await attachPhotos(chosen, ctx.images);
    } catch {
      // 사진 조회 실패가 동기화 전체를 실패시키지 않는다.
    }
  }

  // 병합 patch — 기존 metadata 를 덮지 않는다.
  const patch = toSpeciesPatch(sp, chosen, ctx.now);

  // 출처와 이어지지 않은 결과는 반영하지 않는다. provider 가 비어 있다면
  // 되짚을 수 없는 값이고, 그건 사용자 입력과 구분되지 않는다.
  if (!patch.metadata?.provider?.name) {
    return { status: "skipped", id, reason: SKIP_REASON.NO_CHANGE };
  }

  if (typeof ctx.applyPatch === "function") {
    try {
      await ctx.applyPatch(id, patch);
    } catch (err) {
      return { status: "failed", id, reason: err?.message || String(err) };
    }
  }
  return { status: "updated", id, patch, source: res.source, latestVersions: res.latestVersions };
}

/**
 * PENDING 인 수종들을 차례로 동기화한다.
 *
 * 한 건이 실패해도 멈추지 않는다 — 20건 중 3건이 실패했다는 사실이 0건 처리보다
 * 쓸모 있다. 결과는 무엇을 왜 했는지 그대로 담아 돌려준다.
 *
 * @param {object[]} list  Species 목록 (state.data.species)
 * @param {{
 *   invoke?: (fn:string, body:object) => Promise<object>,
 *   images?: { select?: (name:string) => Promise<object[]>,
 *              invoke?: (fn:string, body:object) => Promise<object>, max?: number },
 *   cache?: object,
 *   applyPatch?: (id:string, patch:object) => Promise<void>|void,
 *   latestVersions?: Record<string,string>,
 *   limit?: number,
 *   allowRemote?: boolean,
 *   now?: string
 * }} [ctx]
 * @returns {Promise<{updated:object[], skipped:object[], failed:object[],
 *                    latestVersions: Record<string,string>|null}>}
 */
export async function syncMetadata(list, ctx = {}) {
  const limit = Number.isInteger(ctx.limit) && ctx.limit > 0 ? ctx.limit : DEFAULT_LIMIT;
  const targets = pendingSpecies(list, ctx.latestVersions).slice(0, limit);

  const updated = [], skipped = [], failed = [];
  let latestVersions = null;

  for (const sp of targets) {
    const r = await syncOne(sp, ctx);
    if (r.status === "updated") {
      updated.push(r);
      // 출처가 알려 준 최신 판은 전역 기준값이다 — 마지막 값을 올려 보낸다.
      if (r.latestVersions) latestVersions = r.latestVersions;
    } else if (r.status === "skipped") skipped.push(r);
    else failed.push(r);
  }

  return { updated, skipped, failed, latestVersions };
}
