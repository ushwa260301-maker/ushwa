/**
 * plantRecord — Provider 들이 공통으로 돌려주는 레코드 계약.
 *
 * Provider 가 어떤 API 를 쓰든 앱은 이 모양만 안다. API 를 바꾸거나 추가해도
 * UI 는 그대로다 — 그것이 Provider 구조를 쓰는 이유다.
 *
 * 값 정규화(enum · 배열 · 구조 변환)는 `plantNormalizer.js` 가 전담한다.
 * Provider 는 응답 필드를 이름만 바꿔 넘기고, 여기서 계약 모양으로 맞춘다.
 */

import {
  normalizeSunlight, normalizeNativeStatus, normalizeDescription,
  normalizePhotos, normalizeMonths, normalizeEvergreen, normalizeProvider,
  METADATA_SCHEMA_VERSION
} from "./plantNormalizer.js";

/** 사진은 최대 5장까지만 보관한다. */
export const MAX_PHOTOS = 5;

/**
 * 한 후보가 담는 필드. 값이 없으면 빈 값이며 **지어내지 않는다**.
 *
 * `source` 는 Provider 코드(kna · nire · gbif)이고 `sourceId` 는 그 DB 안의
 * 식별자다. 둘이 함께 있어야 어느 DB 의 무엇에서 온 값인지 되짚을 수 있다.
 */
export const PLANT_RECORD_FIELDS = [
  "source", "sourceId", "sourceVersion",
  "koreanName", "scientificName", "family", "genus",
  "floweringMonths", "fruitingMonths",
  "sunlight",        // string[] — SUNLIGHT_ENUM
  "soil", "plantType", "indoorOutdoor",
  "nativeStatus",    // string   — NATIVE_STATUS_ENUM
  "evergreen",       // true | false | ""
  "description",     // { summary, source }
  "photos"           // { url, type, caption }[]
];

/** 빈 레코드 — Provider 가 부분만 채울 수 있게 기본값을 준다. */
export function emptyRecord() {
  return {
    source: "", sourceId: "", sourceVersion: "",
    koreanName: "", scientificName: "", family: "", genus: "",
    floweringMonths: [], fruitingMonths: [],
    sunlight: [], soil: "", plantType: "", indoorOutdoor: "",
    nativeStatus: "", evergreen: "",
    description: { summary: "", source: "" },
    photos: []
  };
}

const str = v => (v === undefined || v === null ? "" : String(v).trim());

/**
 * Provider 가 만든 원본 매핑을 계약 모양으로 정규화한다.
 * 계약에 없는 키는 버린다 — 응답 필드가 그대로 새어 나가지 않게.
 */
export function toPlantRecord(partial) {
  const r = emptyRecord();
  if (!partial || typeof partial !== "object") return r;

  for (const f of ["source", "sourceId", "sourceVersion", "koreanName", "scientificName",
                   "family", "genus", "soil", "plantType", "indoorOutdoor"]) {
    r[f] = str(partial[f]);
  }
  r.floweringMonths = normalizeMonths(partial.floweringMonths);
  r.fruitingMonths  = normalizeMonths(partial.fruitingMonths);
  r.sunlight        = normalizeSunlight(partial.sunlight);
  r.nativeStatus    = normalizeNativeStatus(partial.nativeStatus);
  r.evergreen       = normalizeEvergreen(partial.evergreen);
  r.description     = normalizeDescription(partial.description, partial.descriptionSource);
  // 사진 출처가 없으면 Provider 코드를 쓴다 — 나중에 들어올 사용자 사진과 섞이지 않게.
  r.photos          = normalizePhotos(partial.photos ?? partial.photoUrls, MAX_PHOTOS, r.source);
  return r;
}

/** 대표 사진 — photos 가 source of truth 이고, image_url 은 그 파생값이다. */
export function primaryPhotoUrl(photos) {
  return (photos || []).find(p => p?.url)?.url || "";
}

/**
 * PlantRecord → `species.metadata`.
 * metadata 는 외부 DB 스냅샷이므로 받은 값을 그대로 옮긴다.
 *
 * @param {object} record
 * @param {string} [syncedAt]  ISO 시각. 테스트에서 고정하려고 인자로 뺐다.
 */
export function toSpeciesMetadata(record, syncedAt = new Date().toISOString()) {
  const r = toPlantRecord(record);
  const linked = Boolean(r.source);
  const primary = primaryPhotoUrl(r.photos);
  const provider = normalizeProvider(linked
    ? { name: r.source, record_id: r.sourceId, synced_at: syncedAt, version: r.sourceVersion }
    : null);
  return {
    schema_version: METADATA_SCHEMA_VERSION,
    provider,
    scientific_name: r.scientificName,
    family:          r.family,
    genus:           r.genus,
    flowering_months: r.floweringMonths,
    fruiting_months:  r.fruitingMonths,
    sunlight:      r.sunlight,
    soil:          r.soil,
    plant_type:    r.plantType,
    indoorOutdoor: r.indoorOutdoor,
    nativeStatus:  r.nativeStatus,
    evergreen:     r.evergreen,
    description:   r.description,
    photos:        r.photos,
    // photos 에서 파생 — 기존 카드/외부 참조 호환을 위해 남긴다.
    image_url:     primary,
    thumbnail_url: primary,
    // provider 가 정본이고 아래 셋은 그 파생이다 — Ticket #002 부터 쓰이는
    // 이름이라 읽는 쪽을 한 번에 바꾸지 않고 남겨 둔다.
    plant_api_source:    provider.name,
    plant_api_id:        provider.record_id,
    plant_api_synced_at: provider.synced_at
  };
}

/**
 * PlantRecord → Species 본체에 덮을 값 + metadata.
 * **빈 필드는 아예 넣지 않는다** — 기존 학명·분류·개화월을 빈 값으로 지우지
 * 않기 위해서다.
 */
export function toSpeciesPatch(record, syncedAt = new Date().toISOString()) {
  const r = toPlantRecord(record);
  const patch = { metadata: toSpeciesMetadata(r, syncedAt) };
  if (r.scientificName) patch.latin = r.scientificName;
  if (r.plantType)      patch.category = r.plantType;
  if (r.floweringMonths.length) patch.bloomMonths = [...r.floweringMonths];
  return patch;
}
