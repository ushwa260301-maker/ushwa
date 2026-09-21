/**
 * plantRecord — Provider 들이 공통으로 돌려주는 레코드 계약. **PlantRecord v1.0**
 *
 * Provider 가 어떤 API 를 쓰든 앱은 이 모양만 안다. API 를 바꾸거나 추가해도
 * UI 는 그대로다 — 그것이 Provider 구조를 쓰는 이유다.
 *
 * ## `*Raw` 가 이름에 붙어 있는 이유
 *
 * PlantRecord 는 **출처가 말한 그대로**를 나르는 그릇이다. `"6~8월"` 은
 * `"6~8월"` 로, `"반그늘"` 은 `"반그늘"` 로, HTML 이 섞인 설명은 HTML 째로
 * 들어온다. 이름에 Raw 가 붙어 있으면 Provider 를 새로 쓰는 사람이 "여기서
 * 변환하면 안 되는구나" 를 타입만 보고 안다 — 규칙을 주석에 적어 두는 것보다
 * 이름에 박아 두는 편이 지켜진다.
 *
 * 변환은 전부 `plantNormalizer.js` 가, 그리고 딱 한 지점에서 일어난다:
 *
 *     Provider.mapRow   응답 필드 → PlantRecord   (이름만 바꾼다)
 *     toPlantRecord     모양 맞추기               (다듬기만 한다)
 *     toSpeciesMetadata Raw → metadata            (여기서 정규화한다)
 *
 * Provider 마다 변환을 복사하면 출처별로 같은 값이 미묘하게 달라진다.
 *
 * ## 빈 값은 `null` 이다
 *
 * `""` 가 아니라 `null` 을 쓴다. "출처가 빈 문자열을 줬다" 와 "출처가 이 필드를
 * 주지 않았다" 는 다른 사실이고, 뒤에서 그 둘을 구분해야 한다 —
 * 원본에 없는 값을 만들지 않기 위해서다.
 */

import {
  normalizeSunlight, normalizeNativeStatus, normalizeDescription,
  normalizePhotos, normalizeMonths, normalizeEvergreen, normalizeProvider
} from "./plantNormalizer.js";
import { CURRENT_SCHEMA_VERSION } from "./metadataMigration.js";
import { mergeMetadata } from "./metadataMerge.js";

/** 사진은 최대 5장까지만 보관한다. */
export const MAX_PHOTOS = 5;

/**
 * 한 후보가 담는 필드. 값이 없으면 `null` 이며 **지어내지 않는다**.
 *
 * `provider.name` 은 Provider 코드(kna · nire · gbif), `provider.recordId` 는
 * 그 DB 안의 식별자, `provider.version` 은 그 DB 의 판이다. 셋이 함께 있어야
 * 어느 DB 의 무엇이 언제 판으로 온 값인지 되짚을 수 있고, `version` 이 있어야
 * 나중에 STALE 을 계산할 수 있다.
 */
export const PLANT_RECORD_FIELDS = [
  "koreanName", "scientificName", "family", "genus",
  // 국가표준식물목록은 과·속을 국명과 학명 두 벌로 준다. 한쪽을 버리면
  // 되살릴 수 없으므로 둘 다 나른다 — `family`·`genus` 는 학명 쪽 별칭이다.
  "familyNameKo", "familyNameLatin",
  "genusNameKo", "genusNameLatin",
  "classification",                            // "속씨식물" 같은 분류 체계 표기
  /**
   * 학명 지위 — `"정명"` · `"이명"` 원문.
   *
   * 이 값이 자동 채택을 가른다. 이명(synonym)은 같은 식물을 가리키는 옛
   * 이름이라 **후보로는 유효하지만 정본이 아니다.** 이명을 그대로 채워 넣으면
   * 그 뒤의 모든 갱신이 폐기된 이름을 따라간다.
   */
  "scientificNameStatus",
  "sourceUpdatedAt",                           // 출처가 이 행을 마지막으로 고친 때
  /**
   * 도감 서술 (plantPilbkInfo). 전부 **자연어 문장**이다 — enum 도 배열도 아니다.
   * 개화기가 `formRaw` 안에 섞여 오지만 문장에서 월을 뽑는 것은 추론이라
   * 하지 않는다. 원문을 그대로 보관해 사람이 읽게 한다.
   */
  "formRaw",                                   // shpe — 형태
  "distributionRaw",                           // dstrb — 분포
  "originRaw",                                 // orplcNm — 원산지
  "propagationRaw",                            // brdMthdDesc — 번식 방법
  "cultivationRaw",                            // farmSpftDesc — 재배 특성
  "growthEnvironmentRaw",                      // grwEvrntDesc — 생육 환경
  "notRecommendedNameRaw",                     // notRcmmGnrlNm — 비추천 국명
  "sourceNoteRaw",                             // note — 출처 비고
  "floweringMonthsRaw", "fruitingMonthsRaw",   // "6~8월" 같은 원문
  "sunlightRaw",                               // "양지/반음지" 원문
  "nativeStatusRaw",                           // "자생" 원문
  "plantTypeRaw", "evergreenRaw",              // "낙엽활엽관목" 원문
  "descriptionRaw",                            // HTML 이어도 그대로
  "photosRaw",                                 // { url, caption, type }[]
  "provider"                                   // { name, recordId, version }
];

/** 자동 채택되는 학명 지위. 이 값이 아니면 정본으로 쓰지 않는다. */
export const ACCEPTED_NAME_STATUS = "정명";

/** 빈 레코드 — Provider 가 부분만 채울 수 있게 기본값을 준다. */
export function emptyRecord() {
  return {
    koreanName: null, scientificName: null, family: null, genus: null,
    familyNameKo: null, familyNameLatin: null,
    genusNameKo: null, genusNameLatin: null,
    classification: null, scientificNameStatus: null, sourceUpdatedAt: null,
    formRaw: null, distributionRaw: null, originRaw: null,
    propagationRaw: null, cultivationRaw: null, growthEnvironmentRaw: null,
    notRecommendedNameRaw: null, sourceNoteRaw: null,
    floweringMonthsRaw: null, fruitingMonthsRaw: null,
    sunlightRaw: null, nativeStatusRaw: null,
    plantTypeRaw: null, evergreenRaw: null,
    descriptionRaw: null,
    photosRaw: [],
    provider: { name: "", recordId: "", version: "" }
  };
}

/** 원문 문자열 필드 — 다듬기만 하고 내용은 건드리지 않는다. */
const RAW_TEXT_FIELDS = [
  "koreanName", "scientificName", "family", "genus",
  "familyNameKo", "familyNameLatin", "genusNameKo", "genusNameLatin",
  "classification", "scientificNameStatus", "sourceUpdatedAt",
  "formRaw", "distributionRaw", "originRaw", "propagationRaw",
  "cultivationRaw", "growthEnvironmentRaw", "notRecommendedNameRaw", "sourceNoteRaw",
  "floweringMonthsRaw", "fruitingMonthsRaw",
  "sunlightRaw", "nativeStatusRaw",
  "plantTypeRaw", "evergreenRaw", "descriptionRaw"
];

/** 빈 값은 `null`. 공백만 있는 응답도 "없음"으로 본다. */
function rawText(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

const str = v => (v === undefined || v === null ? "" : String(v).trim());

/**
 * 사진 원본. **타입을 추측하지 않는다** — 출처가 말하지 않으면 `null` 이다.
 * flower · leaf · habit · fruit 판정은 normalizePhotos 가 한다.
 */
function rawPhotos(raw) {
  const list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const obj = item && typeof item === "object" ? item : { url: item };
    const url = str(obj.url || obj.src);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, caption: rawText(obj.caption), type: rawText(obj.type) });
    if (out.length >= MAX_PHOTOS) break;
  }
  return out;
}

/**
 * Provider 가 만든 원본 매핑을 계약 모양으로 맞춘다.
 * 계약에 없는 키는 버린다 — 응답 필드가 그대로 새어 나가지 않게.
 *
 * **값을 변환하지 않는다.** 여기서 하는 일은 다듬기(trim)와 모양 맞추기뿐이다.
 */
export function toPlantRecord(partial) {
  const r = emptyRecord();
  if (!partial || typeof partial !== "object") return r;

  for (const f of RAW_TEXT_FIELDS) r[f] = rawText(partial[f]);
  r.photosRaw = rawPhotos(partial.photosRaw);
  r.provider = {
    name:     str(partial.provider?.name).toLowerCase(),
    recordId: str(partial.provider?.recordId),
    version:  str(partial.provider?.version)
  };
  return r;
}

/** 대표 사진 — photos 가 source of truth 이고, image_url 은 그 파생값이다. */
export function primaryPhotoUrl(photos) {
  return (photos || []).find(p => p?.url)?.url || "";
}

/**
 * PlantRecord → `species.metadata`. **정규화가 일어나는 유일한 지점이다.**
 *
 * metadata 는 외부 DB 스냅샷이므로 받은 값을 옮기되, 여기서 enum · 월 배열 ·
 * 설명 구조로 바꾼다. 출처가 주지 않은 필드는 빈 값으로 남는다 — 채우지 않는다.
 *
 * ⚠ 이 결과는 **출처가 아는 것만 담은 조각**이다. `soil` · `indoorOutdoor` ·
 *   `description.note` 는 PlantRecord v1.0 계약에 없어 항상 빈 값으로 나온다.
 *   그래서 이것으로 기존 metadata 를 덮으면 사용자 입력이 지워진다 —
 *   기존 Species 에 반영할 때는 반드시 `toSpeciesPatch()` 를 쓴다(병합).
 *
 * @param {object} record
 * @param {string} [syncedAt]  ISO 시각. 테스트에서 고정하려고 인자로 뺐다.
 */
export function toSpeciesMetadata(record, syncedAt = new Date().toISOString()) {
  const r = toPlantRecord(record);
  const linked = Boolean(r.provider.name);
  const photos = normalizePhotos(r.photosRaw, MAX_PHOTOS, r.provider.name);
  const primary = primaryPhotoUrl(photos);
  const provider = normalizeProvider(linked
    ? { name: r.provider.name, record_id: r.provider.recordId,
        synced_at: syncedAt, version: r.provider.version }
    : null);
  return {
    schema_version: CURRENT_SCHEMA_VERSION,
    // Provider 가 준 값이면 SYNCED. 사람이 고치면 modal 이 USER_EDITED 로 바꾼다.
    sync_status: linked ? "SYNCED" : "PENDING",
    provider,
    scientific_name: r.scientificName || "",
    // `family`·`genus` 는 **학명**이 정본이다(Hydrangeaceae). 국명은 따로 둔다 —
    // 한 칸에 섞으면 어느 쪽이 들어 있는지 읽는 쪽이 알 수 없다.
    family:          r.family || r.familyNameLatin || "",
    family_ko:       r.familyNameKo || "",
    genus:           r.genus  || r.genusNameLatin  || "",
    flowering_months: normalizeMonths(r.floweringMonthsRaw),
    fruiting_months:  normalizeMonths(r.fruitingMonthsRaw),
    sunlight:      normalizeSunlight(r.sunlightRaw),
    plant_type:    r.plantTypeRaw || "",
    nativeStatus:  normalizeNativeStatus(r.nativeStatusRaw),
    evergreen:     normalizeEvergreen(r.evergreenRaw),
    description:   normalizeDescription(r.descriptionRaw, providerLabelFor(r.provider.name)),
    photos,
    /**
     * 도감 원문 블록. 출처가 준 **자연어 서술**을 구조화하지 않고 그대로 담는다.
     * enum·월 배열로 바꾸려면 문장을 해석해야 하고 그건 추론이다.
     * 값이 없으면 빈 문자열 — 키는 항상 있어 읽는 쪽이 분기하지 않는다.
     */
    guide: {
      form:              r.formRaw || "",
      distribution:      r.distributionRaw || "",
      origin:            r.originRaw || "",
      propagation:       r.propagationRaw || "",
      cultivation:       r.cultivationRaw || "",
      growthEnvironment: r.growthEnvironmentRaw || "",
      notRecommendedName: r.notRecommendedNameRaw || "",
      sourceNote:        r.sourceNoteRaw || ""
    },
    // 출처가 주지 않는 값 — 사람이 입력한다. 여기서는 비워 둔다.
    soil: "",
    indoorOutdoor: "",
    // photos 에서 파생 — 기존 카드/외부 참조 호환을 위해 남긴다.
    image_url:     primary,
    thumbnail_url: primary,
    // provider 가 정본이고 아래 셋은 그 파생이다 — Ticket #002 부터 쓰이는
    // 이름이라 읽는 쪽을 한 번에 바꾸지 않고 남겨 둔다.
    plant_api_source:    provider.name,
    plant_api_id:        provider.record_id,
    plant_api_synced_at: provider.synced_at,
    /**
     * 출처 DB 안의 식별자. `provider.record_id` 와 같은 값이며, 읽는 쪽이
     * provider 구조를 몰라도 되게 평평한 이름으로도 둔다
     * (plant_api_* 와 같은 이유).
     */
    source_id: provider.record_id
  };
}

/** 설명 출처 표기. Provider 코드만 알고 라벨을 모르면 코드를 그대로 쓴다. */
const PROVIDER_LABELS = { kna: "국립수목원", nire: "국립생물자원관", gbif: "GBIF" };
function providerLabelFor(code) {
  return PROVIDER_LABELS[code] || code || "";
}

/**
 * 기존 Species 위에 출처 결과를 얹을 patch 를 만든다. **Merge Patch 다.**
 *
 * metadata 는 교체하지 않고 병합한다 — 출처가 모르는 필드(토양 · 실내외 ·
 * 사용자 메모 · 사용자가 올린 사진)를 동기화가 지우지 않게 하기 위해서다.
 * 규칙은 metadataMerge 가 갖는다.
 *
 * Species 본체에서
 *   latin        출처가 정본이다 — 학명은 객관적 사실이고 국가 DB 가 맞다.
 *   bloomMonths  출처가 정본이다 — 개화월의 정본은 국가 식물 DB 라고 정했다.
 *   category     **사람이 정한 값을 덮지 않는다.** 화면 분류·필터를 움직이는
 *                값이라, 이미 정해 둔 분류가 있으면 그대로 두고 비어 있을
 *                때만 채운다. [확인 필요] 출처 값으로 항상 덮기를 원하면
 *                아래 조건 한 줄만 바꾸면 된다.
 *
 * @param {object|null} existing  기존 Species 레코드(또는 그 metadata). 없으면 null
 * @param {object} incoming       Provider 가 준 PlantRecord
 * @param {string} [syncedAt]     ISO 시각. 테스트에서 고정하려고 인자로 뺐다.
 */
export function toSpeciesPatch(existing, incoming, syncedAt = new Date().toISOString()) {
  const prev = existing && typeof existing === "object" ? existing : {};
  // Species 를 받아도, metadata 만 받아도 동작한다.
  const prevMeta = "metadata" in prev ? prev.metadata : prev;

  const metadata = mergeMetadata(prevMeta, toSpeciesMetadata(incoming, syncedAt), MAX_PHOTOS);
  const patch = { metadata };

  if (metadata.scientific_name) patch.latin = metadata.scientific_name;
  if (metadata.flowering_months.length) patch.bloomMonths = [...metadata.flowering_months];
  if (metadata.plant_type && !String(prev.category || "").trim()) {
    patch.category = metadata.plant_type;
  }
  return patch;
}
