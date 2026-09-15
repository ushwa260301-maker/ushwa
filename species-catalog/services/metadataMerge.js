/**
 * metadataMerge — 출처가 보내 온 metadata 를 기존 metadata 위에 **얹는다**.
 *
 * ## 왜 교체가 아니라 병합인가
 *
 * 한 식물의 metadata 에는 출처가 아는 것과 사람만 아는 것이 섞여 있다.
 * 국립수목원은 개화기와 사진을 알지만 "이 현장 토양은 배수가 좋다" 는 모른다.
 * 동기화가 metadata 를 통째로 갈아 끼우면 사람이 쌓은 쪽이 조용히 사라진다 —
 * 에러도 없고 되돌릴 방법도 없다.
 *
 * 그래서 규칙은 하나다. **출처가 값을 말한 필드만 덮는다.**
 * 빈 값은 "없다" 가 아니라 "모른다" 로 읽는다.
 *
 * ## 이 파일이 따로 있는 이유
 *
 * plantNormalizer 는 값 하나를 다듬고(순수), metadataMigration 은 판을 올리고,
 * plantRecord 는 Provider 계약을 안다. 병합은 그 셋과 다른 질문에 답한다 —
 * "이 필드의 정본은 누구인가". 소유권 목록은 앞으로 더 자란다
 * (growthMemo · maintenanceMemo …). 그래서 자기 자리를 준다.
 *
 * ⚠ 순수 함수다. 입력을 변형하지 않고 새 객체를 돌려준다.
 */

import { normalizePhotos } from "./plantNormalizer.js";

/**
 * 필드별 정본이 누구인가 — **병합 규칙은 여기에만 선언한다.**
 *
 *   provider  출처가 정본. 출처가 값을 말했을 때만 덮는다.
 *   user      사람이 정본. 동기화가 절대 건드리지 않는다.
 *   merge     규칙이 따로 있다 (MERGERS).
 *   system    동기화라는 사실 자체. 새 값으로 간다.
 *   derived   다른 필드에서 다시 계산한다. 병합하지 않는다.
 *
 * 이 표가 있는 이유는 규칙이 코드에 흩어지는 걸 막기 위해서다. 필드를 더할 때
 * (growthMemo · maintenanceMemo …) 여기 한 줄이면 되고, 표에 없는 필드는
 * 테스트가 잡는다 — 선언을 빠뜨린 필드는 조용히 출처에게 덮인다.
 *
 * 점 표기는 구조체 안쪽이다: `description` 은 한 필드지만 요약은 출처가,
 * 메모는 사람이 정본이다.
 */
export const FIELD_OWNERSHIP = {
  scientific_name:  "provider",
  family:           "provider",
  genus:            "provider",
  flowering_months: "provider",
  fruiting_months:  "provider",
  sunlight:         "provider",
  plant_type:       "provider",
  nativeStatus:     "provider",
  evergreen:        "provider",

  soil:          "user",
  indoorOutdoor: "user",

  description:            "merge",
  "description.summary":  "provider",
  "description.source":   "provider",
  "description.note":     "user",
  photos:                 "merge",
  sync_status:            "system",

  schema_version:      "system",
  provider:            "system",
  plant_api_source:    "system",
  plant_api_id:        "system",
  plant_api_synced_at: "system",

  image_url:     "derived",
  thumbnail_url: "derived"
};

/** 소유자별 필드 목록. 점 표기(구조체 안쪽)는 제외한다. */
function fieldsOwnedBy(owner) {
  return Object.keys(FIELD_OWNERSHIP)
    .filter(f => !f.includes(".") && FIELD_OWNERSHIP[f] === owner);
}

/** 사람이 정본인 필드 — 동기화가 절대 건드리지 않는다. */
export const USER_OWNED_FIELDS = fieldsOwnedBy("user");

/** 사용자가 올린 사진의 출처 코드. 어떤 동기화에서도 살아남는다. */
export const USER_PHOTO_SOURCE = "user";

/**
 * 출처가 이 필드를 "말했는가".
 *
 * `""` · `[]` · `"UNKNOWN"` 은 전부 모른다는 뜻이다. 이걸 값으로 받아들이면
 * 출처가 모르는 필드마다 기존 값이 지워진다 — 그게 이 모듈이 막는 일이다.
 */
function told(v) {
  if (Array.isArray(v)) return v.length > 0;
  if (v === null || v === undefined) return false;
  const s = String(v).trim();
  return s !== "" && s !== "UNKNOWN";
}

/**
 * 사진 병합.
 *
 *   ① `source: "user"` 는 항상 남는다 — 사람이 직접 올린 것이다.
 *   ② **같은 출처 · 같은 종류**의 자리는 새 사진이 차지한다. 국립수목원 꽃
 *      사진의 URL 이 바뀌면 옛 URL 은 사라진다 — 같은 자리의 갱신이기 때문이다.
 *   ③ 이번에 오지 않은 자리는 건드리지 않는다. 같은 kna 라도 꽃만 왔으면
 *      잎 사진은 남는다 — "출처가 지웠다" 와 "이번 응답에 없다" 는 다르고,
 *      구분할 수 없으니 지우지 않는 쪽을 택한다.
 *   ④ 같은 URL 은 한 번만. 먼저 있던 쪽이 이긴다.
 *
 * 순서는 **남은 것 → 새로 온 것**이다. 대표 사진(`photos[0]`)이 곧
 * `image_url` 이라, 사용자가 올린 사진이 있으면 그것이 계속 대표로 남는다.
 *
 * @param {object[]} existing  기존 photos
 * @param {object[]} incoming  이번에 받은 photos
 * @param {number} [max]
 */
export function mergePhotos(existing, incoming, max = 5) {
  const before = normalizePhotos(existing, Infinity);
  const after  = normalizePhotos(incoming, Infinity);

  // 사진 한 장의 "자리" — 출처와 종류로 정한다. 종류를 모르면 빈 칸이 곧 자리다.
  const slotOf = p => `${p.source}/${p.type}`;

  // 이번 응답이 채우는 자리들. 사용자 사진 자리는 어떤 경우에도 대상이 아니다.
  const replaced = new Set(
    after.filter(p => p.source && p.source !== USER_PHOTO_SOURCE).map(slotOf)
  );

  const kept = before.filter(p => p.source === USER_PHOTO_SOURCE || !replaced.has(slotOf(p)));

  const out = [];
  const seen = new Set();
  for (const p of [...kept, ...after]) {
    if (seen.has(p.url)) continue;
    seen.add(p.url);
    out.push(p);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * 설명 병합 — summary/source 는 출처가, note 는 사람이 정본이다.
 */
function mergeDescription(before, after) {
  const prev = before || {};
  const next = after || {};
  return {
    summary: told(next.summary) ? next.summary : String(prev.summary || ""),
    source:  told(next.summary) ? String(next.source || "") : String(prev.source || ""),
    note:    String(prev.note || "")      // 사용자 메모 — 동기화가 건드리지 않는다
  };
}

/**
 * 동기화 후 상태.
 *
 * **USER_EDITED 가 최우선이다.** 사람이 손댄 레코드는 동기화를 받아도 계속
 * USER_EDITED 로 남는다 — 그래야 "이 식물은 사람이 고친 값이 섞여 있다" 는
 * 사실이 다음 동기화까지 보존된다. SYNCED 로 내려 버리면 그 구분이 사라진다.
 */
function mergeStatus(before, after) {
  if (before === "USER_EDITED") return "USER_EDITED";
  return after || before || "PENDING";
}

/**
 * 기존 metadata 위에 새 metadata 를 얹는다.
 *
 * @param {object|null} existing  기존 metadata (정규화된 모양)
 * @param {object} incoming       출처에서 만든 metadata (toSpeciesMetadata 결과)
 * @param {number} [maxPhotos]
 * @returns {object} 새 metadata — 입력 둘 다 변형하지 않는다
 */
export function mergeMetadata(existing, incoming, maxPhotos = 5) {
  const before = existing && typeof existing === "object" ? existing : {};
  const after  = incoming && typeof incoming === "object" ? incoming : {};

  const out = { ...before };

  // 규칙이 따로 있는 필드는 전용 병합기가 맡는다.
  const MERGERS = {
    description: () => mergeDescription(before.description, after.description),
    photos:      () => mergePhotos(before.photos, after.photos, maxPhotos),
    sync_status: () => mergeStatus(before.sync_status, after.sync_status)
  };

  for (const [field, owner] of Object.entries(FIELD_OWNERSHIP)) {
    if (field.includes(".")) continue;          // 구조체 안쪽은 전용 병합기가 본다
    if (MERGERS[field]) { out[field] = MERGERS[field](); continue; }

    switch (owner) {
      case "provider":
        // 출처가 말한 것만 덮는다. 기존에 그 필드가 아예 없으면 `after` 의 빈
        // 값을 쓴다 — 결과가 언제나 완전한 metadata 모양이 되도록.
        out[field] = told(after[field]) ? after[field]
                   : (field in before ? before[field] : after[field]);
        break;
      case "user":
        // 어떤 경우에도 기존 값을 유지한다.
        out[field] = before[field] ?? after[field] ?? "";
        break;
      case "system":
        // 동기화 사실은 새 값으로 간다 — 언제 어느 판에서 받았는지가 바뀌었다.
        if (field in after) out[field] = after[field];
        break;
      case "derived":
        break;                                  // 아래에서 다시 계산한다
    }
  }

  // 대표 이미지는 병합된 photos 에서 다시 뽑는다.
  const primary = out.photos[0]?.url || "";
  out.image_url = primary;
  out.thumbnail_url = primary;

  return out;
}
