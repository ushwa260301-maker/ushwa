/**
 * Species matching engine.
 *
 * Given a raw item name extracted from an invoice (which may contain
 * typos, size specs, parentheses, or variety markers), find the
 * corresponding Species in the catalog using string-similarity.
 *
 * Verdicts (3-tier):
 *   • match    — high confidence, auto-link to that species
 *   • possible — medium confidence, ask the user which candidate
 *   • new      — low or no confidence, treat as a new species
 *
 * The similarity function decomposes Hangul into jamo via Unicode NFD
 * before running Levenshtein, so a single-jamo typo (왕벗나무 ↔ 왕벚나무 —
 * final consonant differs by one jamo) scores 0.90 instead of the
 * ~0.75 that character-level distance would give.
 *
 * All functions are pure: no state, no DOM, no side effects.
 */

// ============================================================
// Normalization
// ============================================================

// Size markers used in nursery invoices: R6, R8, H1.2, W0.8, B10, D3 …
// Match anywhere in the string — the marker's Latin letter is unambiguous
// because Hangul species names never contain bare R/H/B/W/D followed by digits.
const SPEC_RE     = /(?:R|H|B|W|D)\s?\d+(?:\.\d+)?(?:cm|㎝|mm|㎜|m)?/gi;
// Count/unit markers: 3분, 5포트, 2주 … also match when jammed against Hangul.
const COUNT_RE    = /\d+\s*(?:분|포트|주|본|치|그루|개|EA)/gi;
// Parenthesized notes: (신품종), [3년생], （수경재배） …
const PAREN_RE    = /[\(\[\{（［｛][^\)\]\}）］｝]*[\)\]\}）］｝]/g;
// Variety markers commonly used inline: 신품종개나리 → 개나리, 재래종 …
const VARIETY_RE  = /(?:신품종|재래종|외래종|변종|잡종)/g;

/**
 * Canonicalize a raw species name so cosmetic differences don't affect
 * similarity scoring.
 *
 *   1. Strip parenthesized/bracketed content       "(신품종)" → " "
 *   2. Strip size markers                          "R6 H1.2" → " "
 *   3. Strip count markers                         "3분 5포트" → " "
 *   4. Strip variety markers                       "신품종개나리" → "개나리"
 *   5. Strip whitespace                            " 왕 벚 나 무 " → "왕벚나무"
 *   6. Lower-case Latin letters (Hangul unaffected)
 *
 * @param {string} raw
 * @returns {string} canonicalized name (may be "")
 */
export function normalizeSpeciesName(raw) {
  return String(raw ?? "")
    .replace(PAREN_RE,   " ")
    .replace(SPEC_RE,    " ")
    .replace(COUNT_RE,   " ")
    .replace(VARIETY_RE, " ")
    .replace(/\s+/g, "")
    .toLowerCase();
}

// ============================================================
// Similarity
// ============================================================

/**
 * Iterative Levenshtein edit distance (two-row DP).
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const n = b.length;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      const del = prev[j] + 1;
      const ins = curr[j - 1] + 1;
      const sub = prev[j - 1] + cost;
      curr[j] = del < ins ? (del < sub ? del : sub) : (ins < sub ? ins : sub);
    }
    const tmp = prev; prev = curr; curr = tmp;
  }
  return prev[n];
}

/**
 * Similarity in [0, 1] using jamo-level Levenshtein.
 *
 * Both inputs are Unicode NFD-decomposed so a precomposed Hangul syllable
 * expands into 2-3 jamo code points; this lets a single-jamo typo cost 1
 * instead of the ~3 it would cost at the syllable level.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function calculateSimilarity(a, b) {
  const A = String(a ?? "").normalize("NFD");
  const B = String(b ?? "").normalize("NFD");
  if (!A.length && !B.length) return 1;
  if (!A.length || !B.length) return 0;
  const d = levenshtein(A, B);
  const n = Math.max(A.length, B.length);
  return 1 - d / n;
}

// ============================================================
// Matching
// ============================================================

/**
 * @typedef {{species: object, score: number}} Candidate
 * @typedef {{
 *   status: "match" | "possible" | "new",
 *   species: object | null,   // best species when status="match"; null otherwise
 *   candidates: Candidate[],   // top-K with score ≥ possibleThreshold, best first
 *   score: number              // top score (0 when no species list)
 * }} MatchResult
 */

const DEFAULTS = {
  matchThreshold:    0.85,
  possibleThreshold: 0.60,
  topK:              3
};

/**
 * Rank every species by similarity to `rawName`; return the top-K.
 * Also applies the same normalization to each species name.
 *
 * @param {string} rawName
 * @param {Array<{id:string, name:string}>} speciesList
 * @param {{topK?:number}} [opts]
 * @returns {Candidate[]}
 */
export function findBestMatch(rawName, speciesList, opts = {}) {
  const topK = opts.topK ?? DEFAULTS.topK;
  const target = normalizeSpeciesName(rawName);
  if (!target || !Array.isArray(speciesList) || !speciesList.length) return [];
  const scored = speciesList.map(sp => ({
    species: sp,
    score: calculateSimilarity(target, normalizeSpeciesName(sp.name))
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/**
 * Classify a raw invoice name into one of three verdicts.
 *
 *   score ≥ matchThreshold    → { status:"match",    species: top, candidates, score }
 *   score ≥ possibleThreshold → { status:"possible", species: null, candidates, score }
 *   otherwise                 → { status:"new",      species: null, candidates: [], score }
 *
 * @param {string} rawName
 * @param {Array<object>} speciesList
 * @param {Partial<typeof DEFAULTS>} [opts]
 * @returns {MatchResult}
 */
export function matchSpecies(rawName, speciesList, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  if (!rawName || !String(rawName).trim()) {
    return { status: "new", species: null, candidates: [], score: 0 };
  }
  const ranked = findBestMatch(rawName, speciesList, { topK: cfg.topK });
  if (!ranked.length) {
    return { status: "new", species: null, candidates: [], score: 0 };
  }
  const top = ranked[0];
  const surviving = ranked.filter(c => c.score >= cfg.possibleThreshold);

  if (top.score >= cfg.matchThreshold) {
    return { status: "match",    species: top.species, candidates: surviving, score: top.score };
  }
  if (top.score >= cfg.possibleThreshold) {
    return { status: "possible", species: null,        candidates: surviving, score: top.score };
  }
  return { status: "new", species: null, candidates: [], score: top.score };
}
