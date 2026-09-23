/**
 * knaTaxonText — 국립수목원 도감 **서술 문장**에서 값 뽑기 (T12-2).
 *
 * ## 왜 필요한가
 *
 * KNA 는 과·속은 필드로 준다. 그런데 화면이 요구하는 나머지 셋은 필드가 없다
 * (`plantResourceProvider.js` 머리말에 기록돼 있다):
 *
 *     생육형   `shpe`(형태) 문장 안
 *     개화월   `shpe` 문장 안 — **별도 필드가 없다**
 *     광조건   `grwEvrntDesc` 자연어 서술 — 비어 있는 행도 많다
 *
 * ## 추측과 인용을 가르는 선
 *
 * 이 파일이 하는 일은 **원문에 적힌 것을 옮기는 것**뿐이다.
 *
 *     "꽃은 6~7월에 핀다"        → [6, 7]      ← 원문이 말한 것. 인용이다.
 *     "낙엽 활엽 관목이다"        → "낙엽 활엽 관목"
 *     "산지 숲 속에서 자란다"     → null        ← 광 조건을 말하지 않았다
 *
 * 마지막이 중요하다. "숲 속" 을 보고 "반음지" 라고 적으면 그건 추론이고,
 * 원문에 없는 값이 DB 에 들어간다. **못 찾으면 `null` 이다.** 화면에는 `—`
 * 로 보이고, 그것이 정직하다.
 *
 * 그래서 적재할 때 **원문도 함께 저장한다**(`shpe_raw` · `grw_evrnt_raw`).
 * 뽑은 값이 의심스러우면 사람이 원문과 대조할 수 있어야 한다. 대조할 수 없는
 * 파생값은 출처가 없는 값과 같다.
 *
 * ## 규칙을 고치면 다시 뽑는다
 *
 * 파생값은 원문에서 언제든 다시 계산된다. 원문이 정본이고 파생값은 캐시다.
 */

/** 문장 구분자. 여기서 끊어야 "꽃은 6월" 과 "열매는 9월" 이 섞이지 않는다. */
const SENTENCE = /[.。\n]+/;

/** 물결·하이픈 계열을 한 글자로 본다 — 출처마다 다른 문자를 쓴다. */
const DASH = "[~∼～〜－\\-−–—]";

/**
 * 꽃 이야기를 하는 문장만 고른다.
 *
 * `열매` · `결실` 이 든 문장은 버린다 — 거기 적힌 달은 개화월이 아니다.
 * 이 한 줄이 없으면 "열매는 9~10월에 익는다" 가 개화월로 들어간다.
 */
function floweringSentences(text) {
  return String(text ?? "").split(SENTENCE)
    .filter(s => /꽃|개화/.test(s))
    .filter(s => !/열매|결실|성숙|종자/.test(s));
}

/**
 * 개화월. 원문이 말하지 않으면 `null`.
 *
 *   "꽃은 6~7월에 피고"      → [6, 7]
 *   "개화기는 7월이다"        → [7]
 *   "꽃은 5월과 9월에 핀다"   → [5, 9]
 *   "꽃이 핀다"              → null
 *
 * @returns {number[]|null}
 */
export function floweringMonthsFrom(shpe) {
  const months = new Set();

  for (const sentence of floweringSentences(shpe)) {
    // ① 구간: 6~7월
    const range = new RegExp(`(\\d{1,2})\\s*${DASH}\\s*(\\d{1,2})\\s*월`, "g");
    let m;
    while ((m = range.exec(sentence))) {
      const a = Number(m[1]), b = Number(m[2]);
      if (!valid(a) || !valid(b)) continue;
      // 11~2월 처럼 해를 넘기는 구간도 있다. 작은 쪽부터 12 를 지나 돈다.
      for (let i = 0, cur = a; i < 12; i++, cur = cur === 12 ? 1 : cur + 1) {
        months.add(cur);
        if (cur === b) break;
      }
    }

    // ② 낱개: 7월 — 구간으로 이미 읽은 자리는 지우고 센다.
    const rest = sentence.replace(range, " ");
    const single = /(\d{1,2})\s*월/g;
    while ((m = single.exec(rest))) {
      const v = Number(m[1]);
      if (valid(v)) months.add(v);
    }
  }

  return months.size ? [...months].sort((a, b) => a - b) : null;
}

const valid = n => Number.isInteger(n) && n >= 1 && n <= 12;

/**
 * 생육형 — 원문에 실제로 쓰인 낱말만 조합한다.
 *
 * 순서는 한국어 도감 표기를 따른다: `낙엽 활엽 관목`.
 * 잎 성질만 있고 형태가 없으면 `null` — "낙엽" 하나로는 생육형이 아니다.
 */
const LEAF     = ["상록", "낙엽", "반상록"];
const BLADE    = ["활엽", "침엽"];
const HABIT    = ["큰키나무", "작은키나무", "소교목", "교목", "반관목", "아관목", "관목",
                  "덩굴나무", "만경목", "덩굴", "여러해살이풀", "두해살이풀", "한해살이풀",
                  "다년초", "이년초", "일년초", "多年草", "초본", "수생식물", "양치식물"];

export function growthFormFrom(shpe) {
  const text = String(shpe ?? "");
  const habit = HABIT.find(w => text.includes(w));
  if (!habit) return null;                    // 형태를 말하지 않았다

  const parts = [
    LEAF.find(w => text.includes(w)),
    BLADE.find(w => text.includes(w)),
    habit
  ].filter(Boolean);

  return parts.join(" ");
}

/**
 * 광 조건 — 원문이 광 조건을 **말했을 때만** 돌려준다.
 *
 * "산지 숲 속에서 자란다" 는 서식지 서술이지 광 조건이 아니다. 거기서
 * "반음지" 를 끌어내면 추론이다. `null` 을 돌려주고 화면은 `—` 로 둔다.
 *
 * 긴 낱말을 먼저 찾는다 — "반양지" 가 "양지" 로 잘리면 뜻이 뒤집힌다.
 */
const LIGHT = ["반양지", "반음지", "중생지", "양지", "음지"];

export function sunlightFrom(growthEnvironmentDesc) {
  const text = String(growthEnvironmentDesc ?? "");
  const found = [];
  for (const w of LIGHT) {
    if (!text.includes(w)) continue;
    // "반양지" 를 이미 담았으면 그 안의 "양지" 를 또 담지 않는다.
    if (found.some(f => f.includes(w))) continue;
    found.push(w);
  }
  return found.length ? found.join(" · ") : null;
}

/**
 * 도감 상세 응답 1건 → `plant_taxa` 행.
 *
 * **원문을 함께 싣는다.** 파생값만 저장하면 뽑기 규칙을 고쳤을 때 다시 계산할
 * 근거가 사라지고, 값이 틀렸는지 확인할 방법도 없어진다.
 *
 * 학명이 없으면 `null` — 학명은 `plant_images` 와 잇는 유일한 열쇠라, 없으면
 * 어디에도 붙지 못하는 행이 된다.
 *
 * @param {object} row  `plantResourceProvider.mapDetailRow()` 결과
 * @param {{syncedAt?:string}} [meta]
 */
export function toTaxonRow(row, meta = {}) {
  if (!row || typeof row !== "object") return null;

  const scientific_name = String(row.scientificName ?? "").trim();
  if (!scientific_name) return null;

  const shpe = row.formRaw ?? "";
  const env  = row.growthEnvironmentRaw ?? "";

  // `plant_taxa` 가 가진 컬럼만 만든다. 표에 없는 칸을 여기서 채우면
  // 적재가 조용히 실패하거나 값이 버려진다.
  return {
    scientific_name,
    korean_name:      String(row.koreanName ?? "").trim(),
    family:           String(row.familyNameKo ?? "").trim(),
    genus:            String(row.genusNameKo ?? "").trim(),

    growth_form:      growthFormFrom(shpe),
    sunlight:         sunlightFrom(env),
    flowering_months: floweringMonthsFrom(shpe),

    shpe_raw:         String(shpe).trim() || null,      // 대조용 원문
    grw_evrnt_raw:    String(env).trim() || null,

    synced_at: meta.syncedAt ?? new Date().toISOString()
  };
}

/**
 * 화면이 요구하는 셋을 다 채웠는가 — 적재 후 **무엇이 비었는지** 세는 데 쓴다.
 *
 * T12-2 완료 기준이 "빈칸이면 PASS 아님" 이므로, 적재가 끝난 뒤 이 판정으로
 * 몇 종이 기준을 만족하는지 먼저 알아야 한다. 화면에서 하나씩 확인할 수 없다.
 */
export function isDisplayComplete(taxonRow) {
  if (!taxonRow) return false;
  return !!(taxonRow.family && taxonRow.genus &&
            taxonRow.growth_form && taxonRow.sunlight &&
            Array.isArray(taxonRow.flowering_months) && taxonRow.flowering_months.length);
}
