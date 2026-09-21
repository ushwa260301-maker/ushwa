/**
 * plantResourceProvider — 국립수목원 식물자원 조회 (`15143513`).
 *
 * 도감 정보의 **기준 출처**다. `knaProvider`(국가표준식물목록 `scnmSearch`)가
 * 학명과 정명/이명을 확정해 준다면, 이쪽은 형태·분포·번식·재배 같은 **도감
 * 서술**을 준다. 둘은 경쟁하는 Provider 가 아니라 역할이 다르다.
 *
 * ## 2단계 조회
 *
 *     국명 → plantPilbkSearch(reqSearchWrd)  → plantPilbkNo
 *          → plantPilbkInfo(reqPlantPilbkNo) → 도감 서술
 *
 * 검색이 도감번호만 주고 상세가 내용을 준다. 그래서 `search()` 안에서 두 번
 * 호출한다 — 호출부가 이 단계를 알 필요가 없다.
 *
 * ## 이 출처가 주지 않는 것
 *
 *   개화월   `shpe`(형태) 문장 안에 섞여 온다. **별도 필드가 없다.**
 *   광 조건  `grwEvrntDesc` 가 자연어 서술이고 비어 있는 행도 많다.
 *   사진     아예 없다 — 이미지 Provider 가 따로 맡는다.
 *
 * 문장에서 월이나 enum 을 뽑는 것은 추론이라 하지 않는다. 원문을 그대로
 * `metadata.guide` 에 보관해 사람이 읽게 한다.
 */

import { toPlantRecord } from "../plantRecord.js";

export const SOURCE = "kna";
export const LABEL = "국립수목원 식물자원";

/** Edge Function 이름. 검색·상세 두 오퍼레이션을 이 함수가 감싼다. */
export const FUNCTION_NAME = "plant-resource-kna";

/** 오퍼레이션 이름 — 문자열은 여기에만 둔다. */
export const SEARCH_OP = "plantPilbkSearch";
export const DETAIL_OP = "plantPilbkInfo";

/**
 * 검색 결과 1행 → 도감번호.
 *
 * 검색 응답이 무엇을 더 주는지는 확인되지 않았다. 확인된 것은 `plantPilbkNo`
 * 하나뿐이라 그것만 읽는다 — 없는 필드를 넘겨짚지 않는다.
 *
 * @returns {string} 도감번호. 없으면 빈 문자열
 */
export function mapSearchRow(row) {
  if (!row || typeof row !== "object") return "";
  return String(row.plantPilbkNo ?? "").trim();
}

/**
 * 상세 응답 1행 → PlantRecord 원본 필드. **이름만 바꾼다.**
 *
 *   plantPilbkNo    → recordId (→ metadata.source_id)
 *   plantGnrlNm     → koreanName
 *   plantSpecsScnm  → scientificName
 *   familyNm · familyKorNm → familyNameLatin · familyNameKo
 *   genusNm  · genusKorNm  → genusNameLatin  · genusNameKo
 *   shpe            → formRaw              (개화 서술이 여기 섞인다)
 *   dstrb           → distributionRaw
 *   orplcNm         → originRaw
 *   brdMthdDesc     → propagationRaw
 *   farmSpftDesc    → cultivationRaw
 *   grwEvrntDesc    → growthEnvironmentRaw
 *   notRcmmGnrlNm   → notRecommendedNameRaw
 *   note            → sourceNoteRaw
 *
 * 도감번호가 없는 행은 `null` 이다 — 출처를 되짚을 수 없는 레코드는 만들지 않는다.
 */
export function mapDetailRow(row) {
  if (!row || typeof row !== "object") return null;
  const recordId = String(row.plantPilbkNo ?? "").trim();
  if (!recordId) return null;

  return {
    recordId,
    koreanName:            row.plantGnrlNm,
    scientificName:        row.plantSpecsScnm,
    familyNameLatin:       row.familyNm,
    familyNameKo:          row.familyKorNm,
    genusNameLatin:        row.genusNm,
    genusNameKo:           row.genusKorNm,
    formRaw:               row.shpe,
    distributionRaw:       row.dstrb,
    originRaw:             row.orplcNm,
    propagationRaw:        row.brdMthdDesc,
    cultivationRaw:        row.farmSpftDesc,
    growthEnvironmentRaw:  row.grwEvrntDesc,
    notRecommendedNameRaw: row.notRcmmGnrlNm,
    sourceNoteRaw:         row.note
  };
}

/** 매핑이 채워졌는가. 탐침에 도감번호를 넣는다 — 빈 행은 정당하게 거절된다. */
export function isReady() {
  return mapDetailRow({ plantPilbkNo: "probe" }) !== null;
}

/**
 * 매핑된 행 + 판 → PlantRecord. 출처를 되짚을 수 없으면 만들지 않는다.
 * `provider` 는 여기서 조립한다 — 한 행이 자기 출처나 판을 잘못 말할 수 없게.
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
 * 국명(또는 학명)으로 도감을 조회한다. **절대 throw 하지 않는다.**
 *
 * 검색이 여러 건을 주면 상세를 모두 받아 후보로 올린다 — 어느 것을 채택할지는
 * speciesService 가 정한다(정명 규칙·AMBIGUOUS 판정). 여기서 하나로 줄이면
 * 그 판단 근거가 사라진다.
 *
 * @param {string} query
 * @param {{invoke: (fn:string, body:object) => Promise<object>, maxDetails?: number}} ctx
 */
export async function search(query, ctx) {
  if (!isReady()) {
    return { ok: false, notConfigured: true,
             error: `${LABEL} 응답 매핑이 아직 설정되지 않았습니다` };
  }
  try {
    const found = await ctx.invoke(FUNCTION_NAME, { op: SEARCH_OP, query });
    const version = String(found?.version ?? "").trim();
    const numbers = (Array.isArray(found?.records) ? found.records : [])
      .map(mapSearchRow).filter(Boolean);

    if (!numbers.length) {
      return { ok: true, candidates: [], latestVersions: found?.latestVersions || null };
    }

    // 상세는 도감번호마다 한 번씩. 한도를 두어 쿼터를 한꺼번에 태우지 않는다.
    const limit = Number.isInteger(ctx.maxDetails) && ctx.maxDetails > 0 ? ctx.maxDetails : 5;
    const candidates = [];
    for (const no of numbers.slice(0, limit)) {
      const detail = await ctx.invoke(FUNCTION_NAME, { op: DETAIL_OP, plantPilbkNo: no });
      const rows = Array.isArray(detail?.records) ? detail.records : [];
      for (const r of rows) {
        const c = toCandidate(mapDetailRow(r), String(detail?.version ?? version).trim());
        if (c) candidates.push(c);
      }
    }
    return { ok: true, candidates, latestVersions: found?.latestVersions || null };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}
