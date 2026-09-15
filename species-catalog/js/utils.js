/**
 * Pure utility functions and shared constants.
 * No DOM access, no state access — safe to import anywhere.
 */

/** 1..12 as an ordered array (used by month grids and heatmaps). */
export const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/** Fixed swatch colors for standard bloom colors. Unknown colors fall back to HSL. */
export const COLOR_MAP = {
  "백색": "#f2f0e6",
  "황색": "#e8b937",
  "적색": "#c33a2a",
  "분홍": "#e58ab0",
  "자색": "#8551a3",
  "청색": "#3f6cb0",
  "주황": "#e0803a",
  "혼색": "linear-gradient(135deg,#e58ab0 0%,#8551a3 50%,#e8b937 100%)"
};

/** djb2-style hash for stable pseudo-color assignment to user-added colors. */
export function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i) | 0;
  return Math.abs(h);
}

/** Return a background value for a color name (fixed if known, hashed HSL otherwise). */
export function colorFor(name) {
  return COLOR_MAP[name] || `hsl(${hash(name) % 360}, 45%, 55%)`;
}

/** HTML-escape helper for values placed via innerHTML. */
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

/** Coerce any input into a length-12 int array (missing/invalid → 0). */
export function normalizeCounts(arr) {
  const out = Array(12).fill(0);
  if (Array.isArray(arr)) {
    for (let i = 0; i < 12; i++) {
      const v = Number(arr[i]);
      out[i] = Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
    }
  }
  return out;
}

/**
 * Map a purchase count to a 0..4 heatmap intensity level (GitHub Contribution
 * style). Thresholds tuned for typical nursery order cadence.
 */
export function freqLevel(n) {
  if (n <= 0) return 0;
  if (n === 1) return 1;
  if (n <= 3) return 2;
  if (n <= 6) return 3;
  return 4;
}

/** Human-format bloom months as "3월 · 4월 · 5월" (or "—" when empty). */
export function formatBloom(months) {
  if (!months || !months.length) return "—";
  return [...months].sort((a, b) => a - b).map(m => `${m}월`).join(" · ");
}

/** Lowest price across a species' 단가표 (Infinity when no prices). */
export function minPriceOf(sp) {
  return sp.prices?.length ? Math.min(...sp.prices.map(p => p.price)) : Infinity;
}

/** Earliest bloom month (13 as a sentinel meaning "no bloom info"). */
export function earliestBloomOf(sp) {
  return sp.bloomMonths?.length ? Math.min(...sp.bloomMonths) : 13;
}

/**
 * Generate the next unique `{prefix}-###` id given the existing records.
 *
 * Usage:
 *   nextId("sp",   state.data.species)        → "sp-013"
 *   nextId("inv",  state.data.invoices)       → "inv-050"
 *   nextId("item", state.data.invoiceItems)   → "item-123"
 *
 * Kept generic so id generation is one function across the three collections.
 * The 2-arg form (prefix, records) is the modern signature; the 1-arg legacy
 * form (records) implicitly uses the "sp" prefix and is kept so any older
 * calls still work.
 */
export function nextId(prefixOrRecords, maybeRecords) {
  const prefix = typeof prefixOrRecords === "string" ? prefixOrRecords : "sp";
  const records = typeof prefixOrRecords === "string" ? maybeRecords : prefixOrRecords;
  const re = new RegExp("^" + escapeRegex(prefix) + "-(\\d+)$");
  const nums = (records || [])
    .map(r => (r.id || "").match(re))
    .filter(Boolean)
    .map(m => parseInt(m[1], 10));
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return prefix + "-" + String(n).padStart(3, "0");
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 거래명세서에서 **저장 대상이 되는 품목 행**을 고른다.
 *
 * 저장 경로(`invoiceModal.saveInvoice`)와 디버그 스냅샷(`debugPanel.projectSave`)이
 * **같은 함수**를 써야 한다. 두 곳이 갈라져 있던 동안 스냅샷은 7건인데 DB 에는
 * 5건이 들어갔고, 감사 기록이 실제 저장과 어긋났다(실환경 inv-073).
 * 여기(leaf 모듈)에 두는 이유는 그 두 모듈이 `invoiceModal → debugPanel`
 * 방향으로 이미 의존하고 있어 한쪽에 두면 순환 참조가 되기 때문이다.
 *
 * **단가 0원을 거르지 않는다.** 거래명세서의 "서비스" 품목은 단가·금액이 0이다.
 * 예전 조건 `unitPrice > 0` 은 그 행을 저장 직전에 지웠다
 * (inv-073 붓들레야 4주·위성류 11주 소실). 거래 이력은 원본대로 보존하고,
 * 가격 왜곡은 통계에서 막는다 — `stats.js` 의 `pricedItems()` 참조.
 *
 * 수량 0은 계속 거른다 — 행만 추가하고 입력하지 않은 빈 행이며, 서비스
 * 품목이라도 수량은 적혀 있다.
 *
 * @param {Array<{name?:string, quantity?:number|string}>} items
 * @returns {Array} 저장 대상 행
 */
export function collectValidItems(items) {
  return (items || []).filter(it =>
    it?.name?.trim() && Number(it.quantity) > 0
  );
}

// ============================================================
// 식물 도감 메타데이터 (Species.metadata)
// ============================================================

/**
 * 도감 메타데이터는 **Species 레코드 안(`species.metadata`)에 산다.**
 * 별도 저장소를 두지 않는다 — storage.js 가 species 배열을 통째로 직렬화하고
 * importExport 도 그대로 주고받으므로, 한 곳에 있으면 저장·불러오기·내보내기가
 * 자동으로 따라온다.
 *
 * 이미 Species 에 있는 것은 중복하지 않는다:
 *   학명 → `species.latin` · 분류 → `species.category` · 개화 → `species.bloomMonths`
 */
export const SUNLIGHT_OPTIONS = [
  { value: "",       label: "— 미지정 —" },
  { value: "양지",   label: "양지",   icon: "☀️" },
  { value: "반양지", label: "반양지", icon: "🌤" },
  { value: "음지",   label: "음지",   icon: "🌑" }
];

export const INDOOR_OUTDOOR_OPTIONS = [
  { value: "",     label: "— 미지정 —" },
  { value: "실내", label: "실내", icon: "🏡" },
  { value: "실외", label: "실외", icon: "🌳" },
  { value: "둘다", label: "둘다", icon: "🏡🌳" }
];

export const NATIVE_STATUS_OPTIONS = [
  { value: "",       label: "— 미지정 —" },
  { value: "자생종", label: "자생종", icon: "🇰🇷" },
  { value: "재배종", label: "재배종", icon: "🌱" },
  { value: "외래종", label: "외래종", icon: "🌍" }
];

export const EVERGREEN_OPTIONS = [
  { value: "",     label: "— 미지정 —" },
  { value: "상록", label: "상록", icon: "🌿" },
  { value: "낙엽", label: "낙엽", icon: "🍂" }
];

/**
 * 도감 메타데이터 필드 (T10 · Provider 구조).
 *
 * metadata 는 **외부 식물 DB 스냅샷**이다. Species 본체 필드(latin · category ·
 * bloomMonths)와 이름이 겹치는 항목이 있는데, 의도된 것이다 — 본체는 앱이
 * 관리하는 운영 값이고 metadata 는 출처가 준 원본이다. 둘이 다르면 어느 쪽이
 * 원본인지 추적할 수 있어야 한다.
 */
export const METADATA_TEXT_FIELDS = [
  "scientific_name", "family", "genus",
  "sunlight", "soil", "plant_type",
  "indoorOutdoor", "nativeStatus", "description",
  "image_url", "thumbnail_url"
];

/** 월 배열 필드 — 1~12 정수만 남긴다. */
export const METADATA_MONTH_FIELDS = ["flowering_months", "fruiting_months"];

/** 3-상태 불리언 — true(상록) · false(낙엽) · ""(미지정). */
export const METADATA_BOOL_FIELDS = ["evergreen"];

/**
 * 외부 DB 연결 정보. 사용자가 입력하지 않는다 — Provider 가 채우고 앱은 읽는다.
 *   plant_api_source     출처 코드 (kna · nire · gbif)
 *   plant_api_id         출처 식별자
 *   plant_api_synced_at  마지막 동기화 시각 (ISO)
 */
export const API_FIELDS = ["plant_api_source", "plant_api_id", "plant_api_synced_at"];

/** 카드·모달에 표시되는 항목 전체. */
export const DISPLAY_FIELDS = [
  ...METADATA_TEXT_FIELDS, ...METADATA_MONTH_FIELDS, ...METADATA_BOOL_FIELDS
];

/** metadata 가 담는 필드 전체. */
export const METADATA_FIELDS = [...DISPLAY_FIELDS, ...API_FIELDS];

/** 모든 필드가 빈 값인 metadata — metadata 가 없는 기존 Species 의 기본값. */
export function emptyMetadata() {
  const out = {};
  for (const f of METADATA_TEXT_FIELDS) out[f] = "";
  for (const f of METADATA_MONTH_FIELDS) out[f] = [];
  for (const f of METADATA_BOOL_FIELDS) out[f] = "";
  for (const f of API_FIELDS) out[f] = "";
  return out;
}

/** 1~12 정수만 남긴 월 배열. */
export function normalizeMonths(v) {
  const list = Array.isArray(v) ? v : (v == null || v === "" ? [] : [v]);
  return list.map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 12);
}

/** true · false · "" 로 정규화. 문자열 "상록"/"낙엽" 도 받아 준다(구버전 데이터). */
export function normalizeTriBool(v) {
  if (v === true || v === "true" || v === "상록") return true;
  if (v === false || v === "false" || v === "낙엽") return false;
  return "";
}

/**
 * 임의 입력을 metadata 모양으로 정규화한다. 알려진 필드만 남긴다 —
 * 폼이나 외부 응답에서 들어온 값을 그대로 믿지 않는다.
 */
export function normalizeMetadata(raw) {
  const out = emptyMetadata();
  if (!raw || typeof raw !== "object") return out;
  for (const f of METADATA_TEXT_FIELDS) out[f] = String(raw[f] ?? "").trim();
  for (const f of API_FIELDS)           out[f] = String(raw[f] ?? "").trim();
  for (const f of METADATA_MONTH_FIELDS) out[f] = normalizeMonths(raw[f]);
  for (const f of METADATA_BOOL_FIELDS)  out[f] = normalizeTriBool(raw[f]);
  return out;
}

/** 카드에 **보여줄** 값이 하나라도 있는가. 연결 정보(API_FIELDS)는 세지 않는다. */
export function hasMetadata(metadata) {
  const m = metadata || {};
  return METADATA_TEXT_FIELDS.some(f => String(m[f] || "").trim())
      || METADATA_MONTH_FIELDS.some(f => normalizeMonths(m[f]).length)
      || METADATA_BOOL_FIELDS.some(f => normalizeTriBool(m[f]) !== "");
}

/**
 * Species 하나가 metadata 를 갖도록 보장한다 (없으면 빈 객체를 붙인다).
 * Cloud 는 metadata 컬럼이 없어 읽어온 Species 에는 이 필드가 비어 있다 —
 * 그때도 모달·카드가 그대로 동작하게 하는 것이 목적이다.
 * @param {object} sp
 */
export function withMetadata(sp) {
  return { ...sp, metadata: normalizeMetadata(sp?.metadata) };
}

/** 외부 DB 에 연결돼 있는가 — 출처 코드가 있으면 연결된 것으로 본다. */
export function isApiLinked(metadata) {
  return Boolean(String(metadata?.plant_api_source || "").trim());
}

/**
 * 연결된 도감 정보는 **읽기 전용**이다. 외부 DB 가 정본이므로 앱에서 고치면
 * 다음 동기화에 덮이고, 그 사이 두 값이 어긋난다.
 */
export function isMetadataReadOnly(metadata) {
  return isApiLinked(metadata);
}

/** 출처 코드 → 사람이 읽는 이름. 모르는 코드는 코드 그대로 보여준다. */
export const PROVIDER_LABELS = {
  kna:  "국립수목원",
  nire: "국립생물자원관",
  gbif: "GBIF"
};

/**
 * 도감 정보의 출처를 한 줄로 알려준다 — "정보 준비중" 보다 출처가 분명하다.
 *
 *   { kind: "api",  label: "국립수목원" }   외부 DB 에서 받아온 값
 *   { kind: "user", label: "사용자 추가" }  사람이 직접 입력한 값
 *   { kind: "none", label: "미연동" }       아직 아무 값도 없음
 */
export function metadataSource(metadata) {
  if (isApiLinked(metadata)) {
    const code = String(metadata.plant_api_source).trim();
    return { kind: "api", code, label: PROVIDER_LABELS[code] || code };
  }
  if (hasMetadata(metadata)) return { kind: "user", code: "", label: "사용자 추가" };
  return { kind: "none", code: "", label: "미연동" };
}

/** 선택지 값 → 아이콘. 목록에 없으면 빈 문자열. */
export function iconFor(options, value) {
  return options.find(o => o.value === value)?.icon || "";
}

/**
 * 개화 월 블록을 그린다 — 1~12월을 **항상** 12칸으로 표시하고, 개화월만
 * 채운다. 텍스트 요약("3~6월") 대신 블록으로 보여주는 것이 도감의 기본
 * 표기이며, 월 수가 같아도 연속/분산 여부가 한눈에 드러난다.
 *
 * 순수 DOM 렌더러 — state 나 storage 를 모른다.
 *
 * @param {HTMLElement|null} container  .phenology-strip
 * @param {number[]} bloomMonths        [3,4,5,6] 같은 월 배열
 */
export function renderBloomMonths(container, bloomMonths) {
  if (!container) return;
  const set = new Set((bloomMonths || []).map(Number));
  container.innerHTML = "";
  for (let m = 1; m <= 12; m++) {
    const on = set.has(m);
    const cell = document.createElement("div");
    cell.className = "ph-cell" + (on ? " active" : "");
    cell.textContent = String(m);
    cell.title = on ? `${m}월 개화` : `${m}월`;
    cell.setAttribute("aria-label", cell.title);
    container.appendChild(cell);
  }
}
