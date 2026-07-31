/**
 * 공급처 매칭 — OCR 이 읽은 거래처명을 기존 `suppliers` 행에 연결한다.
 *
 * 수종 매칭(`matcher.js`)과 **별도 모듈인 이유**
 *   `normalizeSpeciesName()` 은 수종 전용 규칙(규격 마커 · 수량 마커 ·
 *   `신품종` 같은 품종 접두어 제거)을 담고 있어 상호에 적용하면 이름이
 *   파괴된다. 실측:
 *     "신품종농원" → "농원"      다른 ○○농원 과 전부 충돌
 *     "3분원예"    → "원예"      동일
 *   따라서 `matcher.js` 에서 재사용하는 것은 도메인 무관한
 *   `calculateSimilarity()` 하나뿐이다. `matcher.js` 는 수정하지 않는다.
 *
 * 이 모듈은 순수 함수만 노출한다 — DOM · 네트워크 · 전역 상태 접근 없음.
 */

import { calculateSimilarity } from "./matcher.js";

// ============================================================
// 정규화
// ============================================================

/**
 * PostgreSQL 이 `\s` 로 취급하는 코드포인트 집합.
 *
 * `supplier_alias` 에는 CHECK 제약이 걸려 있다:
 *   norm_alias = fn_norm_supplier_name(alias_text)
 * 즉 이 함수의 결과가 DB 의 `lower(regexp_replace(name, '\s+', '', 'g'))`
 * 와 **한 글자라도 다르면 INSERT 가 거부된다.**
 *
 * JS 의 `\s` 를 그대로 쓰면 안 된다. PostgreSQL 16 (UTF8 / C.UTF-8) 에서
 * 1..0xFFFF 전 코드포인트를 실측한 결과, JS 는 제거하지만 Postgres 는
 * 유지하는 문자가 4개 있다:
 *     U+00A0 NBSP · U+2007 FIGURE SPACE · U+202F NNBSP · U+FEFF BOM
 * (전부 non-breaking 계열 — POSIX `[[:space:]]` 에 포함되지 않는다.)
 * 반대 방향(Postgres 만 제거)은 없다.
 *
 * 아래 클래스는 그 실측 집합과 정확히 일치한다:
 *   U+0009..U+000D, U+0020, U+1680, U+2000..U+2006, U+2008..U+200A,
 *   U+2028, U+2029, U+205F, U+3000
 */
const PG_SPACE_RE =
  /[\u0009-\u000D\u0020\u1680\u2000-\u2006\u2008-\u200A\u2028\u2029\u205F\u3000]+/g;

/**
 * DB 의 `fn_norm_supplier_name()` 과 동일한 정규화.
 * 소문자화 + 공백 제거만 한다 — 법인 마커 등 의미 변형은 하지 않는다.
 * over-normalization 은 서로 다른 업체를 합칠 위험이 있다.
 *
 * @param {string} raw
 * @returns {string}
 */
export function normSupplierName(raw) {
  return String(raw ?? "").replace(PG_SPACE_RE, "").toLowerCase();
}

// ============================================================
// 매칭
// ============================================================

/** `matcher.js` 의 수종 임계값과 같은 값이지만 별개로 둔다 —
 *  공급처 근거로 조정할 때 수종 매칭이 함께 움직이면 안 된다. */
export const SUPPLIER_MATCH_THRESHOLD    = 0.85;
export const SUPPLIER_POSSIBLE_THRESHOLD = 0.60;
const TOP_K = 3;

/**
 * @typedef {{supplier: object, score: number}} SupplierCandidate
 * @typedef {{
 *   status: "match" | "possible" | "new",
 *   supplier: object | null,        // status="match" 일 때만 채워진다
 *   candidates: SupplierCandidate[],// 점수 내림차순
 *   score: number,
 *   via: "exact" | "alias" | "ambiguous-alias" | "similarity" | null,
 *   norm: string                    // 정규화 결과 (alias 저장 시 그대로 쓴다)
 * }} SupplierMatchResult
 */

/**
 * OCR 상호를 공급처에 연결한다. 판정 순서:
 *
 *   ① suppliers.norm_name 완전 일치        → match  (via=exact)
 *   ② supplier_alias.norm_alias 완전 일치   → match  (via=alias)
 *       같은 alias 가 서로 다른 업체로 등록돼 있으면 자동 적용하지 않고
 *       후보만 제시한다 (OCR_DATA_POLICY §5 규칙 4 — 모호한 alias).
 *   ③ calculateSimilarity 랭킹
 *       ≥ 0.85 → match · 0.60~0.85 → possible · 그 미만 → new
 *
 * @param {string} raw                         OCR 이 읽은 상호
 * @param {Array<{id:string, name:string, norm_name?:string}>} suppliers
 * @param {Array<{norm_alias:string, supplier_id:string, is_active?:boolean}>} aliases
 * @param {{matchThreshold?:number, possibleThreshold?:number, topK?:number}} [opts]
 * @returns {SupplierMatchResult}
 */
export function matchSupplier(raw, suppliers = [], aliases = [], opts = {}) {
  const matchThreshold    = opts.matchThreshold    ?? SUPPLIER_MATCH_THRESHOLD;
  const possibleThreshold = opts.possibleThreshold ?? SUPPLIER_POSSIBLE_THRESHOLD;
  const topK              = opts.topK              ?? TOP_K;

  const norm = normSupplierName(raw);
  const list = Array.isArray(suppliers) ? suppliers.filter(Boolean) : [];
  const empty = { status: "new", supplier: null, candidates: [], score: 0, via: null, norm };
  if (!norm || !list.length) return empty;

  // ① 완전 일치 — norm_name 이 있으면 그대로, 없으면 name 에서 계산.
  //    norm_name 은 이미 정규화된 값이라 다시 통과시켜도 결과가 같다(멱등).
  const exact = list.find(s => normSupplierName(s.norm_name ?? s.name) === norm);
  if (exact) {
    return { status: "match", supplier: exact, candidates: [{ supplier: exact, score: 1 }],
             score: 1, via: "exact", norm };
  }

  // ② alias — 활성 행만. is_active 가 없으면 활성으로 본다.
  const byId = new Map(list.map(s => [s.id, s]));
  const linked = [];
  for (const a of (Array.isArray(aliases) ? aliases : [])) {
    if (!a || a.is_active === false) continue;
    if (normSupplierName(a.norm_alias) !== norm) continue;
    const s = byId.get(a.supplier_id);          // 목록에 없는 공급처는 무시
    if (s && !linked.includes(s)) linked.push(s);
  }
  if (linked.length === 1) {
    return { status: "match", supplier: linked[0], candidates: [{ supplier: linked[0], score: 1 }],
             score: 1, via: "alias", norm };
  }
  if (linked.length > 1) {
    // 같은 alias 가 여러 업체로 교정된 이력이 있다 → 사람이 고른다.
    const ranked = rank(norm, linked).slice(0, topK);
    return { status: "possible", supplier: null, candidates: ranked,
             score: ranked[0]?.score ?? 0, via: "ambiguous-alias", norm };
  }

  // ③ 유사도 랭킹
  const ranked = rank(norm, list);
  const top = ranked[0];
  if (!top || top.score < possibleThreshold) return empty;

  const candidates = ranked.filter(c => c.score >= possibleThreshold).slice(0, topK);
  return top.score >= matchThreshold
    ? { status: "match",    supplier: top.supplier, candidates, score: top.score, via: "similarity", norm }
    : { status: "possible", supplier: null,         candidates, score: top.score, via: "similarity", norm };
}

/** 정규화된 이름 기준으로 공급처를 점수 내림차순 정렬한다. */
function rank(norm, suppliers) {
  return suppliers
    .map(s => ({ supplier: s, score: calculateSimilarity(norm, normSupplierName(s.norm_name ?? s.name)) }))
    .sort((a, b) => b.score - a.score);
}
