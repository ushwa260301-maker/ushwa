/**
 * plantImageProvider — 표준식물목록 이미지 (`15116414`).
 *
 * 도감 API 는 사진을 주지 않는다. 사진은 이 목록에만 있고, 연결 고리는
 * **학명 문자열**이다 — 두 출처를 잇는 공통 ID 가 없다.
 *
 * ## 어디서 읽는가
 *
 * 원본은 CSV 라서 호출할 API 가 없다. `supabase/2026-09-21_plant_images.sql`
 * 이 만든 `plant_images` 테이블에 적재해 두고 여기서 조회한다.
 *
 *     scientific_name ──eq──▶ plant_images ──▶ photosRaw[{url, type, caption}]
 *
 * 조회자는 주입받는다(`ctx.select`). 이 계층은 Supabase 를 알지 못하고,
 * 그래야 네트워크 없이 검사할 수 있다.
 *
 * ## 완전 일치만 연결한다
 *
 * 학명이 정확히 같을 때만 사진을 붙인다. 느슨하게 맞추면 **품종이 원종 사진을
 * 달게 된다** — `Hydrangea paniculata 'Limelight'` 에 `Hydrangea paniculata`
 * 사진이 붙는 식이다. 라임라이트는 흰 꽃이 연두로 물드는 품종이고 원종과
 * 생김새가 다르다. 조경 현장에서 사진을 보고 수종을 고르는데 그 사진이 다른
 * 식물이면, 없는 것보다 나쁘다.
 *
 * 그래서 앞부분 일치(prefix)·속명 일치·유사도 매칭을 **하지 않는다.**
 * 못 찾으면 `[]` 를 돌려주고 metadata 의 나머지는 그대로 둔다.
 *
 * ## 다만 명명자는 뗀다 (T11-6.2)
 *
 * KNA 는 학명에 명명자를 붙이고(`Stipa tenuissima Trin.`) 우리는 붙이지
 * 않는다(`Stipa tenuissima`). 원문 완전 일치를 고집하면 **한 장도 붙지
 * 않는다** — 실측에서 4,565종 × 77종의 정확 매칭이 0건이었다.
 *
 * 명명자는 "누가 이 이름을 발표했는가" 라는 서지 정보라 떼어도 같은
 * 분류군이다. 품종은 다른 분류군이라 그대로 둔다. 그 구분은
 * `scientificName.js` 의 `canonicalScientificName()` 한 곳에서만 한다.
 *
 *     Stipa tenuissima Trin.           ─┐
 *     Stipa tenuissima                 ─┴→ 같은 canonical → 연결
 *     Spiraea thunbergii 'Mount Fuji'  ─── 다른 canonical → 연결 안 함
 *
 * canonical 은 저장하지 않는다. 파생값이라 원문과 어긋날 수 있고, 규칙을
 * 고칠 때마다 전량 재계산해야 한다. 조회할 때 계산한다.
 *
 * ## SQL 의 `like` 는 후보를 좁히기만 한다
 *
 * canonical 을 DB 가 모르므로 `eq` 로는 걸 수 없다. 속명으로 후보를 받아
 * **판정은 JS 에서 canonical 완전 일치로** 한다. `like` 는 후보 집합을
 * 넓히기만 할 뿐 어느 행이 붙을지 정하지 않는다 — 유사도 매칭이 아니다.
 */

import { toPlantRecord } from "../plantRecord.js";
import {
  normalizeScientificName, canonicalScientificName, canonicalKey, genusOf
} from "../scientificName.js";

export { normalizeScientificName, canonicalScientificName, canonicalKey };

export const SOURCE = "kna";
export const LABEL = "국립수목원 표준식물목록 이미지";

/** 적재 테이블. 컬럼명은 `supabase/2026-09-21_plant_images.sql` 이 정본이다. */
export const TABLE = "plant_images";

/** 조회할 컬럼. `select *` 를 쓰지 않는다 — 스키마가 늘어도 payload 가 안 는다. */
export const COLUMNS = "scientific_name, korean_name, image_type, image_url";

/**
 * Edge Function 이름 — **과거 경로.**
 *
 * 원본이 API 인 줄 알았을 때 설계했다. 실제 원본은 CSV 라서 이 함수는 존재하지
 * 않는다. 계약 검사가 이 모양에 걸려 있어 남겨 두되, 운영 경로는 `ctx.select` 다.
 */
export const FUNCTION_NAME = "plant-image-kna";

/** 두 학명이 원문까지 **완전히** 같은가. 과거 Edge Function 경로가 쓴다. */
export function isExactMatch(a, b) {
  const x = normalizeScientificName(a);
  const y = normalizeScientificName(b);
  return x !== "" && x === y;
}

/**
 * 같은 분류군인가 — **명명자만 무시한다.**
 * 이 함수가 품종 오연결을 막는 유일한 지점이다. 품종명은 canonical 에 남으므로
 * `'Limelight'` 는 원종과 끝내 같아지지 않는다.
 */
export function isSameTaxon(a, b) {
  const x = canonicalKey(a);
  return x !== "" && x === canonicalKey(b);
}

/**
 * `plant_images` 행 1건 → `photosRaw` 항목.
 *
 *   image_url   → url      원본 그대로. 재인코딩하지 않는다.
 *   image_type  → type     원문("꽃"·"잎"). flower/leaf 판정은
 *                          normalizePhotos 가 정확히 일치할 때만 한다.
 *   korean_name → caption  사람이 읽는 이름. 분류 근거로 쓰지 않는다.
 *
 * URL 이 없는 행은 `null` 이다 — 사진 없는 사진 항목은 만들지 않는다.
 */
export function mapTableRow(row) {
  if (!row || typeof row !== "object") return null;
  const url = String(row.image_url ?? "").trim();
  if (!url) return null;
  return {
    url,
    type:    row.image_type ?? null,
    caption: row.korean_name ?? null
  };
}

/**
 * 과거 Edge Function 응답 행 1건 → `photosRaw` 항목.
 * 그쪽은 "이미지 종류"를 캡션으로만 주고 종류 필드가 없었다.
 */
export function mapImageRow(row) {
  if (!row || typeof row !== "object") return null;
  const url = String(row.imgUrl ?? row.imageUrl ?? row.filePath ?? row.imgFilePath ?? "").trim();
  if (!url) return null;
  return {
    url,
    caption: row.imgTypeNm ?? row.imageType ?? row.imgKindNm ?? null,
    type:    null
  };
}

/** 행에서 학명을 읽는다. 테이블 행과 과거 응답 행 둘 다 받는다. */
export function scientificNameOf(row) {
  return normalizeScientificName(
    row?.scientific_name ?? row?.plantSpecsScnm ?? row?.scientificName ?? row?.scnm ?? ""
  );
}

/**
 * Supabase client → `ctx.select`.
 *
 * **속명으로 후보만 받는다.** canonical 을 DB 가 모르기 때문이고, 어느 행이
 * 붙을지는 `findPhotos` 가 canonical 완전 일치로 정한다. 여기서 넓게 받아도
 * 판정이 좁으므로 안전하다 — 반대로 여기서 좁히면 명명자가 붙은 행을
 * 통째로 놓친다.
 *
 * 속명 접두사는 canonical 의 첫 토큰이라 **어떤 명명자 표기에도 살아남는다.**
 * `Acer%` 가 `Aceriphyllum` 까지 데려오지만 판정에서 떨어진다.
 */
export function selectFromSupabase(client, table = TABLE) {
  return async scientificName => {
    const genus = genusOf(scientificName);
    if (!genus) return [];
    const { data, error } = await client.from(table).select(COLUMNS)
      .like("scientific_name", `${genus}%`);
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  };
}

/** 같은 URL 은 한 번만. PK 가 막아 주지만 배치 조회는 그 보장 밖이다. */
function dedupe(photos) {
  const seen = new Set();
  return photos.filter(p => p && p.url && !seen.has(p.url) && seen.add(p.url));
}

/**
 * 학명으로 사진을 찾는다. **절대 throw 하지 않는다.**
 *
 * @param {string} scientificName  완전 일치시킬 학명
 * @param {{select?: (name:string) => Promise<object[]>,
 *          invoke?: (fn:string, body:object) => Promise<object>,
 *          max?: number}} ctx
 *   `select` 가 운영 경로다. `invoke` 는 과거 Edge Function 경로.
 * @returns {Promise<{ok:boolean, photos:object[], matched:boolean, error?:string}>}
 *   `matched` 는 **학명이 일치하는 행을 찾았는가**다. 사진이 0장인 것과
 *   학명이 아예 다른 것은 다른 사실이라 구분해 돌려준다.
 */
export async function findPhotos(scientificName, ctx = {}) {
  const want = normalizeScientificName(scientificName);
  if (!want) return { ok: true, photos: [], matched: false };

  const useSelect = typeof ctx.select === "function";
  if (!useSelect && typeof ctx.invoke !== "function") {
    return { ok: true, photos: [], matched: false };
  }

  let rows, map;
  try {
    if (useSelect) {
      rows = await ctx.select(want);
      map = mapTableRow;
    } else {
      const res = await ctx.invoke(FUNCTION_NAME, { scientificName: want });
      rows = res?.records;
      map = mapImageRow;
    }
  } catch (err) {
    return { ok: false, photos: [], matched: false, error: err?.message || String(err) };
  }

  /**
   * **판정은 여기서만.** 조회가 무엇을 데려오든 canonical 이 같은 행만 남는다.
   * 과거 Edge Function 경로는 원문 완전 일치를 유지한다 — 그쪽 응답에는
   * 명명자가 붙지 않아 canonical 을 적용할 이유가 없고, 계약을 바꾸지 않는다.
   */
  const match = useSelect ? isSameTaxon : isExactMatch;
  const exact = (Array.isArray(rows) ? rows : [])
    .filter(r => match(scientificNameOf(r), want));
  if (!exact.length) return { ok: true, photos: [], matched: false };

  const max = Number.isInteger(ctx.max) && ctx.max > 0 ? ctx.max : 5;
  const photos = dedupe(exact.map(map).filter(Boolean)).slice(0, max);
  return { ok: true, photos, matched: true };
}

/**
 * 후보 레코드에 사진을 붙인다. 못 찾으면 **원본을 그대로 돌려준다** —
 * `photosRaw` 는 `[]` 로 남고 나머지 metadata 는 손대지 않는다.
 */
export async function attachPhotos(record, ctx = {}) {
  const r = toPlantRecord(record);
  const found = await findPhotos(r.scientificName, ctx);
  if (!found.ok || !found.matched || !found.photos.length) return record;
  return { ...record, photosRaw: found.photos };
}
