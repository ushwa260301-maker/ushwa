/**
 * plantNormalizer — Provider 원본 매핑 → PlantRecord 정규화 전담.
 *
 * 역할 분리 (T10.1)
 *   Provider   응답 필드를 이름만 바꿔 넘긴다. 값은 원문 그대로다.
 *   Normalizer 그 값을 앱의 enum · 배열 · 구조로 바꾼다.
 *
 * 이렇게 나눠 두면 Provider 가 늘어도 정규화 규칙은 한 곳에서만 바뀐다.
 * 반대로 규칙을 Provider 마다 복사하면 출처별로 값이 미묘하게 달라진다.
 *
 * 모르는 값은 **버린다.** 비슷해 보이는 enum 으로 밀어 넣지 않는다 —
 * 그것이 원본에 없는 데이터를 만드는 길이다.
 *
 * ⚠ **이 파일의 모든 함수는 순수 함수다.**
 *   fetch · localStorage · Date · Math.random · console 을 쓰지 않는다.
 *   같은 입력이면 언제 어디서 불러도 같은 출력이 나와야 한다 — 시각이 필요한
 *   값(synced_at)은 호출자가 인자로 넘긴다. 테스트가 쉬워지는 것은 결과일 뿐,
 *   이유는 정규화 결과가 실행 시점에 따라 달라지면 안 되기 때문이다.
 *   (tests/plant-service.mjs 의 "순수 함수" 절이 이를 고정한다)
 */

/** 사진 출처. 외부 DB 와 사용자 업로드가 섞이지 않게 한다. */
export const PHOTO_SOURCES = ["kna", "nire", "gbif", "user"];

/** 광 조건 enum. 앱 전체가 이 코드만 쓴다. 한글은 표시할 때만 붙인다. */
export const SUNLIGHT_ENUM = ["full_sun", "partial_sun", "partial_shade", "shade"];

/** 자생 구분 enum. */
export const NATIVE_STATUS_ENUM = ["native", "naturalized", "introduced", "cultivar"];

/**
 * 상록성 enum (schema v2).
 *
 * 불리언이던 것을 enum 으로 바꾼 이유는 **반상록**이다. 한국 조경에서 흔한데
 * true/false 로는 표현할 수 없었고, 모르는 경우와 낙엽인 경우도 구분되지 않았다.
 */
export const EVERGREEN_ENUM = ["EVERGREEN", "DECIDUOUS", "SEMI_EVERGREEN", "UNKNOWN"];

/**
 * metadata 상태 enum (schema v2).
 *
 *   PENDING      아직 아무 정보가 없다
 *   SYNCED       외부 DB 에서 받아왔다
 *   USER_EDITED  사람이 직접 입력·수정했다
 *   STALE        출처에 더 새 판이 있다 — **저장하지 않고 화면에서 계산한다**
 *
 * STALE 을 저장하지 않는 이유: 최신 판이 나오는 시점은 우리가 모른다. 저장해
 * 두면 그 값 자체가 낡아서, "STALE 이라고 저장돼 있지만 이미 최신"인 상태가
 * 생긴다. 저장은 PENDING · SYNCED · USER_EDITED 셋만 한다.
 */
export const SYNC_STATUS_ENUM = ["PENDING", "SYNCED", "USER_EDITED", "STALE"];
export const STORED_SYNC_STATUS = ["PENDING", "SYNCED", "USER_EDITED"];

/** 사진 종류. 모르면 "habit"(수형)으로 두지 않고 빈 값으로 둔다. */
export const PHOTO_TYPES = ["flower", "leaf", "habit", "fruit"];

/** 한글 표기 → enum. 구버전 데이터와 한국어 응답을 함께 받는다. */
const SUNLIGHT_ALIASES = {
  "양지": "full_sun", "전일조": "full_sun", "햇빛": "full_sun",
  "반양지": "partial_sun",
  "반음지": "partial_shade", "반그늘": "partial_shade",
  "음지": "shade", "그늘": "shade",
  "full sun": "full_sun", "partial sun": "partial_sun",
  "partial shade": "partial_shade"
};

const NATIVE_ALIASES = {
  "자생종": "native", "자생": "native",
  "귀화종": "naturalized", "귀화": "naturalized",
  "외래종": "introduced", "외래": "introduced", "도입종": "introduced",
  "재배종": "cultivar", "재배품종": "cultivar", "원예품종": "cultivar"
};

const PHOTO_TYPE_ALIASES = {
  "꽃": "flower", "화": "flower", "flower": "flower",
  "잎": "leaf", "엽": "leaf", "leaf": "leaf",
  "수형": "habit", "전체": "habit", "habit": "habit",
  "열매": "fruit", "과실": "fruit", "결실": "fruit", "fruit": "fruit"
};

const clean = v => (v === undefined || v === null ? "" : String(v).trim());

/** 목록이 아니어도 목록으로. 구분자(, / ·)로 붙어 온 문자열도 쪼갠다. */
function toList(v) {
  if (v == null || v === "") return [];
  if (Array.isArray(v)) return v;
  return String(v).split(/[,/·|]/);
}

/**
 * 광 조건 → enum 배열. 중복을 없애고 enum 순서로 정렬한다.
 * 모르는 값은 버린다.
 * @param {*} raw
 * @returns {string[]}
 */
export function normalizeSunlight(raw) {
  const out = new Set();
  for (const part of toList(raw)) {
    const key = clean(part).toLowerCase();
    if (!key) continue;
    if (SUNLIGHT_ENUM.includes(key)) { out.add(key); continue; }
    const alias = SUNLIGHT_ALIASES[clean(part)] || SUNLIGHT_ALIASES[key];
    if (alias) out.add(alias);
  }
  return SUNLIGHT_ENUM.filter(c => out.has(c));
}

/**
 * 자생 구분 → enum 하나. 모르면 빈 문자열.
 * @param {*} raw
 * @returns {string}
 */
export function normalizeNativeStatus(raw) {
  const v = clean(raw);
  if (!v) return "";
  const key = v.toLowerCase();
  if (NATIVE_STATUS_ENUM.includes(key)) return key;
  return NATIVE_ALIASES[v] || NATIVE_ALIASES[key] || "";
}

/**
 * 설명 → `{ summary, source, note }`.
 *
 * **원문 HTML 은 저장하지 않는다.** 태그를 지우고 공백을 정리한 평문만 남긴다.
 * 출처 표기가 없으면 빈 문자열이며, 지어내지 않는다.
 *
 * `note` 는 **사용자 메모**다. 출처는 이 값을 주지 않으므로 동기화가 덮어쓰지
 * 않는다(metadataMerge 참조). summary 와 섞지 않는 이유가 그것이다 —
 * 한 필드에 두면 갱신할 때 사람이 쓴 문장을 함께 지우게 된다.
 */
export function normalizeDescription(raw, fallbackSource = "") {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return {
      summary: stripHtml(raw.summary),
      source:  clean(raw.source) || clean(fallbackSource),
      note:    stripHtml(raw.note)
    };
  }
  const summary = stripHtml(raw);
  return { summary, source: summary ? clean(fallbackSource) : "", note: "" };
}

/** 태그 제거 + 엔티티 일부 복원 + 공백 정리. 평문만 남는다. */
export function stripHtml(v) {
  return clean(v)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 사진 목록 → `{ url, type, caption }[]`.
 *
 * 문자열 배열(URL 만)도 받는다. type 을 모르면 **빈 값**으로 둔다 —
 * 임의로 "habit" 을 채우면 없는 정보를 만든 것이 된다.
 *
 * `source` 는 그 사진이 어디서 왔는지다(kna · nire · gbif · user). 나중에
 * 사용자가 올린 사진이 함께 들어오므로, 없으면 섞여서 구분할 수 없게 된다.
 * 항목에 없으면 `defaultSource` 를 쓴다 — 보통 Provider 코드다.
 *
 * @param {*} raw
 * @param {number} [max]
 * @param {string} [defaultSource]
 */
export function normalizePhotos(raw, max = 5, defaultSource = "") {
  const out = [];
  const seen = new Set();
  for (const item of toList(raw)) {
    const obj = item && typeof item === "object" ? item : { url: item };
    const url = clean(obj.url || obj.src || obj.image_url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const t = clean(obj.type).toLowerCase();
    const type = PHOTO_TYPES.includes(t) ? t : (PHOTO_TYPE_ALIASES[clean(obj.type)] || "");
    const srcRaw = clean(obj.source) || clean(defaultSource);
    const source = PHOTO_SOURCES.includes(srcRaw.toLowerCase()) ? srcRaw.toLowerCase() : "";
    out.push({ url, type, caption: stripHtml(obj.caption), source });
    if (out.length >= max) break;
  }
  return out;
}

/** 1~12 정수만. */
export function normalizeMonths(raw) {
  return toList(raw).flatMap(monthsFromToken)
    .filter((n, i, a) => a.indexOf(n) === i)
    .sort((a, b) => a - b);
}

const inMonth = n => Number.isInteger(n) && n >= 1 && n <= 12;
/** `"6~8월"` · `"6월~8월"` · `"6-8"` — 물결·붙임표 변형을 함께 받는다. */
const MONTH_RANGE = /^(\d{1,2})\s*월?\s*[~∼〜\-–—]\s*(\d{1,2})\s*월?$/;
const MONTH_ONE   = /^(\d{1,2})\s*월?$/;

/**
 * 토큰 하나 → 월 목록.
 *
 * 국가 식물 DB 는 개화기를 `"6~8월"` 같은 **문장으로** 준다. Provider 는 그
 * 원문을 그대로 넘기므로(PlantRecord 의 `floweringMonthsRaw`) 범위를 펼치는
 * 일은 여기서 한다 — 숫자만 긁으면 `"6~8월"` 이 6월과 8월이 되고 7월이 사라진다.
 *
 * **모르는 표기는 버린다.** `"봄"` · `"연중"` 은 몇 월인지 원문이 말하지 않았다 —
 * 그럴듯한 달을 채우는 건 원본에 없는 데이터를 만드는 일이다.
 */
function monthsFromToken(token) {
  const t = String(token ?? "").trim();
  if (!t) return [];

  const range = t.match(MONTH_RANGE);
  if (range) {
    const from = Number(range[1]), to = Number(range[2]);
    if (!inMonth(from) || !inMonth(to)) return [];
    // `"12~2월"` 처럼 해를 넘기는 표기도 있다 — 12 다음은 1 로 돌린다.
    const out = [];
    for (let m = from; out.length <= 12; m = m === 12 ? 1 : m + 1) {
      out.push(m);
      if (m === to) return out;
    }
    return [];
  }

  const one = t.match(MONTH_ONE);
  if (one) { const n = Number(one[1]); return inMonth(n) ? [n] : []; }
  return [];
}

/**
 * 상록성 → EVERGREEN_ENUM.
 *
 * **SEMI_EVERGREEN 은 출처가 그렇게 말할 때만 쓴다.** 애매해 보인다는 이유로
 * 추측해 넣지 않는다 — 모르면 UNKNOWN 이다.
 *
 * 구버전 불리언(true/false)도 읽는다 — schema v1 레코드가 그렇게 저장돼 있다.
 */
export function normalizeEvergreen(raw) {
  if (raw === true)  return "EVERGREEN";
  if (raw === false) return "DECIDUOUS";
  const v = clean(raw);
  if (!v) return "UNKNOWN";
  const up = v.toUpperCase();
  if (EVERGREEN_ENUM.includes(up)) return up;
  if (v === "true")  return "EVERGREEN";
  if (v === "false") return "DECIDUOUS";
  const low = v.toLowerCase();
  if (v === "반상록" || v === "반상록성" || low === "semi-evergreen" || low === "semi evergreen")
    return "SEMI_EVERGREEN";
  if (v === "상록" || v === "상록성" || low === "evergreen") return "EVERGREEN";
  if (v === "낙엽" || v === "낙엽성" || low === "deciduous") return "DECIDUOUS";
  return "UNKNOWN";
}

/**
 * 저장되는 metadata 상태 → enum. STALE 은 저장 대상이 아니므로 받아도 버린다
 * (화면에서 계산한다 — resolveSyncStatus 참조).
 */
export function normalizeSyncStatus(raw) {
  const v = clean(raw).toUpperCase();
  return STORED_SYNC_STATUS.includes(v) ? v : "";
}

/**
 * 출처 정보 → `{ name, record_id, synced_at, version }`.
 *
 * `name` 은 Provider 코드(kna · nire · gbif)이고 `version` 은 그 DB 의 데이터셋
 * 판(예: "2026-09")이다. 판이 있어야 "언제 기준 데이터인가" 를 말할 수 있고,
 * 출처가 개정됐을 때 재동기화 대상을 고를 수 있다.
 *
 * 순수 함수다 — 시각을 여기서 만들지 않고 인자로 받는다.
 *
 * @param {{name?:string, record_id?:string, synced_at?:string, version?:string}|null} raw
 */
export function normalizeProvider(raw) {
  const name = clean(raw?.name);
  if (!name) return { name: "", record_id: "", synced_at: "", version: "" };
  return {
    name,
    record_id: clean(raw?.record_id),
    synced_at: clean(raw?.synced_at),
    version:   clean(raw?.version)
  };
}
