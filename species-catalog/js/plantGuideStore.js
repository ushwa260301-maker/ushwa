/**
 * plantGuideStore — 도감(Plant Guide) 참고 데이터 저장소 (Repository 계층).
 *
 * 설계 근거: PLANT_GUIDE.md
 *
 * 성격
 *   · **읽기 전용**. 도감은 참고 데이터이며 사용자가 편집하지 않는다.
 *   · 정적 JSON(`data/plant-guide/*.json`)을 fetch 해 **메모리에만** 보관한다.
 *     - LocalStorage 사용 안 함 (운영 데이터 스키마와 분리 · 5MB 한도 무관)
 *     - Cloud 사용 안 함 · Sync(pending) 대상 아님
 *   · **지연 로드**: 앱 부팅 시 아무것도 하지 않는다. 도감을 실제로 조회하는
 *     시점에 load() 가 호출될 때만 네트워크 요청이 발생한다(평상시 0 비용).
 *
 * Species 와의 관계
 *   · 이 파일은 Species/Invoice/state/UI 를 모른다 — 참조도 하지 않는다.
 *   · 승격(promotion)은 호출자(app.js)의 책임이며 여기서는 조회만 제공한다.
 *
 * matcher.js 는 **import 만** 한다 (수정하지 않음).
 */

import { normalizeSpeciesName, calculateSimilarity } from "./matcher.js";

const BASE = "data/plant-guide";
const INDEX_FILE = `${BASE}/index.json`;

/** @type {{loaded:boolean, entries:Array<object>, index:Array<object>}} */
const cache = { loaded: false, entries: [], index: [] };

/** 이미 진행 중인 로드가 있으면 그 Promise 를 재사용 (중복 fetch 방지). */
let loadingPromise = null;

/**
 * 도감 데이터를 메모리로 로드한다. 이미 로드됐으면 즉시 반환.
 * 실패해도 throw 하지 않는다 — 도감은 부가 기능이므로 앱을 막지 않는다.
 *
 * @returns {Promise<{ok:boolean, count:number, error?:string}>}
 */
export async function load() {
  if (cache.loaded) return { ok: true, count: cache.entries.length };
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      const idxRes = await fetch(INDEX_FILE);
      if (!idxRes.ok) throw new Error(`index.json ${idxRes.status}`);
      const idx = await idxRes.json();
      const files = Array.isArray(idx.files) ? idx.files : [];

      const pages = await Promise.all(files.map(async f => {
        const res = await fetch(`${BASE}/${f.file}`);
        if (!res.ok) throw new Error(`${f.file} ${res.status}`);
        return res.json();
      }));

      const entries = [];
      pages.forEach((page, pageIdx) => {
        const list = Array.isArray(page.species) ? page.species : [];
        list.forEach((raw, i) => entries.push(toGuideRecord(raw, files[pageIdx], i)));
      });

      cache.entries = entries;
      cache.index = entries.map(e => ({
        id: e.id,
        nameKey: normalizeSpeciesName(e.name),
        latinKey: String(e.scientific_name || "").toLowerCase()
      }));
      cache.loaded = true;
      console.info("[guide] loaded:", entries.length, "종");
      return { ok: true, count: entries.length };
    } catch (err) {
      console.warn("[guide] load failed:", err?.message || err);
      return { ok: false, count: 0, error: err?.message || String(err) };
    } finally {
      loadingPromise = null;
    }
  })();

  return loadingPromise;
}

/**
 * 도감 검색. 국명 부분일치 → 학명 부분일치 → NFD-자모 유사도 순으로 평가하고
 * 점수 내림차순으로 반환한다.
 *
 * @param {string} query
 * @param {{limit?:number, threshold?:number}} [opts]
 * @returns {Promise<Array<object & {_score:number, _via:string}>>}
 */
export async function search(query, opts = {}) {
  const limit = Number.isFinite(opts.limit) ? opts.limit : 30;
  const threshold = Number.isFinite(opts.threshold) ? opts.threshold : 0.6;

  const q = String(query ?? "").trim();
  if (!q) return [];

  const res = await load();
  if (!res.ok) return [];

  const qName = normalizeSpeciesName(q);
  const qLatin = q.toLowerCase();
  const out = [];

  for (let i = 0; i < cache.index.length; i++) {
    const key = cache.index[i];
    let score = 0;
    let via = "";

    if (qName && key.nameKey.includes(qName)) {           // ① 국명 부분일치
      score = key.nameKey === qName ? 1 : 0.9;
      via = "name";
    } else if (qLatin && key.latinKey.includes(qLatin)) {  // ② 학명 부분일치
      score = key.latinKey === qLatin ? 1 : 0.85;
      via = "scientific_name";
    } else if (qName) {                                    // ③ NFD-자모 유사도
      const sim = calculateSimilarity(qName, key.nameKey);
      if (sim >= threshold) { score = sim; via = "similarity"; }
    }

    if (score > 0) out.push({ ...cache.entries[i], _score: score, _via: via });
  }

  out.sort((a, b) => b._score - a._score || a.id.localeCompare(b.id));
  return out.slice(0, limit);
}

/**
 * id 로 도감 항목 1건 조회 (Species.guide_id 로 원본을 되찾을 때 사용).
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getById(id) {
  if (!id) return null;
  const res = await load();
  if (!res.ok) return null;
  return cache.entries.find(e => e.id === id) || null;
}

/**
 * 로드된 전체 목록(복사본). 로드 전이면 빈 배열.
 * @returns {Array<object>}
 */
export function listLoaded() {
  return cache.entries.slice();
}

/** 로드 여부·건수 (디버그·상태 표시용). */
export function status() {
  return { loaded: cache.loaded, count: cache.entries.length };
}

// ============================================================
// 내부
// ============================================================

/**
 * 페이지 파일의 레코드를 도감 표준 shape 로 정규화한다.
 * id 가 없으면 `pg-<page>-<nn>` 규칙으로 생성한다(PLANT_GUIDE.md §1).
 * 운영 데이터(가격·공급처·거래)는 어떤 경우에도 담지 않는다.
 */
function toGuideRecord(raw, fileMeta, seq) {
  const page = Number(raw.page) || (fileMeta?.pages?.[0] ?? 0);
  const id = raw.id || `pg-${page}-${String(seq + 1).padStart(2, "0")}`;
  return {
    id,
    name:             raw.name || "",
    scientific_name:  raw.scientific_name || "",
    flowering_start:  raw.flowering_start ?? null,
    flowering_end:    raw.flowering_end ?? null,
    height:           raw.height || "",
    light:            raw.light || "",
    landscape_use:    raw.landscape_use || "",
    market_size:      raw.market_size || "",
    plant_density:    raw.plant_density || null,
    image_index:      raw.image_index ?? null,
    page
  };
}
