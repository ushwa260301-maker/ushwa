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
 *
 * 역할 범위 (T10.1)
 *   여기서는 **필드 이름만 바꾼다.** 값 변환(enum · 배열 · 설명 구조)은 하지
 *   않는다 — 그건 plantNormalizer 가 전담한다. Provider 마다 변환을 복사하면
 *   출처별로 값이 미묘하게 달라진다.
 */

import { toPlantRecord } from "../plantRecord.js";

export const SOURCE = "kna";
export const LABEL = "국립수목원";

/** Edge Function 경로. plantService 가 baseUrl 을 붙여 호출한다. */
export const FUNCTION_NAME = "plant-search-kna";

/**
 * 응답 레코드 1건 → PlantRecord 원본 필드. **값은 원문 그대로 넘긴다.**
 *
 * ⚠ 이 매핑은 **명세 기반 Fixture** 로 맞춘 것이다 (T11-3.2). 실제 국립수목원
 *   서버에서 받아 온 응답으로 검증한 것이 아니다 — Edge Function 을 붙이는
 *   T11-4 에서 실제 응답과 대조하고, 필드명이 다르면 여기만 고치면 된다.
 *   Fixture 도 같은 성격이라 `tests/fixtures/kna_examples/` 에 두고 파일마다
 *   `_fixture_source: "spec_example"` 로 표시해 두었다.
 *
 * 하는 일은 **이름 바꾸기뿐이다.**
 *   월 배열 변환 · enum 변환 · HTML 제거 · 사진 타입 추측을 하지 않는다.
 *   `"6~8월"` 은 `"6~8월"` 로, `"반그늘"` 은 `"반그늘"` 로 넘어간다.
 *   전부 plantNormalizer 가 한다.
 *
 * `plantType` 에서 상록/낙엽을 뽑지 않는다. `"낙엽활엽관목"` 에 낙엽이라는
 * 글자가 있어도 그건 **추론**이다 — 출처가 별도 필드로 말해 줄 때만 받는다.
 * 그래서 `evergreenRaw` 는 비운다.
 *
 * `recordId` 가 없는 행은 `null` 을 돌려준다 — 학명을 대신 쓰지 않는다.
 * 같은 학명에 여러 행이 있을 수 있어 학명은 식별자가 못 된다.
 *
 * `provider` 는 채우지 않는다. toCandidate() 가 SOURCE 와 응답의 판(version)으로
 * 조립한다 — 한 행이 자기 출처를 잘못 말할 수 없게.
 *
 * @param {object} row
 * @returns {object|null} null 이면 "이 행은 해석할 수 없음"
 */
export function mapRow(row) {
  if (!row || typeof row !== "object") return null;
  const recordId = String(row.plantId ?? "").trim();
  if (!recordId) return null;

  return {
    recordId,
    koreanName:         row.koreanName,
    scientificName:     row.scientificName,
    family:             row.familyName,
    genus:              row.genusName,
    floweringMonthsRaw: row.floweringPeriod,
    fruitingMonthsRaw:  row.fruitingPeriod,
    sunlightRaw:        row.habitat,
    plantTypeRaw:       row.plantType,
    nativeStatusRaw:    row.nativeStatus,
    descriptionRaw:     row.description,
    photosRaw: (Array.isArray(row.images) ? row.images : []).map(img => ({
      url:     img?.imageUrl,
      caption: img?.caption ?? null,
      type:    null            // 꽃·잎 판정은 normalizePhotos 가 한다
    }))
  };
}

/**
 * 매핑이 채워졌는가 — 안 채워졌으면 조회하지 않는다.
 *
 * 탐침에 `plantId` 를 넣는다. mapRow 는 ID 없는 행을 **정당하게** 거절하므로,
 * 빈 탐침으로는 "매핑이 아직 없다" 와 "이 행에 ID 가 없다" 를 구분할 수 없다.
 */
export function isReady() {
  return mapRow({ plantId: "probe" }) !== null;
}

/**
 * 매핑된 행 + 판 → PlantRecord. **출처를 되짚을 수 없는 레코드는 만들지 않는다.**
 *
 * `provider.name` 이 "kna" 인데 `recordId` 가 비어 있으면, 그 레코드는 SYNCED
 * 상태가 되면서도 국립수목원의 어느 행에서 왔는지 말하지 못한다. 나중에 갱신할
 * 수도, 틀렸을 때 원본을 확인할 수도 없다 — 그래서 아예 만들지 않는다.
 *
 * 같은 규칙이 mapRow 의 계약에도 적혀 있지만, 여기서 한 번 더 막는다.
 * 주석에만 있는 규칙은 다음 사람이 잊는다. 레코드가 실제로 만들어지는
 * 길목에서 걸러야 규칙이 구조가 된다.
 *
 * @param {object|null} row      mapRow 결과
 * @param {string} version       Edge Function 이 알려 준 판. Provider 는 만들지 않는다.
 * @returns {object|null}
 */
export function toCandidate(row, version = "") {
  if (!row || typeof row !== "object") return null;
  const recordId = String(row.recordId ?? row.provider?.recordId ?? "").trim();
  if (!recordId) return null;
  return toPlantRecord({
    ...row,
    provider: { name: SOURCE, recordId, version: String(version ?? "").trim() }
  });
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
    const res = await ctx.invoke(FUNCTION_NAME, { query });
    const rows = Array.isArray(res?.records) ? res.records : [];
    // 판은 Edge Function 이 정한다 — Provider 가 만들어 내지 않는다.
    // 응답에 없으면 빈 값이고, 그러면 STALE 은 계산되지 않는다(SYNCED 유지).
    const version = String(res?.version ?? "").trim();
    // 원본 매핑 → 계약 모양. Provider 는 값을 건드리지 않는다.
    // recordId 없는 행은 toCandidate 가 떨어뜨린다.
    const candidates = rows.map(mapRow).map(r => toCandidate(r, version)).filter(Boolean);
    // latestVersions 는 전역 기준값이라 레코드마다 담지 않고 그대로 올려 보낸다.
    return { ok: true, candidates, latestVersions: res?.latestVersions || null };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}
