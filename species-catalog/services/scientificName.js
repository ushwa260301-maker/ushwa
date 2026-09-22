/**
 * 학명 표기 처리 — 정규화 · canonical · 차이 분류 (T11-6.2).
 *
 * ## 왜 필요한가
 *
 * 국립수목원은 학명에 **명명자**를 붙이고 우리 `species.latin` 은 붙이지 않는다.
 *
 *     KNA   Stipa tenuissima Trin.
 *     우리   Stipa tenuissima
 *
 * 그래서 원문 완전 일치로는 4,565종 × 77종에서 **한 건도 맞지 않는다.**
 * 데이터 품질 문제가 아니라 양쪽의 표기 규칙 차이다.
 *
 * ## 명명자와 품종은 성격이 다르다
 *
 *   명명자   "누가 이 이름을 발표했는가" 라는 서지 정보다. 떼어도 **같은
 *            분류군**이다. 그래서 떼고 맞춘다.
 *   품종     **다른 분류군**이다. `Hydrangea paniculata 'Limelight'` 는 흰 꽃이
 *            연두로 물드는 품종이고 원종과 생김새가 다르다. 그래서 절대
 *            떼지 않는다 — 떼는 순간 품종에 원종 사진이 붙는다.
 *
 * 이 파일이 하는 일은 그 둘을 가르는 것 하나뿐이다.
 *
 * ## canonical 은 저장하지 않는다
 *
 * 파생값이라 DB 에 중복으로 두지 않는다. 원문(`scientific_name`)만 저장하고
 * 조회할 때 계산한다. 저장해 두면 규칙을 고칠 때마다 전량 재계산해야 하고,
 * 그 사이 원문과 어긋난 값이 남는다.
 */

/** 공백만 정리한다. 대소문자·명명자 표기는 건드리지 않는다. */
export function normalizeScientificName(name) {
  return String(name ?? "").trim().replace(/\s+/g, " ");
}

/** 계급 표시. 뒤에 오는 소명은 분류군의 일부라 반드시 남긴다. */
const RANK = new Set([
  "subsp.", "subsp", "ssp.", "ssp", "var.", "var", "subvar.", "subvar",
  "f.", "forma", "subf.", "subf", "cv.", "sect.", "ser.", "nothosubsp."
]);

/** 교배종 기호. `x` 와 `×` 는 같은 것을 뜻한다 — 문자 인코딩 차이일 뿐이다. */
const HYBRID = new Set(["×", "✕", "x", "X"]);

/** 명명자를 잇는 말. 여기서부터는 분류군 이름이 아니다. */
const CONNECTOR = new Set(["&", "ex", "et", "and", "in"]);

/** 전부 소문자인 토큰만 종소명으로 본다. 명명자는 대문자로 시작한다. */
const EPITHET = /^[a-zà-öø-ÿœæ][a-zà-öø-ÿœæ-]*$/;

/** 품종명 — 따옴표로 묶인 부분. 여는·닫는 따옴표 모양이 달라도 받는다. */
const CULTIVAR = /['"‘“]([^'"‘’“”]*)['"’”]/g;

/**
 * 품종명을 꺼낸다. 없으면 빈 문자열.
 * 작은따옴표 한 쌍으로 정규화해 돌려준다 — `'Mount Fuji'`.
 */
export function cultivarOf(name) {
  const found = [];
  String(name ?? "").replace(CULTIVAR, (_, v) => {
    const t = String(v).trim();
    if (t) found.push(`'${t}'`);
    return " ";
  });
  return found.join(" ");
}

/**
 * 명명자를 뗀 학명. **품종·계급·교배종 기호는 남긴다.**
 *
 *   Stipa tenuissima Trin.                        → Stipa tenuissima
 *   Pinus densiflora Siebold & Zucc.              → Pinus densiflora
 *   Acer palmatum var. dissectum (Thunb.) K.Koch  → Acer palmatum var. dissectum
 *   Spiraea thunbergii 'Mount Fuji'               → Spiraea thunbergii 'Mount Fuji'
 *   Abies x koreana E.H.Wilson                    → Abies × koreana
 *   Hosta 'Frances Williams'                      → Hosta 'Frances Williams'
 *
 * 품종명을 **먼저** 떼어 보관하는 이유는 `Genus species Author 'Cultivar'` 처럼
 * 명명자 뒤에 오는 표기가 있기 때문이다. 순서대로 훑으면 명명자에서 멈추면서
 * 품종명까지 잃는다 — 그러면 품종이 원종으로 둔갑한다.
 */
export function canonicalScientificName(name) {
  const cultivar = cultivarOf(name);

  let s = normalizeScientificName(name).replace(CULTIVAR, " ");
  // 괄호는 기본명 저자다 — (Thunb.) 처럼. 통째로 뺀다.
  s = normalizeScientificName(s.replace(/\([^)]*\)/g, " "));
  if (!s) return cultivar;

  const tokens = s.split(" ");
  const out = [tokens[0]];          // 속명은 언제나 남는다
  let keepNext = false;             // 계급 표시·교배종 기호 바로 뒤는 소명이다

  for (const t of tokens.slice(1)) {
    if (HYBRID.has(t)) { out.push("×"); keepNext = true; continue; }
    const low = t.toLowerCase();
    if (RANK.has(low)) { out.push(low); keepNext = true; continue; }
    if (keepNext) { out.push(t); keepNext = false; continue; }
    if (CONNECTOR.has(low)) break;
    if (!EPITHET.test(t)) break;    // 대문자로 시작하면 명명자다
    out.push(t);
  }

  return [out.join(" "), cultivar].filter(Boolean).join(" ");
}

/**
 * 조회 키. canonical 을 소문자로 내린다.
 *
 * 대소문자만 다른 **서로 다른 분류군은 존재하지 않는다** — 속명은 대문자,
 * 종소명은 소문자라는 규약이 있어서 차이가 나면 표기 실수다. 그래서 조회에서는
 * 무시해도 안전하다. 반대로 명명자 축약(`Ser.` ↔ `ser.`)은 canonical 단계에서
 * 이미 떨어져 나가므로 여기까지 오지 않는다.
 */
export function canonicalKey(name) {
  return canonicalScientificName(name).toLowerCase();
}

/**
 * 종 수준 이름 — 속명 + (교배종 기호) + 첫 종소명. 품종·계급은 뺀다.
 * "같은 종의 다른 하위 분류군인가"를 묻기 위한 것이다.
 */
export function baseName(name) {
  const parts = canonicalScientificName(name)
    .replace(/'[^']*'/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  const out = [parts[0]];
  let i = 1;
  if (parts[i] === "×") { out.push("×"); i++; }
  if (parts[i]) out.push(parts[i]);
  return out.join(" ");
}

/** 종 수준 조회 키. */
export function baseKey(name) {
  return baseName(name).toLowerCase();
}

/**
 * 두 학명의 관계.
 *
 *   EXACT             원문이 같다
 *   AUTHOR_ONLY       명명자(와 표기)만 다르다 → **같은 분류군, 자동 연결 가능**
 *   CULTIVAR          같은 종의 다른 하위 분류군 → **자동 연결 금지**
 *   POSSIBLE_SYNONYM  종 수준부터 다르다 → 동의어·학명 변경 후보
 *
 * POSSIBLE_SYNONYM 은 "동의어다" 가 아니라 **"문자열로는 판정할 수 없다"** 는
 * 뜻이다. 실제 판정 근거는 KNA `scnmSearch` 의 `stpltScnmRltnCdNm`(정명/이명)
 * 뿐이고, 그건 조회해야 알 수 있다. 여기서 추측하지 않는다.
 */
export const MATCH_CLASS = {
  EXACT:            "EXACT",
  AUTHOR_ONLY:      "AUTHOR_ONLY",
  CULTIVAR:         "CULTIVAR",
  POSSIBLE_SYNONYM: "POSSIBLE_SYNONYM"
};

/** 자동 연결해도 되는 등급. 품종은 사람이 확인한다. */
export const AUTO_LINKABLE = new Set([MATCH_CLASS.EXACT, MATCH_CLASS.AUTHOR_ONLY]);

export function classifyDifference(a, b) {
  const na = normalizeScientificName(a), nb = normalizeScientificName(b);
  if (!na || !nb) return MATCH_CLASS.POSSIBLE_SYNONYM;
  if (na === nb) return MATCH_CLASS.EXACT;

  const ka = canonicalKey(a);
  if (ka && ka === canonicalKey(b)) return MATCH_CLASS.AUTHOR_ONLY;

  const ba = baseKey(a);
  if (ba && ba === baseKey(b)) return MATCH_CLASS.CULTIVAR;

  return MATCH_CLASS.POSSIBLE_SYNONYM;
}

/**
 * 속명 — 조회 후보를 좁히는 데 쓴다.
 * 이것만으로 판정하지 않는다. 판정은 언제나 canonical 완전 일치다.
 */
export function genusOf(name) {
  return normalizeScientificName(name).split(" ")[0] || "";
}

const RANK_LABEL = {
  "var.": "변종", "var": "변종", "subvar.": "아변종", "subvar": "아변종",
  "subsp.": "아종", "subsp": "아종", "ssp.": "아종", "ssp": "아종",
  "f.": "품종(forma)", "forma": "품종(forma)", "subf.": "아품종", "subf": "아품종",
  "cv.": "재배품종", "sect.": "절", "ser.": "열"
};

/** canonical 안의 계급 표시. 없으면 빈 문자열. */
export function rankOf(name) {
  for (const t of canonicalScientificName(name).split(" ")) {
    if (RANK.has(t.toLowerCase())) return t.toLowerCase();
  }
  return "";
}

/** 글자가 있는데 소문자가 하나도 없다 — 대문자로만 입력된 이름. */
function allCaps(name) {
  const s = normalizeScientificName(name).replace(/[^A-Za-zÀ-ÿ]/g, "");
  return s !== "" && s === s.toUpperCase();
}

/**
 * 두 학명이 **무엇 때문에** 다른가 — 사람이 읽는 한 줄.
 *
 * 등급(`classifyDifference`)과 반드시 같은 이야기를 한다. 변종인데 "저자명"이라고
 * 적히면 검토 화면에서 잘못된 결정을 유도한다 — 설명이 판정과 어긋나면
 * 설명이 아니라 소음이다.
 */
export function describeDifference(a, b) {
  const cls = classifyDifference(a, b);
  if (cls === MATCH_CLASS.EXACT) return "";

  const na = normalizeScientificName(a), nb = normalizeScientificName(b);
  const ca = canonicalScientificName(a), cb = canonicalScientificName(b);
  const out = [];

  if (cls === MATCH_CLASS.AUTHOR_ONLY) {
    if (ca !== na || cb !== nb) out.push("명명자");
    if (ca !== cb) out.push(ca.toLowerCase() === cb.toLowerCase() ? "대소문자" : "표기");
    if (/[×✕]/.test(ca) !== /[×✕]/.test(na) || /[×✕]/.test(cb) !== /[×✕]/.test(nb)) {
      out.push("교배종 기호");
    }
    return out.length ? [...new Set(out)].join(" · ") : "표기";
  }

  if (cls === MATCH_CLASS.CULTIVAR) {
    const cvA = cultivarOf(a), cvB = cultivarOf(b);
    if (cvA !== cvB) out.push(cvA && cvB ? "서로 다른 품종" : "품종명");
    const rA = rankOf(a), rB = rankOf(b);
    if (rA !== rB) out.push(`${RANK_LABEL[rA || rB] || "하위 분류군"} 표기`);
    return out.length ? out.join(" · ") : "하위 분류군";
  }

  // POSSIBLE_SYNONYM — 문자열로는 여기까지가 한계다.
  if (allCaps(a) || allCaps(b)) return "전부 대문자 — 표기를 먼저 고쳐야 판정할 수 있음";
  if (genusOf(ca).toLowerCase() !== genusOf(cb).toLowerCase()) {
    return "속이 다름 — 학명 변경 가능성";
  }
  return "종소명이 다름 — 동의어 가능성";
}
