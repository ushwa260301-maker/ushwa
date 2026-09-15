/**
 * plantApi — 국가 식물 DB 조회 서비스 (Ticket S2-002 · 1단계).
 *
 * 역할
 *   식물명/학명으로 외부 DB 를 검색해 **후보 목록**을 돌려주고, 사용자가 고른
 *   후보를 `species.metadata` 모양으로 변환한다. 저장은 하지 않는다 —
 *   호출자(모달)가 기존 저장 경로로 넘긴다.
 *
 * 설계 원칙
 *   · **추측하지 않는다.** 응답 필드명을 코드에 박지 않고 설정
 *     (`plantApiConfig.PLANT_API_FIELD_MAP`)에서 읽는다. 매핑이 비어 있으면
 *     조회 자체를 하지 않고 `notConfigured` 를 돌려준다. 검증된 샘플 없이
 *     파서를 쓰면 원본에 없는 데이터가 Species 에 들어간다.
 *   · **던지지 않는다.** 네트워크·파싱 실패를 결과 객체로 표면화한다.
 *     도감 조회가 실패해도 수종 등록은 계속돼야 한다.
 *   · **정본은 외부에 있다.** 여기서 만든 metadata 는 읽기 전용으로 표시되며
 *     (utils.isMetadataReadOnly), 사용자가 고치지 않는다.
 *
 * 이 모듈은 state · storage · Cloud · OCR 을 모르며 참조하지도 않는다.
 */

import {
  PLANT_API_ENDPOINT, PLANT_API_SERVICE_KEY, PLANT_API_SOURCE_LABEL,
  PLANT_API_RESULT_PATH, PLANT_API_FIELD_MAP, PLANT_API_VALUE_PARSERS,
  PLANT_API_TIMEOUT_MS
} from "./plantApiConfig.js";

/** 사진은 최대 5장까지만 보관한다 (카드 갤러리 상한). */
export const MAX_PHOTOS = 5;

/**
 * 한 후보가 담는 필드. 응답이 무엇을 주든 앱은 이 모양만 안다.
 * 값이 없으면 빈 문자열(또는 빈 배열)이며, 없는 값을 지어내지 않는다.
 */
export const PLANT_RECORD_FIELDS = [
  "apiId",           // 외부 DB 식별자 → metadata.plant_api_id
  "koreanName",      // 국명
  "scientificName",  // 학명 → species.latin
  "bloomMonths",     // number[] 1~12 → species.bloomMonths
  "fruitMonths",     // number[] 1~12 (결실월 · 현재 Species 에 저장 위치 없음)
  "plantType",       // 초본 | 관목 | 교목 → species.category 후보
  "sunlight",        // 양지 | 반양지 | 음지
  "indoorOutdoor",   // 실내 | 실외 | 둘다
  "evergreen",       // 상록 | 낙엽
  "nativeStatus",    // 자생종 | 재배종 | 외래종
  "description",     // 설명
  "photoUrls"        // string[] 최대 MAX_PHOTOS
];

/** 설정이 끝나 실제 조회가 가능한 상태인가. */
export function isPlantApiConfigured() {
  return Boolean(
    String(PLANT_API_ENDPOINT || "").trim() &&
    String(PLANT_API_RESULT_PATH || "").trim() &&
    Object.keys(PLANT_API_FIELD_MAP || {}).length
  );
}

/**
 * 점 표기 경로로 중첩 값을 꺼낸다. 없으면 undefined.
 * @param {object} obj
 * @param {string} path  "response.body.items.item"
 */
export function pluck(obj, path) {
  if (!obj || !path) return undefined;
  return String(path).split(".").reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
}

/**
 * 매핑 한 칸을 해석한다. 값이 배열이면 첫 번째로 값이 잡히는 경로를 쓴다.
 * @param {object} raw     응답 레코드 1건
 * @param {string|string[]} spec  경로 또는 경로 후보들
 */
function resolveField(raw, spec) {
  const paths = Array.isArray(spec) ? spec : [spec];
  for (const p of paths) {
    const v = pluck(raw, p);
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return undefined;
}

/** 배열이 아니어도 배열로 — 응답이 단건일 때 1건 배열로 취급한다. */
export function toArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * 응답 레코드 1건 → PlantRecord.
 *
 * 매핑에 없는 필드는 **빈 값**으로 둔다. 비슷해 보이는 다른 필드로 대신
 * 채우지 않는다 — 그것이 추측이다.
 *
 * @param {object} raw
 * @param {object} [fieldMap]  기본값은 설정의 PLANT_API_FIELD_MAP
 * @param {object} [parsers]   기본값은 설정의 PLANT_API_VALUE_PARSERS
 * @returns {object} PlantRecord
 */
export function toPlantRecord(raw, fieldMap = PLANT_API_FIELD_MAP, parsers = PLANT_API_VALUE_PARSERS) {
  const rec = {};
  for (const f of PLANT_RECORD_FIELDS) {
    const isList = f === "photoUrls" || f === "bloomMonths" || f === "fruitMonths";
    const spec = fieldMap?.[f];
    let value = spec === undefined ? undefined : resolveField(raw, spec);

    const parse = parsers?.[f];
    if (parse) { try { value = parse(value, raw); } catch { value = undefined; } }

    if (isList) {
      let list = toArray(value).filter(x => x !== undefined && x !== null && String(x).trim() !== "");
      if (f === "photoUrls") list = list.map(String).slice(0, MAX_PHOTOS);
      else list = list.map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 12);
      rec[f] = list;
    } else {
      rec[f] = value === undefined || value === null ? "" : String(value).trim();
    }
  }
  return rec;
}

/**
 * PlantRecord → `species.metadata` 에 넣을 조각.
 *
 * 개화월·학명·분류는 metadata 가 아니라 Species 본체 필드이므로 여기 넣지
 * 않는다 (utils.DISPLAY_FIELDS 참조). 호출자가 `toSpeciesPatch()` 로 받는다.
 *
 * @param {object} record
 * @param {string} [syncedAt]  ISO 시각. 테스트에서 고정하려고 인자로 뺐다.
 */
export function toSpeciesMetadata(record, syncedAt = new Date().toISOString()) {
  return {
    sunlight:      record?.sunlight      || "",
    indoorOutdoor: record?.indoorOutdoor || "",
    nativeStatus:  record?.nativeStatus  || "",
    evergreen:     record?.evergreen     || "",
    description:   record?.description   || "",
    plant_api_id:        record?.apiId || "",
    plant_api_source:    record?.apiId ? PLANT_API_SOURCE_LABEL : "",
    plant_api_synced_at: record?.apiId ? syncedAt : ""
  };
}

/**
 * PlantRecord → Species 본체에 덮을 값 + metadata.
 * 값이 빈 필드는 **포함하지 않는다** — 기존 값을 빈 값으로 지우지 않기 위해서다.
 *
 * @param {object} record
 * @param {string} [syncedAt]
 */
export function toSpeciesPatch(record, syncedAt = new Date().toISOString()) {
  const patch = { metadata: toSpeciesMetadata(record, syncedAt) };
  if (record?.scientificName) patch.latin = record.scientificName;
  if (record?.plantType)      patch.category = record.plantType;
  if (record?.bloomMonths?.length) patch.bloomMonths = [...record.bloomMonths].sort((a, b) => a - b);
  if (record?.photoUrls?.length)   patch.photoUrls = [...record.photoUrls].slice(0, MAX_PHOTOS);
  return patch;
}

/**
 * 식물명 또는 학명으로 검색한다.
 *
 * 절대 throw 하지 않는다. 결과는 항상 아래 모양이다:
 *   { ok: true,  candidates: PlantRecord[] }
 *   { ok: false, notConfigured: true }              설정 미완 (매핑 없음 등)
 *   { ok: false, timeout: true,  error }            타임아웃
 *   { ok: false, httpStatus, error }                HTTP 실패
 *   { ok: false, error }                            그 밖의 실패
 *
 * @param {string} query
 * @param {{timeoutMs?:number, fetchImpl?:Function, endpoint?:string,
 *          serviceKey?:string, resultPath?:string, fieldMap?:object,
 *          parsers?:object}} [opts]  테스트에서 주입할 수 있게 열어 둔다.
 */
export async function searchPlants(query, opts = {}) {
  const q = String(query || "").trim();
  if (!q) return { ok: true, candidates: [] };

  const endpoint   = opts.endpoint   ?? PLANT_API_ENDPOINT;
  const serviceKey = opts.serviceKey ?? PLANT_API_SERVICE_KEY;
  const resultPath = opts.resultPath ?? PLANT_API_RESULT_PATH;
  const fieldMap   = opts.fieldMap   ?? PLANT_API_FIELD_MAP;
  const parsers    = opts.parsers    ?? PLANT_API_VALUE_PARSERS;
  const timeoutMs  = opts.timeoutMs  ?? PLANT_API_TIMEOUT_MS;
  const doFetch    = opts.fetchImpl  ?? (typeof fetch === "function" ? fetch : null);

  if (!endpoint || !resultPath || !Object.keys(fieldMap || {}).length) {
    return { ok: false, notConfigured: true,
             error: "국가 식물 DB 연동이 아직 설정되지 않았습니다" };
  }
  if (!doFetch) return { ok: false, error: "이 환경에서는 fetch 를 쓸 수 없습니다" };

  const url = buildUrl(endpoint, q, serviceKey);
  const ctrl = typeof AbortController === "function" ? new AbortController() : null;
  const timer = setTimeout(() => ctrl?.abort(), timeoutMs);

  try {
    const res = await doFetch(url, { signal: ctrl?.signal, headers: { Accept: "application/json" } });
    if (!res.ok) {
      return { ok: false, httpStatus: res.status, error: `조회 실패 (HTTP ${res.status})` };
    }
    const json = await res.json();
    const rows = toArray(pluck(json, resultPath));
    return { ok: true, candidates: rows.map(r => toPlantRecord(r, fieldMap, parsers)) };
  } catch (err) {
    if (err?.name === "AbortError") {
      return { ok: false, timeout: true, error: `조회 시간 초과 (${timeoutMs}ms)` };
    }
    return { ok: false, error: err?.message || String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/** 검색 URL 조립. 키가 비어 있으면(프록시 방식) 붙이지 않는다. */
export function buildUrl(endpoint, query, serviceKey) {
  const sep = endpoint.includes("?") ? "&" : "?";
  let url = `${endpoint}${sep}q=${encodeURIComponent(query)}`;
  if (serviceKey) url += `&serviceKey=${encodeURIComponent(serviceKey)}`;
  return url;
}
