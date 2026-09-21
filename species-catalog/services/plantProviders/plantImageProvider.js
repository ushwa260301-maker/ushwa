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
 * SQL 도 `eq` 만 쓴다 — `like` · `ilike` · `contains` 를 쓰지 않는다.
 * 못 찾으면 `[]` 를 돌려주고 metadata 의 나머지는 그대로 둔다.
 *
 * ## 공백 정리는 일치 판정의 일부다
 *
 * 앞뒤 공백과 연속 공백만 정리한다. 대소문자·명명자 표기는 건드리지 않는다 —
 * 학명에서 그것들은 의미가 있다(`Ser.` 와 `ser.` 는 다르다). 적재 쪽
 * (`tests/import-plant-images.mjs`)도 같은 규칙으로 정규화해 넣는다.
 * 두 규칙이 어긋나면 `eq` 가 조용히 0건이 된다.
 */

import { toPlantRecord } from "../plantRecord.js";

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

/**
 * 학명 비교용 정규화 — **공백만** 정리한다.
 *
 * 대소문자를 내리거나 명명자를 떼면 다른 분류군이 같아 보인다.
 * 그건 일치가 아니라 추측이다.
 */
export function normalizeScientificName(name) {
  return String(name ?? "").trim().replace(/\s+/g, " ");
}

/** 두 학명이 **완전히** 같은가. 이 함수가 품종 오연결을 막는 유일한 지점이다. */
export function isExactMatch(a, b) {
  const x = normalizeScientificName(a);
  const y = normalizeScientificName(b);
  return x !== "" && x === y;
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
 * `eq` 하나뿐이다. 이 줄이 "완전 일치만" 을 SQL 레벨에서 보증한다 —
 * 여기에 `like` 가 들어오면 위의 모든 방어가 무의미해진다.
 */
export function selectFromSupabase(client, table = TABLE) {
  return async scientificName => {
    const { data, error } = await client.from(table).select(COLUMNS)
      .eq("scientific_name", scientificName);
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

  // eq 로 걸러 오지만 응답을 그대로 믿지 않는다 — 여기서 **완전 일치만** 남긴다.
  const exact = (Array.isArray(rows) ? rows : [])
    .filter(r => isExactMatch(scientificNameOf(r), want));
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
