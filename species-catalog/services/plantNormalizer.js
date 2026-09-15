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
 */

/** 광 조건 enum. 앱 전체가 이 코드만 쓴다. 한글은 표시할 때만 붙인다. */
export const SUNLIGHT_ENUM = ["full_sun", "partial_sun", "partial_shade", "shade"];

/** 자생 구분 enum. */
export const NATIVE_STATUS_ENUM = ["native", "naturalized", "introduced", "cultivar"];

/** 사진 종류. 모르면 "habit"(수형)으로 두지 않고 빈 값으로 둔다. */
export const PHOTO_TYPES = ["flower", "leaf", "habit"];

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
  "수형": "habit", "전체": "habit", "habit": "habit"
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
 * 설명 → `{ summary, source }`.
 *
 * **원문 HTML 은 저장하지 않는다.** 태그를 지우고 공백을 정리한 평문만 남긴다.
 * 출처 표기가 없으면 빈 문자열이며, 지어내지 않는다.
 */
export function normalizeDescription(raw, fallbackSource = "") {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { summary: stripHtml(raw.summary), source: clean(raw.source) || clean(fallbackSource) };
  }
  const summary = stripHtml(raw);
  return { summary, source: summary ? clean(fallbackSource) : "" };
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
 * @param {*} raw
 * @param {number} [max]
 */
export function normalizePhotos(raw, max = 5) {
  const out = [];
  const seen = new Set();
  for (const item of toList(raw)) {
    const obj = item && typeof item === "object" ? item : { url: item };
    const url = clean(obj.url || obj.src || obj.image_url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const t = clean(obj.type).toLowerCase();
    const type = PHOTO_TYPES.includes(t) ? t : (PHOTO_TYPE_ALIASES[clean(obj.type)] || "");
    out.push({ url, type, caption: stripHtml(obj.caption) });
    if (out.length >= max) break;
  }
  return out;
}

/** 1~12 정수만. */
export function normalizeMonths(raw) {
  return toList(raw).map(Number)
    .filter(n => Number.isInteger(n) && n >= 1 && n <= 12)
    .filter((n, i, a) => a.indexOf(n) === i)
    .sort((a, b) => a - b);
}

/** true(상록) · false(낙엽) · ""(미지정). */
export function normalizeEvergreen(raw) {
  if (raw === true || raw === "true") return true;
  if (raw === false || raw === "false") return false;
  const v = clean(raw);
  if (v === "상록" || v === "상록성" || v.toLowerCase() === "evergreen") return true;
  if (v === "낙엽" || v === "낙엽성" || v.toLowerCase() === "deciduous") return false;
  return "";
}
