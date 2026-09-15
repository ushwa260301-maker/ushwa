/**
 * plantService — 식물 도감 조회의 단일 진입점.
 *
 * 조회 순서 (앞에서 결과가 나오면 멈춘다)
 *   ① Supabase 캐시     이미 받아 둔 값. 사용자는 외부 API 를 부르지 않는다.
 *   ② 국립수목원 (kna)
 *   ③ 국립생물자원관 (nire)
 *   ④ GBIF
 *
 * 설계 근거
 *   · **사용자는 외부 API 를 호출하지 않는다.** 실시간 조회는 관리자 동작이며,
 *     결과는 캐시에 적재돼 이후에는 캐시만 읽힌다. 정적 배포(GitHub Pages)에서
 *     매 조회마다 공공 API 를 부르면 키 노출·CORS·쿼터 문제가 한꺼번에 생긴다.
 *   · **키는 프론트에 없다.** Provider 는 Supabase Edge Function 을 부르고,
 *     키는 Edge Function 이 보관한다. CORS 도 거기서 해결된다.
 *   · **API 를 바꿔도 UI 는 그대로다.** Provider 가 무엇을 쓰든 결과는
 *     PlantRecord 한 모양이다 (plantRecord.js).
 *
 * 이 모듈은 state · storage · OCR 을 모른다. cloudStore 도 건드리지 않는다 —
 * 캐시 접근자는 호출자가 주입한다(`ctx.cache`).
 */

import { toPlantRecord } from "./plantRecord.js";
import * as kna  from "./plantProviders/knaProvider.js";
import * as nire from "./plantProviders/nireProvider.js";
import * as gbif from "./plantProviders/gbifProvider.js";

/** 조회 순서. 앞쪽이 우선이다. */
export const PROVIDERS = [kna, nire, gbif];

/** 캐시가 비활성일 때 쓰는 no-op — 호출자가 주입하지 않아도 동작한다. */
const NO_CACHE = {
  async lookup() { return []; },
  async store() { /* 저장하지 않음 */ }
};

/**
 * 식물명 또는 학명으로 검색한다. 절대 throw 하지 않는다.
 *
 * 결과
 *   { ok:true, source:"cache"|"kna"|"nire"|"gbif"|"none", candidates:[], latestVersions? }
 *   { ok:false, error }                       모든 경로 실패
 *
 * `latestVersions` 는 Edge Function 이 알려 준 **출처별 최신 판**이다
 * (`{ kna:"2026-09", nire:"2026-08", … }`). 식물마다 중복 저장하지 않고
 * 호출자가 `state.referenceData.latestProviderVersions` 에 한 벌만 둔다 —
 * 그래야 판이 올라갔을 때 전체 STALE 을 한 번에 다시 계산할 수 있다.
 * 캐시가 답한 경우에는 알 수 없으므로 `null` 이다.
 *
 * @param {string} query
 * @param {{
 *   cache?: {lookup:(q:string)=>Promise<object[]>, store?:(q:string, recs:object[])=>Promise<void>},
 *   invoke?: (fn:string, body:object) => Promise<object>,
 *   providers?: Array<object>,
 *   allowRemote?: boolean
 * }} [ctx]
 *   `allowRemote` 가 false 면 캐시만 본다 — 일반 사용자 경로의 기본값이다.
 */
export async function search(query, ctx = {}) {
  const q = String(query || "").trim();
  if (!q) return { ok: true, source: "none", candidates: [] };

  const cache = ctx.cache || NO_CACHE;
  const providers = ctx.providers || PROVIDERS;
  const allowRemote = ctx.allowRemote === true;   // 기본은 캐시 전용

  // ① 캐시
  try {
    const hit = await cache.lookup(q);
    if (Array.isArray(hit) && hit.length) {
      return { ok: true, source: "cache", candidates: hit.map(toPlantRecord) };
    }
  } catch (err) {
    console.warn("[plantService] 캐시 조회 실패(무시):", err?.message || err);
  }

  if (!allowRemote) {
    // 사용자 경로 — 외부 API 를 부르지 않는다. 캐시에 없으면 없는 것이다.
    return { ok: true, source: "none", candidates: [], cacheOnly: true };
  }
  if (typeof ctx.invoke !== "function") {
    return { ok: false, error: "Edge Function 호출자가 없습니다 (invoke 미주입)" };
  }

  // ②~④ Provider 순회 — 하나가 실패해도 다음을 시도한다.
  const problems = [];
  for (const p of providers) {
    const res = await p.search(q, { invoke: ctx.invoke });
    if (res?.ok && res.candidates?.length) {
      // 다음 조회부터는 캐시가 답하도록 적재한다.
      try { await cache.store?.(q, res.candidates); }
      catch (err) { console.warn("[plantService] 캐시 적재 실패(무시):", err?.message || err); }
      return { ok: true, source: p.SOURCE, candidates: res.candidates,
               latestVersions: res.latestVersions || null };
    }
    if (res?.notConfigured) problems.push(`${p.LABEL}: 매핑 미설정`);
    else if (res?.error)    problems.push(`${p.LABEL}: ${res.error}`);
  }

  // 전부 "설정 안 됨"이면 실패가 아니라 아직 준비가 안 된 것이다.
  const allUnconfigured = problems.length === providers.length &&
                          problems.every(m => m.endsWith("매핑 미설정"));
  if (allUnconfigured) {
    return { ok: false, notConfigured: true, source: "none", candidates: [],
             error: "식물 DB 연동이 아직 설정되지 않았습니다", problems };
  }
  return { ok: true, source: "none", candidates: [], problems };
}

/** 출처 코드 → Provider 표시 이름. 모르는 코드는 그대로 돌려준다. */
export function providerLabel(sourceCode) {
  return PROVIDERS.find(p => p.SOURCE === sourceCode)?.LABEL || sourceCode || "";
}
