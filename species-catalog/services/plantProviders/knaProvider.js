/**
 * knaProvider — 국립수목원(Korea National Arboretum) 식물 조회.
 *
 * ⚠ **서비스 키를 프론트에 두지 않는다.** 배포본은 정적 파일이라 키를 넣으면
 *   누구나 읽는다. 이 Provider 는 Supabase Edge Function 을 호출하고, 키는
 *   Edge Function 이 보관한다. CORS 도 함께 해결된다.
 *
 * ⚠ **응답 매핑은 비어 있다.** 실제 응답을 확인하기 전에는 필드명을 추측하지
 *   않는다 — 추측으로 채우면 원본에 없는 값이 Species 에 들어간다. `mapRow` 를
 *   검증된 샘플로 채우기 전까지 이 Provider 는 `notConfigured` 를 돌려준다.
 */

import { toPlantRecord } from "../plantRecord.js";

export const SOURCE = "kna";
export const LABEL = "국립수목원";

/** Edge Function 경로. plantService 가 baseUrl 을 붙여 호출한다. */
export const FUNCTION_NAME = "plant-search-kna";

/**
 * 응답 레코드 1건 → PlantRecord 부분.
 *
 * 🔴 검증된 응답 샘플을 받은 뒤 채울 것. 지금은 의도적으로 비어 있다.
 *    예시(실제 필드명 아님):
 *      return { source: SOURCE, sourceId: row.plantPilbkNo,
 *               koreanName: row.korNm, scientificName: row.scinm, … };
 *
 * @param {object} _row
 * @returns {object|null} null 이면 "이 행은 해석할 수 없음"
 */
export function mapRow(_row) {
  return null;
}

/** 매핑이 채워졌는가 — 안 채워졌으면 조회하지 않는다. */
export function isReady() {
  return mapRow({ probe: 1 }) !== null;
}

/**
 * 식물명/학명으로 검색한다. 절대 throw 하지 않는다.
 * @param {string} query
 * @param {{invoke: (fn: string, body: object) => Promise<object>}} ctx
 *        Edge Function 호출자. plantService 가 주입한다(테스트에서도 주입).
 * @returns {Promise<{ok:boolean, candidates?:object[], notConfigured?:boolean, error?:string}>}
 */
export async function search(query, ctx) {
  if (!isReady()) {
    return { ok: false, notConfigured: true,
             error: `${LABEL} 응답 매핑이 아직 설정되지 않았습니다` };
  }
  try {
    const res = await ctx.invoke(FUNCTION_NAME, { q: query });
    const rows = Array.isArray(res?.items) ? res.items : [];
    const candidates = rows.map(mapRow).filter(Boolean)
      .map(r => toPlantRecord({ ...r, source: SOURCE }));
    return { ok: true, candidates };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}
