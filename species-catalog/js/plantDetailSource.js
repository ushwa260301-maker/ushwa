/**
 * plantDetailSource — Species Detail 이 읽는 Cloud 기준정보 (Repository 계층).
 *
 * 설계 근거: T12-1 UI-1 / UI-3
 *
 * ## 무엇을 읽는가
 *
 *     plant_taxa    과 · 속 · 생육형 · 광조건 · 개화월 · 동기화 시각   (T12-2 가 적재)
 *     plant_images  대표 이미지 URL · 출처                            (T11-6.3 적재 완료)
 *
 * 두 테이블을 잇는 고리는 **학명 문자열**이다 — 공통 ID 가 없다.
 *
 * ## 왜 별도 모듈인가
 *
 * `plantGuideModal` 은 화면이고, 화면이 Supabase 를 알면 네트워크 없이는
 * 검사할 수 없다. 조회자를 주입받는 구조는 `plantImageProvider` 가 쓰는
 * 방식과 같다 — 이 파일도 client 를 **인자로** 받는다.
 *
 * ## 실패는 화면을 막지 않는다
 *
 * `plant_taxa` 는 T12-2 가 만들기 전까지 **존재하지 않는다.** 없는 테이블을
 * 조회하면 PostgREST 가 오류를 준다. 그 오류로 상세 화면 전체를 막으면,
 * 정적 도감이 이미 가진 광조건·개화월까지 함께 사라진다. 그래서 각 조회는
 * 독립적으로 실패하고 `null` 을 돌려준다 — 있는 것만 채운다.
 *
 * ## 완전 일치만 연결한다
 *
 * 학명 canonical 이 정확히 같을 때만 붙인다. 느슨하게 맞추면 품종이 원종
 * 사진을 달게 된다 — 그 판단 근거는 `plantImageProvider.js` 머리말에 있다.
 * 여기서도 같은 규칙을 쓰고, 규칙 자체는 `scientificName.js` 한 곳에만 둔다.
 */

import { canonicalKey, genusOf } from "../services/scientificName.js";

/** 컬럼명 정본: `supabase/2026-09-21_plant_images.sql` */
export const IMAGE_TABLE = "plant_images";
export const IMAGE_COLUMNS = "scientific_name, korean_name, image_type, image_url, source";

/**
 * 컬럼명 정본: `supabase/2026-09-23_plant_taxa.sql`
 *
 * `source` 가 **없다.** 이 표의 모든 행이 KNA 에서 오므로 컬럼을 두지 않았다
 * (T12-2 범위 축소). 그래서 화면의 출처는 `plant_images.source` 가 말한다 —
 * 없는 컬럼을 select 하면 PostgREST 가 조회를 통째로 거절한다.
 */
export const TAXA_TABLE = "plant_taxa";
export const TAXA_COLUMNS =
  "scientific_name, korean_name, family, genus, growth_form, sunlight, flowering_months, synced_at";

/**
 * 적재 코드 → 화면에 쓰는 이름 (T12-1.4).
 *
 * DB 에는 `KNA_IMAGE_CSV` 처럼 **어느 적재에서 왔는지**가 들어 있다. 그 코드는
 * 출처를 되짚을 때 필요하지만 사용자에게는 뜻이 통하지 않는다. 화면에서만
 * 바꿔 적고 **DB 값은 그대로 둔다** — 라벨을 저장하면 표기를 고칠 때마다
 * 전량 갱신해야 하고, 원본이 무엇이었는지도 잃는다.
 */
export const SOURCE_LABELS = {
  KNA_IMAGE_CSV: "국립수목원 표준식물목록",
  KNA_TAXA:      "국립수목원 표준식물목록",
  KNA:           "국립수목원 표준식물목록",
  kna:           "국립수목원 표준식물목록"
};

/**
 * 모르는 코드는 **그대로 보여 준다.** 아무 출처나 "국립수목원"이라고 적으면
 * 화면이 거짓말을 한다 — 출처는 사용자가 값을 검증하는 유일한 단서다.
 */
export function sourceLabel(code) {
  const s = String(code ?? "").trim();
  if (s === "") return "";
  return SOURCE_LABELS[s] || s;
}

/** 테이블이 아직 없을 때 PostgREST 가 주는 코드. 이건 장애가 아니라 "미적재" 다. */
const MISSING_TABLE = new Set(["42P01", "PGRST205", "PGRST204"]);

function isMissingTable(error) {
  return !!error && MISSING_TABLE.has(String(error.code || ""));
}

/**
 * 속명으로 후보를 받아 canonical 완전 일치로 고른다.
 *
 * `like 'Genus%'` 는 **후보를 좁히기만 한다** — 어느 행이 붙을지는 JS 의
 * canonical 비교가 정한다. 유사도 매칭이 아니다.
 */
async function selectByGenus(client, table, columns, scientificName) {
  const genus = genusOf(scientificName);
  if (!client || !genus) return [];

  const { data, error } = await client
    .from(table).select(columns).like("scientific_name", `${genus}%`);

  if (error) {
    if (isMissingTable(error)) {
      console.info(`[detail] ${table} 미적재 — 건너뜀`);
      return [];
    }
    console.warn(`[detail] ${table} 조회 실패:`, error.message || error);
    return [];
  }
  return Array.isArray(data) ? data : [];
}

function sameTaxon(a, b) {
  const x = canonicalKey(a);
  return x !== "" && x === canonicalKey(b);
}

/**
 * 대표 이미지 한 장을 고른다.
 *
 * [확인 필요] `plant_images` 에는 아직 `is_primary` 가 없다
 * (`2026-09-21_plant_images.sql` 의 TODO(T12)). 그래서 "대표"를 데이터가
 * 정해 주지 못한다. 임의로 고르면 조회할 때마다 다른 사진이 뜨므로,
 * **결정적 순서**(종류 → URL)로 정렬해 첫 장을 쓴다. 규칙이 아니라 임시
 * 안정화이며, `is_primary` 가 생기면 그것이 정본이 된다.
 */
export function pickPrimaryImage(rows) {
  const list = (rows || []).filter(r => String(r?.image_url || "").trim() !== "");
  if (!list.length) return null;
  const sorted = list.slice().sort((a, b) =>
    String(a.image_type || "").localeCompare(String(b.image_type || "")) ||
    String(a.image_url).localeCompare(String(b.image_url)));
  return sorted[0];
}

/**
 * 학명 하나에 대한 Cloud 기준정보를 모은다.
 *
 * 두 조회는 서로를 기다릴 이유가 없어 **동시에** 보낸다. 한쪽이 실패해도
 * 다른 쪽은 그대로 온다.
 *
 * @param {object|null} client  Supabase client (없으면 조회하지 않는다)
 * @param {string} scientificName
 * @returns {Promise<{taxa:object|null, image:object|null}>}
 */
export async function fetchDetail(client, scientificName) {
  const name = String(scientificName ?? "").trim();
  if (!client || !name) return { taxa: null, image: null };

  const [taxaRows, imageRows] = await Promise.all([
    selectByGenus(client, TAXA_TABLE, TAXA_COLUMNS, name),
    selectByGenus(client, IMAGE_TABLE, IMAGE_COLUMNS, name)
  ]);

  return {
    taxa:  taxaRows.find(r => sameTaxon(r.scientific_name, name)) || null,
    image: pickPrimaryImage(imageRows.filter(r => sameTaxon(r.scientific_name, name)))
  };
}

/**
 * 도감 원본 + Cloud 조회 결과를 **한 레코드**로 합친다.
 *
 * 화면은 출처가 몇 개인지 알 필요가 없다. 우선순위는 하나다 —
 * **기준정보(plant_taxa)가 정적 도감보다 앞선다.** 정적 도감은 책을 옮겨
 * 적은 것이고, `plant_taxa` 는 국립수목원이 관리하는 기준이다.
 *
 * 없는 값은 지어내지 않는다 — 빈 문자열로 남기고 화면이 "—" 로 보여 준다.
 */
export function mergeDetail(guide, cloud) {
  const g = guide || {};
  const taxa = cloud?.taxa || null;
  const image = cloud?.image || null;

  const merged = { ...g };

  if (taxa) {
    if (taxa.family)           merged.family = taxa.family;
    if (taxa.genus)            merged.genus = taxa.genus;
    if (taxa.growth_form)      merged.growth_form = taxa.growth_form;
    if (taxa.sunlight)         merged.sunlight = taxa.sunlight;
    if (taxa.flowering_months != null) merged.flowering_months = taxa.flowering_months;
    if (taxa.synced_at)        merged.synced_at = taxa.synced_at;
  }

  if (image) {
    if (image.image_url) merged.image_url = image.image_url;
  }

  // 국명은 도감에 있으면 그것을 쓴다. 없을 때만(=URL 로 학명만 받아 연 경우)
  // 기준정보가 채운다.
  if (!String(merged.name ?? "").trim()) {
    merged.name = taxa?.korean_name || image?.korean_name || "";
  }
  if (!String(merged.scientific_name ?? "").trim()) {
    merged.scientific_name = taxa?.scientific_name || "";
  }

  // 출처는 **값이 실제로 온 쪽**을 적는다. 아무 값도 안 왔는데 "국립수목원"
  // 이라고 적으면 화면이 거짓말을 한다.
  // 코드 그대로 넘긴다 — 사람이 읽는 이름으로 바꾸는 것은 화면의 일이다.
  const source = taxa?.source || image?.source || "";
  if (source) merged.source = source;

  return merged;
}

/**
 * 국명 → 학명 (T12-1.2).
 *
 * 학명은 두 테이블을 잇는 열쇠라, URL 에 국명이 오면 먼저 학명으로 바꿔야
 * 한다. **검색이 아니다** — 정확히 같은 국명만 본다. 부분일치·유사도로
 * 넓히면 엉뚱한 식물의 상세가 열린다. 검색은 T12-4 다.
 *
 * `plant_taxa` 를 먼저 보고, 없으면 `plant_images` 로 내려간다.
 */
export async function resolveScientificName(client, koreanName) {
  const name = String(koreanName ?? "").trim();
  if (!client || !name) return "";

  for (const [table, columns] of [[TAXA_TABLE, TAXA_COLUMNS], [IMAGE_TABLE, IMAGE_COLUMNS]]) {
    const { data, error } = await client
      .from(table).select(columns).eq("korean_name", name).limit(1);

    if (error) {
      if (!isMissingTable(error)) console.warn(`[detail] ${table} 국명 조회 실패:`, error.message || error);
      continue;
    }
    const hit = (data || [])[0];
    if (hit?.scientific_name) return hit.scientific_name;
  }
  return "";
}
