/**
 * plantRecord — Provider 들이 공통으로 돌려주는 레코드 계약.
 *
 * Provider 가 어떤 API 를 쓰든 앱은 이 모양만 안다. API 를 바꾸거나 추가해도
 * UI 는 그대로다 — 그것이 Provider 구조를 쓰는 이유다.
 *
 * `plantProviders/*` 와 `plantService.js` 가 함께 import 하므로 별도 파일로
 * 둔다(서로 import 하면 순환이 된다).
 */

/** 사진은 최대 5장까지만 보관한다. */
export const MAX_PHOTOS = 5;

/**
 * 한 후보가 담는 필드. 값이 없으면 빈 값이며 **지어내지 않는다**.
 *
 * `source` 는 Provider 코드(kna · nire · gbif)이고 `sourceId` 는 그 DB 안의
 * 식별자다. 둘이 함께 있어야 나중에 어느 DB 의 무엇에서 온 값인지 되짚을 수 있다.
 */
export const PLANT_RECORD_FIELDS = [
  "source", "sourceId",
  "koreanName", "scientificName", "family", "genus",
  "floweringMonths", "fruitingMonths",
  "sunlight", "soil", "plantType", "indoorOutdoor", "nativeStatus",
  "evergreen", "description",
  "imageUrl", "thumbnailUrl", "photoUrls"
];

/** 빈 레코드 — Provider 가 부분만 채울 수 있게 기본값을 준다. */
export function emptyRecord() {
  return {
    source: "", sourceId: "",
    koreanName: "", scientificName: "", family: "", genus: "",
    floweringMonths: [], fruitingMonths: [],
    sunlight: "", soil: "", plantType: "", indoorOutdoor: "", nativeStatus: "",
    evergreen: "", description: "",
    imageUrl: "", thumbnailUrl: "", photoUrls: []
  };
}

const str = v => (v === undefined || v === null ? "" : String(v).trim());
const months = v => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v])
  .map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 12);
const triBool = v => (v === true ? true : v === false ? false : "");

/**
 * Provider 가 만든 부분 레코드를 계약 모양으로 맞춘다.
 * 계약에 없는 키는 버린다 — 응답 필드가 그대로 새어 나가지 않게.
 */
export function toPlantRecord(partial) {
  const r = emptyRecord();
  if (!partial || typeof partial !== "object") return r;
  for (const f of ["source", "sourceId", "koreanName", "scientificName", "family", "genus",
                   "sunlight", "soil", "plantType", "indoorOutdoor", "nativeStatus",
                   "description", "imageUrl", "thumbnailUrl"]) {
    r[f] = str(partial[f]);
  }
  r.floweringMonths = months(partial.floweringMonths);
  r.fruitingMonths  = months(partial.fruitingMonths);
  r.evergreen       = triBool(partial.evergreen);
  r.photoUrls = (Array.isArray(partial.photoUrls) ? partial.photoUrls
                 : partial.photoUrls ? [partial.photoUrls] : [])
    .map(str).filter(Boolean).slice(0, MAX_PHOTOS);
  if (!r.imageUrl && r.photoUrls.length) r.imageUrl = r.photoUrls[0];
  return r;
}

/**
 * PlantRecord → `species.metadata`.
 *
 * metadata 는 외부 DB 스냅샷이므로 받은 값을 **그대로** 옮긴다.
 *
 * @param {object} record
 * @param {string} [syncedAt]  ISO 시각. 테스트에서 고정하려고 인자로 뺐다.
 */
export function toSpeciesMetadata(record, syncedAt = new Date().toISOString()) {
  const r = toPlantRecord(record);
  const linked = Boolean(r.source);
  return {
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
    image_url:     r.imageUrl,
    thumbnail_url: r.thumbnailUrl,
    plant_api_source:    linked ? r.source : "",
    plant_api_id:        linked ? r.sourceId : "",
    plant_api_synced_at: linked ? syncedAt : ""
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
  if (r.floweringMonths.length) patch.bloomMonths = [...r.floweringMonths].sort((a, b) => a - b);
  return patch;
}
