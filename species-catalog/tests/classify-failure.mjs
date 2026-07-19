/**
 * OCR / Parser / Matcher — 실패 원인 자동 분류기.
 *
 *   npm run regression 시점에 comparator 가 이미 `pass=false` 로 판정한
 *   필드에 대해서만 호출됩니다. **PASS 결과는 절대 바꾸지 않음** — 실패 원인
 *   태그만 추가로 계산합니다.
 *
 * 판정 3-tier + Ambiguous + PASS/Matcher 는 field 단위로 독립 실행:
 *
 *     OCR raw 안에 expected 가 있는가?
 *          │
 *   ┌──────┴─────────────────────┐
 *  YES (exact / sim ≥ 0.85)   NO (sim < 0.60)   PARTIAL (0.60 ≤ sim < 0.85)
 *          │                         │                    │
 *      Parser                       OCR               Ambiguous
 *   (OCR OK · parser 미추출)    (raw 에 정보 없음)   (raw 부분 훼손 +
 *                                                    parser fuzzy 미대응)
 *
 * Matcher 는 species 필드에 한해 `matcherOutput` 이 제공된 경우에만 판정.
 * 미제공 시 Matcher 는 판정 대상에서 제외 (미실행).
 *
 * 유사도는 **matcher.js 와 동일한** NFD-jamo Levenshtein 을 재사용해
 * 프로덕션 규칙과 채점 규칙이 항상 같은 metric 을 씁니다.
 *
 * 이 모듈은 어떤 실행 상태도 mutate 하지 않는 pure export.
 */

import { normalizeSpeciesName, calculateSimilarity } from "../js/matcher.js";

// ============================================================
// Thresholds — matcher.js 의 default match/possible tier 와 정렬
// ============================================================
const T_MATCH    = 0.85;
const T_POSSIBLE = 0.60;

/**
 * @typedef {"text"|"date"|"digits"|"number"|"species"} FieldKind
 *
 * text    — supplier.name / supplier.region / invoiceNumber / spec / …
 * date    — invoiceDate (YYYY-MM-DD 등)
 * digits  — supplier.contact (하이픈/공백 차이 무시하고 숫자만 비교)
 * number  — rows[i].unitPrice / amount (Number equality)
 * species — rows[i].name (matcher 대상 · matcherOutput 있을 때 Matcher 판정)
 */

/**
 * @typedef {Object} FailureVerdict
 * @property {"PASS"|"OCR"|"Parser"|"Matcher"|"Ambiguous"} verdict
 * @property {Object} evidence
 * @property {string} reason        사람이 읽는 한 줄 요약
 */

/**
 * 한 필드의 실패 원인을 분류.
 *
 * @param {Object} input
 * @param {string}   input.fieldPath      "supplier.name" | "invoiceDate" | "rows[0].name" 등
 * @param {FieldKind} input.fieldKind
 * @param {any}      input.expected       fixture 의 정답 값
 * @param {any}      input.parsed         parser (vision.js) 출력값
 * @param {string}   input.ocrRaw         fixture.ocr — Tesseract raw text
 * @param {Object=}  input.matcherOutput  matcher.matchSpecies() 결과 (있을 때만)
 * @returns {FailureVerdict}
 */
export function classifyFieldFailure({
  fieldPath,
  fieldKind,
  expected,
  parsed,
  ocrRaw,
  matcherOutput
}) {
  const parserGotRight = parsedEqualsExpected(fieldKind, parsed, expected);
  const ev             = probeOcrForValue(fieldKind, expected, ocrRaw || "");

  // Matcher 판정은 species 필드 + matcherOutput 이 실제 제공된 경우에만.
  const matcherRan = fieldKind === "species" && matcherOutput != null;
  const matcherMapped = matcherRan
    ? String(matcherOutput?.species?.name || "").trim() === String(expected ?? "").trim()
    : null;

  const evidence = {
    fieldPath,
    fieldKind,
    expected,
    parsed,
    parserEqualsExpected: parserGotRight,
    ocr: {
      exact:      ev.exact,
      bestMatch:  ev.bestMatch,
      bestScore:  ev.bestScore,
      thresholds: { match: T_MATCH, possible: T_POSSIBLE }
    },
    matcher: {
      ran:               matcherRan,
      mappedToExpected:  matcherMapped
    }
  };

  // ---------- PASS ----------
  if (parserGotRight && (!matcherRan || matcherMapped === true)) {
    return {
      verdict: "PASS",
      evidence,
      reason: "parser (and matcher, if invoked) matches expected"
    };
  }

  // ---------- Matcher ----------
  if (parserGotRight && matcherRan && matcherMapped === false) {
    return {
      verdict: "Matcher",
      evidence,
      reason: `parser produced ${JSON.stringify(parsed)} correctly but matcher mapped to ${JSON.stringify(matcherOutput?.species?.name ?? null)}`
    };
  }

  // ---------- Parser (OCR exact substring 또는 유사도 ≥ match) ----------
  if (ev.exact) {
    return {
      verdict: "Parser",
      evidence,
      reason: `OCR raw contains "${expected}" as exact substring; parser produced ${JSON.stringify(parsed)}`
    };
  }
  if (ev.bestScore >= T_MATCH) {
    return {
      verdict: "Parser",
      evidence,
      reason: `OCR raw has near-perfect match "${ev.bestMatch}" (sim=${ev.bestScore.toFixed(2)} ≥ ${T_MATCH}); parser did not extract`
    };
  }

  // ---------- Ambiguous (possible ≤ sim < match) ----------
  if (ev.bestScore >= T_POSSIBLE) {
    return {
      verdict: "Ambiguous",
      evidence,
      reason: `OCR raw has partial match "${ev.bestMatch}" (sim=${ev.bestScore.toFixed(2)} ∈ [${T_POSSIBLE}, ${T_MATCH})); OCR mangled the token AND parser did not fuzzy-recover — 단정하지 않음`
    };
  }

  // ---------- OCR ----------
  return {
    verdict: "OCR",
    evidence,
    reason: `OCR raw does not contain "${expected}" (best fuzzy match ${JSON.stringify(ev.bestMatch)} sim=${ev.bestScore.toFixed(2)} < ${T_POSSIBLE})`
  };
}

// ============================================================
// Parser output ↔ expected comparator (kind 별)
// runner 의 comparator 와 동일 로직 — pass/fail 판정 자체를 바꾸지 않음
// ============================================================

function parsedEqualsExpected(kind, parsed, expected) {
  if (kind === "digits") {
    const dp = String(parsed ?? "").replace(/\D/g, "");
    const de = String(expected ?? "").replace(/\D/g, "");
    return !!de && dp === de;
  }
  if (kind === "number") {
    return Number(parsed) === Number(expected);
  }
  return String(parsed ?? "").trim() === String(expected ?? "").trim();
}

// ============================================================
// OCR-presence probe — raw 안에 expected 정보가 있는지
// ============================================================

/**
 * @returns {{exact:boolean, bestMatch:string, bestScore:number}}
 *   exact      — raw 에 expected 가 (해당 kind 의 정규화 후) exact substring 이면 true
 *   bestScore  — fuzzy 최대 유사도 (exact 매치 시 1)
 *   bestMatch  — 그 유사도를 낸 raw 내 substring / token
 */
function probeOcrForValue(kind, expected, raw) {
  const exp = String(expected ?? "").trim();
  if (!exp) return { exact: false, bestMatch: "", bestScore: 0 };

  // 숫자 계열 — 하이픈/구두점 제거 후 digit-only projection 에서 비교
  if (kind === "digits" || kind === "date" || kind === "number") {
    const eDigits = exp.replace(/\D/g, "");
    if (!eDigits) return { exact: false, bestMatch: "", bestScore: 0 };
    const rDigits = String(raw).replace(/\D/g, "");
    if (rDigits.includes(eDigits)) {
      return { exact: true, bestMatch: eDigits, bestScore: 1 };
    }
    return sliderFuzzy(rDigits, eDigits, /* jitter */ 2);
  }

  // 수종 (species) — matcher.js 의 normalizeSpeciesName 로 양변 정규화
  if (kind === "species") {
    const eN = normalizeSpeciesName(exp);
    const rN = normalizeSpeciesName(String(raw));
    if (eN && rN.includes(eN)) {
      return { exact: true, bestMatch: eN, bestScore: 1 };
    }
    return hangulTokenFuzzy(raw, eN, /* isNormalized */ true);
  }

  // 일반 텍스트 — 원본 그대로 substring · 없으면 Hangul token/window fuzzy
  if (raw.includes(exp)) {
    return { exact: true, bestMatch: exp, bestScore: 1 };
  }
  return hangulTokenFuzzy(raw, exp, /* isNormalized */ false);
}

// ============================================================
// Fuzzy 매칭 — NFD-jamo Levenshtein (calculateSimilarity 재사용)
// ============================================================

/** 임의 문자열 haystack 안에서 needle 과 유사한 substring 을 슬라이딩 윈도우로 찾음. */
function sliderFuzzy(haystack, needle, jitter = 0) {
  if (!needle || !haystack) return { exact: false, bestMatch: "", bestScore: 0 };
  const k0 = Math.max(1, needle.length - jitter);
  const k1 = needle.length + jitter;
  let best = { exact: false, bestMatch: "", bestScore: 0 };
  for (let k = k0; k <= k1 && k <= haystack.length; k++) {
    for (let i = 0; i + k <= haystack.length; i++) {
      const w = haystack.substr(i, k);
      const s = calculateSimilarity(w, needle);
      if (s > best.bestScore) best = { exact: false, bestMatch: w, bestScore: s };
    }
  }
  return best;
}

/**
 * Hangul 텍스트에 특화된 fuzzy 검색:
 *   ① raw 안의 각 한글 토큰 (`[가-힣]+`) 을 needle 과 비교
 *   ② 다시 raw 전체를 normalizeSpeciesName 로 눌러 붙인 뒤 슬라이딩 윈도우
 *      (공백/개행 사이에 걸친 매치 — e.g. `문명석 대림원예가듣센테` — 회수)
 */
function hangulTokenFuzzy(raw, needle, isNormalized) {
  const nl = isNormalized ? needle : normalizeSpeciesName(String(needle));
  if (!nl) return { exact: false, bestMatch: "", bestScore: 0 };
  let best = { exact: false, bestMatch: "", bestScore: 0 };

  const rawStr = String(raw);
  const tokens = rawStr.match(/[가-힣]+/g) || [];
  for (const tok of tokens) {
    const tn = normalizeSpeciesName(tok);
    if (!tn) continue;
    const s = calculateSimilarity(tn, nl);
    if (s > best.bestScore) best = { exact: false, bestMatch: tok, bestScore: s };
  }

  const rN = normalizeSpeciesName(rawStr);
  const k0 = Math.max(1, nl.length - 2);
  const k1 = nl.length + 2;
  for (let k = k0; k <= k1 && k <= rN.length; k++) {
    for (let i = 0; i + k <= rN.length; i++) {
      const w = rN.substr(i, k);
      const s = calculateSimilarity(w, nl);
      if (s > best.bestScore) best = { exact: false, bestMatch: w, bestScore: s };
    }
  }
  return best;
}
