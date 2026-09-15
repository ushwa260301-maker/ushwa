/**
 * metadataMigration — `species.metadata` 스키마 버전 업그레이드 전담.
 *
 * 책임 분리 (T11-1)
 *   metadataMigration  버전 → 버전 변환만. 여기가 모든 스키마 변경의 입구다.
 *   plantNormalizer    값 정규화만 (enum · 배열 · 구조). 버전을 모른다.
 *   plantRecord        Provider 출력 → metadata 변환.
 *
 * 이 파일은 정규화 규칙을 **다시 구현하지 않는다.** 값 변환이 필요하면
 * plantNormalizer 를 부른다 — 규칙이 둘로 갈리면 같은 값이 경로에 따라 달라진다.
 *
 * ⚠ 순수 함수다. fetch · localStorage · Date · Math.random 을 쓰지 않는다.
 *   입력 metadata 를 변형하지 않고 새 객체를 돌려준다.
 */

import {
  normalizeEvergreen, normalizeSyncStatus, normalizeProvider,
  normalizePhotos, STORED_SYNC_STATUS
} from "./plantNormalizer.js";

/** 현재 스키마 버전. 필드를 더하거나 의미를 바꿀 때 올린다. */
export const CURRENT_SCHEMA_VERSION = 2;

/** 버전을 알 수 없는 레코드(= schema_version 필드가 없던 시절)의 기준 버전. */
export const UNVERSIONED = 0;

/**
 * 레코드가 스스로 말하는 버전. 정수가 아니면 "버전 없음"으로 본다.
 * @param {object|null} metadata
 * @returns {number}
 */
export function versionOf(metadata) {
  const v = Number(metadata?.schema_version);
  return Number.isInteger(v) && v > 0 ? v : UNVERSIONED;
}

// ============================================================
// 버전별 업그레이드 단계
// ============================================================

/**
 * v0 → v1 — schema_version 이 없던 시절의 레코드를 구조화한다.
 *
 *   image_url          → photos[] (source of truth 이전)
 *   plant_api_*        → provider { name, record_id, synced_at }
 *
 * 값 자체는 건드리지 않는다 — 그건 normalizeMetadata 가 한다. 여기서는
 * **자리를 옮기는 일**만 한다.
 */
function upgradeV0toV1(meta) {
  const out = { ...meta };

  // provider 복원 — 이름이 없던 시절엔 plant_api_* 세 필드로 흩어져 있었다.
  if (!out.provider?.name) {
    out.provider = normalizeProvider({
      name:       out.plant_api_source,
      record_id:  out.plant_api_id,
      synced_at:  out.plant_api_synced_at
    });
  }

  // photos 가 source of truth. 대표 이미지만 있던 레코드는 그것으로 만든다.
  const photos = normalizePhotos(out.photos, 5, out.provider?.name || "");
  if (!photos.length && out.image_url) {
    out.photos = normalizePhotos([{ url: out.image_url }], 5, out.provider?.name || "");
  } else {
    out.photos = photos;
  }

  out.schema_version = 1;
  return out;
}

/**
 * v1 → v2 — evergreen 을 enum 으로, sync_status 를 도입한다.
 *
 *   evergreen    true → EVERGREEN · false → DECIDUOUS · 그 밖 → UNKNOWN
 *   sync_status  provider 가 있으면 SYNCED, 표시값이 있으면 USER_EDITED,
 *                아무것도 없으면 PENDING
 *
 * **SEMI_EVERGREEN 을 만들지 않는다.** 기존 불리언에는 그 정보가 없다.
 * 반상록은 출처가 그렇게 말할 때만 들어온다 — 없는 값을 추측으로 채우지 않는다.
 */
function upgradeV1toV2(meta) {
  const out = { ...meta };
  out.evergreen = normalizeEvergreen(out.evergreen);
  out.sync_status = storedStatus(out) || inferStatus(out);
  delete out.metadata_status;      // 옛 이름을 남겨 두면 둘이 갈라진다

  out.schema_version = 2;
  return out;
}

/**
 * 저장된 상태를 읽는다 — 이름이 바뀌기 전 판까지 본다.
 *
 * @transitional `metadata_status` 는 schema v2 의 첫 이름이었다. 배포된 적은 없고
 * feature 브랜치를 로컬에서 열어 본 브라우저에만 남아 있다. 그 레코드의 상태가
 * 조용히 PENDING 으로 되돌아가지 않도록 한 판만 더 읽어 준다 —
 * 로컬 캐시가 한 바퀴 돌고 나면 이 fallback 은 지워도 된다.
 */
function storedStatus(meta) {
  return normalizeSyncStatus(meta?.sync_status) || normalizeSyncStatus(meta?.metadata_status);
}

/**
 * "값이 들어 있는가" — 아직 정규화되지 않은 모양도 그대로 판정한다.
 *
 * inferStatus 는 **정규화 이전** 레코드에도 불린다(normalizeMetadata 가 업그레이드를
 * 먼저 돌리므로). 그래서 sunlight 가 배열이 아니라 `"full_sun"` 문자열일 수 있고,
 * photos 가 아직 배열이 아닐 수도 있다. 모양으로 거르면 사용자가 채운 값을
 * "빈 레코드" 로 오판한다 — 값의 유무만 본다.
 */
function hasValue(v) {
  if (Array.isArray(v)) return v.length > 0;
  if (v && typeof v === "object") return Object.keys(v).length > 0;
  return Boolean(String(v ?? "").trim());
}

/**
 * 상태를 모르는 레코드의 상태를 추론한다 — 마이그레이션에서 한 번만 쓴다.
 * 이후에는 저장된 값을 믿는다.
 */
function inferStatus(meta) {
  // provider 는 v1 에서 생긴 필드다. v0 레코드는 plant_api_source 만 갖고 있다.
  if (hasValue(meta?.provider?.name) || hasValue(meta?.plant_api_source)) return "SYNCED";
  const hasDisplayValue =
    hasValue(meta?.scientific_name) ||
    hasValue(meta?.soil) ||
    hasValue(meta?.plant_type) ||
    hasValue(meta?.sunlight) ||
    hasValue(meta?.nativeStatus) ||
    hasValue(meta?.photos) ||
    hasValue(meta?.image_url) ||
    hasValue(meta?.description?.summary) ||
    hasValue(meta?.flowering_months) ||
    // evergreen: false 는 "낙엽" 이라는 실제 정보다 — 빈 값이 아니다.
    (hasValue(meta?.evergreen) && meta.evergreen !== "UNKNOWN");
  return hasDisplayValue ? "USER_EDITED" : "PENDING";
}

/** 버전 n 을 n+1 로 올리는 단계들. 키는 **출발 버전**이다. */
const STEPS = {
  [UNVERSIONED]: upgradeV0toV1,
  1: upgradeV1toV2
};

// ============================================================
// 공개 API
// ============================================================

/**
 * metadata 를 현재 스키마 버전까지 끌어올린다.
 *
 * 앞으로 모든 스키마 변경은 이 함수를 지나간다 — 읽는 쪽은 버전 분기를 알 필요가
 * 없고, 새 버전이 생기면 STEPS 에 단계를 하나 더하면 된다.
 *
 * @param {object|null} metadata
 * @returns {{metadata: object, upgraded: boolean, fromVersion: number, toVersion: number}}
 *   `upgraded` 는 실제로 단계가 돌았는지다 — Admin 에서 "업그레이드된 식물 수"를
 *   집계하거나 로그를 남길 때 쓴다.
 */
export function upgradeMetadata(metadata) {
  const base = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata : {};
  const fromVersion = versionOf(base);

  let out = { ...base };
  let v = fromVersion;
  // 이미 최신이거나 미래 버전이면 그대로 둔다 — 모르는 미래 구조를 건드리지 않는다.
  while (v < CURRENT_SCHEMA_VERSION && STEPS[v]) {
    out = STEPS[v](out);
    const next = versionOf(out);
    if (next <= v) break;          // 단계가 버전을 올리지 않으면 무한 루프를 막는다
    v = next;
  }

  return {
    metadata: out,
    upgraded: v !== fromVersion,
    fromVersion,
    toVersion: v
  };
}

/**
 * 화면에 보여 줄 상태를 정한다 — 저장값 + 현재 시점 계산.
 *
 * STALE 은 저장하지 않는다. 출처에 더 새 판이 나왔는지는 지금 알아야 하는 값이라
 * 저장해 두면 그 값 자체가 낡는다. 저장된 SYNCED 에 대해서만, 알고 있는 최신 판과
 * 비교해 STALE 로 승격시킨다.
 *
 * @param {object} metadata
 * @param {Record<string,string>} [latestVersions]  { kna: "2026-10", … }
 * @returns {"PENDING"|"SYNCED"|"USER_EDITED"|"STALE"}
 */
export function resolveSyncStatus(metadata, latestVersions = {}) {
  const status = storedStatus(metadata) || inferStatus(metadata || {});
  if (status !== "SYNCED") return status;

  const name = String(metadata?.provider?.name || "").trim();
  const have = String(metadata?.provider?.version || "").trim();
  const latest = String(latestVersions?.[name] || "").trim();
  // 판 정보가 한쪽이라도 없으면 비교할 수 없다 — SYNCED 를 유지한다.
  if (!name || !have || !latest) return "SYNCED";
  return have !== latest ? "STALE" : "SYNCED";
}

export { STORED_SYNC_STATUS };
