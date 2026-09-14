/**
 * speciesMeta — 식물 도감 메타데이터 저장소 (Species 사이드카).
 *
 * 왜 Species 레코드에 직접 넣지 않는가
 *   `cloudStore.js` 의 `speciesToDb` / `speciesFromDb` 는 **닫힌 화이트리스트**다
 *   (id · name · latin · category · bloomMonths · colors · suppliers · notes).
 *   Species 객체에 필드를 더 붙여도 Cloud 로 전송되지 않고, 다음 로드에서
 *   `loadCloudFirst` 가 Cloud 값을 채택하며 `storage.save(merged)` 로
 *   localStorage 를 덮어쓰기 때문에 **새로고침 한 번에 사라진다**.
 *   Cloud 스키마 확장(migration)은 이번 Sprint 범위 밖이므로, 도감 정보는
 *   Cloud 와 분리된 **자체 키**에 보관한다.
 *
 * 성격
 *   · LocalStorage 전용 (`species-catalog:v2:speciesMeta`).
 *   · `storage.js` 가 쓰는 4개 키와 분리돼 있어 Cloud 채택에 덮이지 않는다.
 *   · Sync(pending) 대상이 아니다 — 기기 간 공유는 Cloud 스키마 확장 후.
 *
 * 이미 Species 에 있는 것은 중복하지 않는다
 *   학명 → `species.latin`        (Cloud 동기화됨)
 *   분류 → `species.category`     (Cloud 동기화됨)
 *   개화 → `species.bloomMonths`  (Cloud 동기화됨)
 *   여기서 다루는 것은 그 셋을 제외한 도감 항목뿐이다.
 */

const KEY = "species-catalog:v2:speciesMeta";

/** 선택지 — 카드·모달이 같은 목록을 쓰도록 한 곳에 둔다. */
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

/** 저장하는 필드 전체. 전부 선택 입력이며 빈 문자열이 "미지정"이다. */
export const META_FIELDS = ["sunlight", "indoorOutdoor", "nativeStatus", "evergreen", "description"];

/** 모든 필드가 빈 값인 메타데이터 — 아직 입력하지 않은 수종의 기본값. */
export function emptyMeta() {
  return { sunlight: "", indoorOutdoor: "", nativeStatus: "", evergreen: "", description: "" };
}

/** @type {Record<string, object>} speciesId → meta */
let store = {};

/** LocalStorage 에서 읽어 메모리에 올린다. 앱 부팅 시 1회. */
export function loadSpeciesMeta() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    store = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch {
    store = {};   // 깨진 값은 조용히 버린다 — 도감 정보는 부가 데이터다
  }
  return store;
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(store)); }
  catch (err) { console.warn("[speciesMeta] 저장 실패:", err?.message || err); }
}

/**
 * 한 수종의 메타데이터. 없으면 빈 값 객체를 돌려준다 —
 * 호출자가 null 검사를 하지 않아도 되고, 기존 80종도 그대로 열린다.
 * @param {string} speciesId
 */
export function getSpeciesMeta(speciesId) {
  return { ...emptyMeta(), ...(store[speciesId] || {}) };
}

/** 메타데이터가 하나라도 입력돼 있는가 (카드에서 영역 표시 여부 판단). */
export function hasSpeciesMeta(speciesId) {
  const m = store[speciesId];
  return Boolean(m && META_FIELDS.some(f => String(m[f] || "").trim()));
}

/**
 * 한 수종의 메타데이터를 저장한다. 알려진 필드만 받아들이고,
 * 모든 값이 비면 항목 자체를 지운다(빈 껍데기를 쌓지 않는다).
 * @param {string} speciesId
 * @param {object} meta
 */
export function setSpeciesMeta(speciesId, meta) {
  if (!speciesId) return;
  const clean = {};
  for (const f of META_FIELDS) {
    const v = String(meta?.[f] ?? "").trim();
    if (v) clean[f] = v;
  }
  if (Object.keys(clean).length) store[speciesId] = clean;
  else delete store[speciesId];
  persist();
}

/** 전체 메타데이터 (디버그·내보내기용 복사본). */
export function allSpeciesMeta() {
  return JSON.parse(JSON.stringify(store));
}

/** 선택지 값 → 아이콘. 목록에 없으면 빈 문자열. */
export function iconFor(options, value) {
  return options.find(o => o.value === value)?.icon || "";
}
