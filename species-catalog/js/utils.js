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
 * 도감 메타데이터 필드 (T10.1).
 *
 * metadata 는 **외부 식물 DB 스냅샷**이다. Species 본체 필드(latin · category ·
 * bloomMonths)와 겹치는 항목이 있는데 의도된 것이다 — 본체는 앱이 관리하는
 * 운영 값이고 metadata 는 출처가 준 원본이다.
 *
 * 값 정규화 규칙은 `services/plantNormalizer.js` 한 곳에 있다. 여기서는 그것을
 * 다시 export 해 UI 가 같은 규칙을 쓰게 한다 — 규칙이 둘로 갈리지 않게.
 */
export {
  SUNLIGHT_ENUM, NATIVE_STATUS_ENUM, PHOTO_TYPES, PHOTO_SOURCES,
  EVERGREEN_ENUM, SYNC_STATUS_ENUM, STORED_SYNC_STATUS,
  normalizeSunlight, normalizeNativeStatus, normalizeDescription,
  normalizePhotos, normalizeMonths, normalizeEvergreen, normalizeProvider,
  normalizeSyncStatus, stripHtml
} from "../services/plantNormalizer.js";
export {
  CURRENT_SCHEMA_VERSION, upgradeMetadata, resolveSyncStatus, versionOf
} from "../services/metadataMigration.js";

import {
  normalizeSunlight as _sun, normalizeNativeStatus as _native,
  normalizeDescription as _desc, normalizePhotos as _photos,
  normalizeMonths as _months, normalizeEvergreen as _ever,
  normalizeProvider as _provider,
  SUNLIGHT_ENUM as _SUN_ENUM, NATIVE_STATUS_ENUM as _NAT_ENUM
} from "../services/plantNormalizer.js";
import {
  CURRENT_SCHEMA_VERSION as _SCHEMA_V, upgradeMetadata as _upgrade,
  resolveSyncStatus as _resolveStatus
} from "../services/metadataMigration.js";

/** enum 코드 → 화면 표기. 저장은 코드로, 표시만 한글로 한다. */
export const SUNLIGHT_LABELS = {
  full_sun:      { label: "양지",   icon: "☀️" },
  partial_sun:   { label: "반양지", icon: "🌤" },
  partial_shade: { label: "반음지", icon: "⛅" },
  shade:         { label: "음지",   icon: "🌑" }
};

export const NATIVE_STATUS_LABELS = {
  native:      { label: "자생종", icon: "🇰🇷" },
  naturalized: { label: "귀화종", icon: "🌾" },
  introduced:  { label: "외래종", icon: "🌍" },
  cultivar:    { label: "재배품종", icon: "🌱" }
};

export const PHOTO_TYPE_LABELS = { flower: "꽃", leaf: "잎", habit: "수형" };

export const INDOOR_OUTDOOR_OPTIONS = [
  { value: "",     label: "— 미지정 —" },
  { value: "실내", label: "실내", icon: "🏡" },
  { value: "실외", label: "실외", icon: "🌳" },
  { value: "둘다", label: "둘다", icon: "🏡🌳" }
];

/** 모달 select 용 목록 — enum 코드를 값으로 쓴다. */
export const SUNLIGHT_OPTIONS = _SUN_ENUM.map(v => ({ value: v, ...SUNLIGHT_LABELS[v] }));
export const NATIVE_STATUS_OPTIONS =
  [{ value: "", label: "— 미지정 —" }, ..._NAT_ENUM.map(v => ({ value: v, ...NATIVE_STATUS_LABELS[v] }))];
export const EVERGREEN_LABELS = {
  EVERGREEN:      { label: "상록",   icon: "🌿" },
  DECIDUOUS:      { label: "낙엽",   icon: "🍂" },
  SEMI_EVERGREEN: { label: "반상록", icon: "🍃" },
  UNKNOWN:        { label: "미지정", icon: "" }
};
export const EVERGREEN_OPTIONS = [
  { value: "UNKNOWN",        label: "— 미지정 —" },
  { value: "EVERGREEN",      ...EVERGREEN_LABELS.EVERGREEN },
  { value: "DECIDUOUS",      ...EVERGREEN_LABELS.DECIDUOUS },
  { value: "SEMI_EVERGREEN", ...EVERGREEN_LABELS.SEMI_EVERGREEN }
];

/** 상태 배지 표기. STALE 은 저장값이 아니라 계산 결과다. */
export const SYNC_STATUS_LABELS = {
  PENDING:     { label: "미연동",     icon: "○" },
  SYNCED:      { label: "연동됨",     icon: "🔗" },
  USER_EDITED: { label: "사용자 추가", icon: "✎" },
  STALE:       { label: "갱신 필요",   icon: "⟳" }
};

/** 평문 문자열 필드. */
export const METADATA_TEXT_FIELDS = [
  "scientific_name", "family", "genus",
  "soil", "plant_type", "indoorOutdoor",
  "image_url", "thumbnail_url"
];
export const METADATA_MONTH_FIELDS = ["flowering_months", "fruiting_months"];
export const METADATA_ENUM_FIELDS_SINGLE = ["evergreen", "sync_status"];
/** @deprecated schema v1 이름 — 호출부 호환용. */
export const METADATA_BOOL_FIELDS = [];
/** enum 배열 / enum 단일 / 구조체 / 사진 목록. */
export const METADATA_ENUM_LIST_FIELDS = ["sunlight"];
export const METADATA_ENUM_FIELDS      = ["nativeStatus", "evergreen", "sync_status"];
export const METADATA_OBJECT_FIELDS    = ["description"];
export const METADATA_PHOTO_FIELDS     = ["photos"];

/**
 * 외부 DB 연결 정보. 사용자가 입력하지 않는다.
 * `provider` 가 정본이고 `plant_api_*` 는 그 파생이다 — 읽는 쪽을 한 번에
 * 바꾸지 않으려고 남겨 둔다.
 */
export const API_FIELDS = ["provider", "plant_api_source", "plant_api_id", "plant_api_synced_at"];

/** 구조 버전 필드 — 마이그레이션 기준점. */
export const META_VERSION_FIELD = "schema_version";

export const DISPLAY_FIELDS = [
  ...METADATA_TEXT_FIELDS, ...METADATA_MONTH_FIELDS, ...METADATA_BOOL_FIELDS,
  ...METADATA_ENUM_LIST_FIELDS, ...METADATA_ENUM_FIELDS,
  ...METADATA_OBJECT_FIELDS, ...METADATA_PHOTO_FIELDS
];
export const METADATA_FIELDS = [META_VERSION_FIELD, ...DISPLAY_FIELDS, ...API_FIELDS];

/** 모든 필드가 빈 값인 metadata — metadata 없는 기존 Species 의 기본값. */
export function emptyMetadata() {
  const out = { [META_VERSION_FIELD]: _SCHEMA_V, provider: _provider(null) };
  for (const f of METADATA_TEXT_FIELDS) out[f] = "";
  for (const f of API_FIELDS) { if (f !== "provider") out[f] = ""; }
  for (const f of METADATA_MONTH_FIELDS) out[f] = [];
  for (const f of METADATA_ENUM_LIST_FIELDS) out[f] = [];
  for (const f of METADATA_OBJECT_FIELDS) out[f] = { summary: "", source: "", note: "" };
  for (const f of METADATA_PHOTO_FIELDS) out[f] = [];
  out.nativeStatus = "";
  out.evergreen = "UNKNOWN";
  out.sync_status = "PENDING";
  return out;
}

/** 3-상태 불리언 정규화 (구버전 "상록"/"낙엽" 문자열도 읽는다). */
export const normalizeTriBool = _ever;

/**
 * 임의 입력을 metadata 모양으로 정규화한다. 알려진 필드만 남긴다.
 * 구버전 값(한글 sunlight 문자열 · 문자열 description · image_url 만 있는 사진)도
 * 새 구조로 옮겨 준다 — 기존 Species 가 그대로 열려야 하기 때문이다.
 */
export function normalizeMetadata(raw) {
  const out = emptyMetadata();
  if (!raw || typeof raw !== "object") return out;

  // 먼저 현재 스키마 버전까지 끌어올린다 — 읽는 쪽이 버전 분기를 알 필요가 없다.
  const { metadata: up } = _upgrade(raw);

  for (const f of METADATA_TEXT_FIELDS) out[f] = String(up[f] ?? "").trim();
  for (const f of API_FIELDS) { if (f !== "provider") out[f] = String(up[f] ?? "").trim(); }
  for (const f of METADATA_MONTH_FIELDS) out[f] = _months(up[f]);
  out.sunlight       = _sun(up.sunlight);
  out.nativeStatus   = _native(up.nativeStatus);
  out.evergreen      = _ever(up.evergreen);
  out.description    = _desc(up.description);
  // 저장값이 없으면 추론한다 — 기본값 PENDING 을 직접 박으면 이 경로만
  // resolveSyncStatus 와 답이 갈린다. 상태를 정하는 규칙은 한 곳에만 둔다.
  out.sync_status = _resolveStatus(up);

  out.provider = _provider(up.provider?.name ? up.provider : {
    name: out.plant_api_source, record_id: out.plant_api_id, synced_at: out.plant_api_synced_at
  });
  out.plant_api_source    = out.provider.name;
  out.plant_api_id        = out.provider.record_id;
  out.plant_api_synced_at = out.provider.synced_at;

  out.photos = _photos(up.photos, 5, out.provider.name);
  if (!out.photos.length && out.image_url) {
    out.photos = _photos([{ url: out.image_url }], 5, out.provider.name);
  }
  if (!out.image_url && out.photos.length) out.image_url = out.photos[0].url;
  if (!out.thumbnail_url && out.image_url) out.thumbnail_url = out.image_url;

  out[META_VERSION_FIELD] = _SCHEMA_V;
  return out;
}

/** 카드에 **보여줄** 값이 하나라도 있는가. 연결 정보(API_FIELDS)는 세지 않는다. */
export function hasMetadata(metadata) {
  const m = metadata || {};
  return METADATA_TEXT_FIELDS.some(f => String(m[f] || "").trim())
      || METADATA_MONTH_FIELDS.some(f => _months(m[f]).length)
      || (_ever(m.evergreen) !== "UNKNOWN")
      || _sun(m.sunlight).length > 0
      || _native(m.nativeStatus) !== ""
      || Boolean(_desc(m.description).summary)
      || _photos(m.photos).length > 0;
}

/**
 * Species 하나가 metadata 를 갖도록 보장한다 (없으면 빈 객체를 붙인다).
 * Cloud 는 metadata 컬럼이 없어 읽어온 Species 에는 이 필드가 비어 있다 —
 * 그때도 모달·카드가 그대로 동작하게 하는 것이 목적이다.
 */
export function withMetadata(sp) {
  return { ...sp, metadata: normalizeMetadata(sp?.metadata) };
}

/** 외부 DB 에 연결돼 있는가 — 출처 코드가 있으면 연결된 것으로 본다. */
export function isApiLinked(metadata) {
  return Boolean(String(metadata?.provider?.name || metadata?.plant_api_source || "").trim());
}

/** 연결된 도감 정보는 읽기 전용이다 — 외부 DB 가 정본이다. */
export function isMetadataReadOnly(metadata) {
  return isApiLinked(metadata);
}

/** 출처 코드 → 사람이 읽는 이름. */
export const PROVIDER_LABELS = {
  kna:  "국립수목원",
  nire: "국립생물자원관",
  gbif: "GBIF"
};

/**
 * 도감 정보의 출처를 한 줄로 알려준다.
 *   { kind: "api",  label: "국립수목원" }
 *   { kind: "user", label: "사용자 추가" }
 *   { kind: "none", label: "미연동" }
 */
export function metadataSource(metadata, latestVersions = {}) {
  const status = _resolveStatus(metadata, latestVersions);
  const code = String(metadata?.provider?.name || metadata?.plant_api_source || "").trim();
  if (status === "SYNCED" || status === "STALE") {
    const base = PROVIDER_LABELS[code] || code;
    return { kind: status === "STALE" ? "stale" : "api", status, code,
             label: status === "STALE" ? `${base} · 갱신 필요` : base };
  }
  if (status === "USER_EDITED") return { kind: "user", status, code: "", label: "사용자 추가" };
  return { kind: "none", status, code: "", label: "미연동" };
}

/** enum 코드 → "아이콘 한글". 모르는 코드는 코드 그대로. */
export function labelForEnum(table, code) {
  const e = table[code];
  if (!e) return code || "";
  return e.icon ? `${e.icon} ${e.label}` : e.label;
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
