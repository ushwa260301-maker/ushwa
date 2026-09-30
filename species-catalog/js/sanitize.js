/**
 * sanitize.js — 저장 직전 개인정보 제거 (Domain · 순수 함수).
 *
 * 정책: Species Catalog 는 계좌번호·전화번호를 보유할 사업적 필요가 없다.
 * OCR 이 이미지에서 그 값을 **읽는 것** 은 막지 않는다 — 막는 것은
 * **읽은 결과가 장기 저장되는 것** 이다.
 *
 *   이미지 → OCR → parser → [sanitize] → 저장
 *
 * 따라서 이 모듈은 Repository 계층이 저장을 호출하기 직전에만 쓰인다.
 * vision.js 의 파싱 결과 자체는 변경하지 않으므로 OCR 회귀(ocr-accuracy)
 * 의 판정 대상은 그대로다.
 *
 * **이 모듈은 저장소를 모른다** (ARCHITECTURE.md 의존 규칙). 문자열과
 * 평범한 객체만 다루며, 호출자가 어디에 저장하는지 알지 못한다.
 *
 * 보존/제거 구분 (긴급 조치 지시 §6)
 *   제거: 계좌번호 · 전화 · 휴대폰 · 팩스 · 예금주
 *   보존: 거래처명 · 품목 · 수량 · 단가 · 공급가액 · 부가세 · 합계 · 거래일자
 *
 * 마스킹은 삭제가 아니라 **치환**이다. 자리와 줄 구조를 남겨야
 * `ocr_corrections` 가 학습 데이터로서의 가치를 유지한다 (VISION §2).
 */

/**
 * 치환 토큰. 값이 아니라 "여기에 무엇이 있었는가" 만 남긴다.
 *
 * **토큰에 한국어 라벨 단어를 넣지 않는다.** `[예금주]` 는 `예금` 을,
 * `[계좌번호]` 는 `계좌` 를 품고 있어, 이미 정제된 텍스트를 다시 정제하면
 * 토큰 자신이 계좌 라벨로 읽혀 **다음 숫자(날짜 등)를 삼켰다**
 * (2026-09-28 · 마이그레이션 2회 실행 검증에서 `2025-06-03` 소실로 발견).
 * 정제는 부팅마다 저장 데이터에 다시 적용되므로(scrubStoredData) 반드시
 * 멱등이어야 한다 — tests/sanitize.mjs 가 이를 고정한다.
 */
export const PII_MASK = Object.freeze({
  phone:   "[PHONE]",
  account: "[ACCOUNT]",
  holder:  "[HOLDER]"
});

// ---------------------------------------------------------------------------
// 패턴
// ---------------------------------------------------------------------------

/**
 * 전화(유선·휴대폰·팩스·대표번호).
 *
 * 구분자로 **공백을 허용하지 않는다.** vision.js:65-76 이 기록한 실환경
 * 사고가 이유다 — 금액 나열 `0 3200 1600` 이 전화로 오인되어 가짜 품목
 * 행을 만들었다. 하이픈/점만 허용하면 그 오탐이 생기지 않는다.
 * `(02) 1234-5678` 형태만 괄호 대안으로 따로 받는다.
 *
 * 앞뒤 `(?<![\d-])` / `(?![\d-])` 로 더 긴 숫자열의 일부를 잘라내지 않는다.
 */
const PHONE_RE = /(?<![\d-])(?:\(0\d{1,2}\)\s?|0\d{1,2}[-.]?)\d{3,4}[-.]?\d{4}(?![\d-])/g;

/** 하이픈 구분 숫자 그룹 3~4개 — 계좌번호 후보. 은행별 자릿수가 달라 폭넓게 잡고 아래에서 걸러낸다. */
const ACCOUNT_CANDIDATE_RE = /(?<![\d-])\d{2,6}(?:-\d{2,6}){2,3}(?![\d-])/g;

/** 사업자등록번호 3-2-5. 계좌가 아니므로 제외한다. */
const BIZNO_RE = /^\d{3}-\d{2}-\d{5}$/;

/**
 * `계좌`/`예금` 라벨 뒤에 오는 숫자열 — 공백 구분 등 위 패턴이 놓치는 형태를 잡는다.
 *
 * - 채움 구간(`번호 `, ` 국민 ` 등)에서 **숫자를 제외**한다. 제외하지 않으면
 *   탐욕 매치가 계좌 앞자리를 라벨로 먹어 일부가 노출된다
 *   (`계좌번호 1002 123 …` → `1002 1` 잔존 · tests/sanitize.mjs).
 * - **줄을 넘지 않는다** (`\s` 대신 `[ \t]`). 넘으면 라벨 다음 줄의 날짜·
 *   금액을 계좌로 삼킨다.
 * - `예금주` 는 예금주(이름) 라벨이지 계좌 라벨이 아니다 → `예금(?!주)`.
 *   그러지 않으면 `예금주 김철수 2025-06-03` 의 날짜를 삼킨다.
 */
const ACCOUNT_LABELLED_RE = /((?:계\s*좌|예\s*금(?!\s*주))[^\n:：\d]{0,10}[:：]?[ \t]*)(\d[\d \t-]{8,})/g;

/** `예금주: 홍길동` — 라벨은 남기고 이름만 치환한다. */
const HOLDER_RE = /((?:예\s*금\s*주|수\s*취\s*인)\s*[:：]?\s*)([가-힣]{2,4})/g;

/** 계좌 후보의 자릿수 범위. 국내 계좌는 10~16자리다. */
const ACCOUNT_MIN_DIGITS = 10;
const ACCOUNT_MAX_DIGITS = 16;

const digitCount = s => (s.match(/\d/g) || []).length;

/**
 * 계좌번호로 판정할지 결정한다.
 * 날짜(`2025-07-18`, 8자리)는 자릿수로, 사업자등록번호는 형식으로 걸러진다.
 */
function isAccountNumber(token) {
  if (BIZNO_RE.test(token)) return false;
  const n = digitCount(token);
  return n >= ACCOUNT_MIN_DIGITS && n <= ACCOUNT_MAX_DIGITS;
}

// ---------------------------------------------------------------------------
// 공개 API
// ---------------------------------------------------------------------------

/**
 * 자유 텍스트(OCR 원문·정규화문)에서 개인정보를 치환한다.
 *
 * **순서가 중요하다.** 전화를 먼저 치환해야 `010-1234-5678` 같은 값이
 * 계좌 후보로 다시 잡히지 않는다.
 *
 * @param {string} text
 * @returns {string}
 */
export function sanitizeText(text) {
  if (typeof text !== "string" || !text) return text === undefined ? "" : text;

  let out = text.replace(PHONE_RE, PII_MASK.phone);

  out = out.replace(ACCOUNT_LABELLED_RE, (_m, label) => `${label}${PII_MASK.account}`);
  out = out.replace(ACCOUNT_CANDIDATE_RE, m => (isAccountNumber(m) ? PII_MASK.account : m));
  out = out.replace(HOLDER_RE, (_m, label) => `${label}${PII_MASK.holder}`);

  return out;
}

/**
 * 연락처 필드를 비운다. 부분 마스킹이 아니라 **빈 문자열**이다 —
 * 이 필드는 보유하지 않기로 한 값이라 흔적을 남길 이유가 없다.
 * @param {*} _value
 * @returns {string}
 */
export function dropContact(_value) {
  return "";
}

/** 이 이름의 키는 위치와 무관하게 값을 비운다 — 연락처 필드. */
const CONTACT_KEYS = new Set(["contact", "supplierPhone", "phone"]);

/**
 * 객체 트리를 제자리에서 정제한다.
 *
 * - 연락처 키(CONTACT_KEYS) → 빈 문자열
 * - `scrubStrings` 가 참이면 나머지 모든 문자열 → sanitizeText
 *   단 `data:` URL(전처리 미리보기 base64)은 건너뛴다. base64 안의 숫자열이
 *   전화 형식과 우연히 맞으면 치환이 이미지를 깨뜨린다.
 *
 * **필드 이름을 하나씩 나열하지 않는 이유**: 1차 구현은 `raw.text` /
 * `raw.normalized` 만 정제했고, 브라우저 E2E 검증에서 `raw.lowConfidenceLines[].text`
 * (저신뢰 OCR 줄 원문)와 Mock 의 `raw.supplier.contact` 가 그대로 저장되는 것이
 * 드러났다. `_debug` 는 진단용이라 형태가 계속 바뀐다 — 전체를 걷는다.
 */
function scrubTree(node, scrubStrings) {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      if (typeof node[i] === "string") {
        if (scrubStrings && !node[i].startsWith("data:")) node[i] = sanitizeText(node[i]);
      } else if (node[i] && typeof node[i] === "object") {
        scrubTree(node[i], scrubStrings);
      }
    }
    return;
  }
  for (const [k, v] of Object.entries(node)) {
    if (CONTACT_KEYS.has(k) && (typeof v === "string" || v == null)) {
      node[k] = dropContact(v);
    } else if (typeof v === "string") {
      if (scrubStrings && !v.startsWith("data:")) node[k] = sanitizeText(v);
    } else if (v && typeof v === "object") {
      scrubTree(v, scrubStrings);
    }
  }
}

/**
 * OCR 분석 결과(vision.js `analyzeInvoice()` 반환값)의 저장용 사본을 만든다.
 * 원본은 변경하지 않는다 — 호출자가 화면 표시에 계속 쓰기 때문이다.
 *
 * 정제 범위
 *   `_debug` 전체   모든 문자열을 sanitizeText (원문 · 정규화문 · 저신뢰 줄 등)
 *   전체 트리       연락처 키(contact · supplierPhone · phone) → 빈 문자열
 *
 * 보존 (문자열 정제를 적용하지 않음 — 거래 데이터 오탐 방지)
 *   `rows` · `invoiceDate` · `invoiceNumber` · `supplier.name` · `supplier.region`
 *
 * @param {object|null|undefined} analysis
 * @returns {object|null|undefined} 정제된 사본
 */
export function sanitizeAnalysis(analysis) {
  if (!analysis || typeof analysis !== "object") return analysis;

  // 평범한 JSON 객체다(vision.js 산출물). 깊은 사본으로 원본 보호.
  let copy;
  try {
    copy = JSON.parse(JSON.stringify(analysis));
  } catch {
    return analysis;            // 직렬화 불가 — 건드리지 않는다
  }

  scrubTree(copy, false);                                        // 연락처 키만
  if (copy._debug && typeof copy._debug === "object") {
    scrubTree(copy._debug, true);                                // 진단 트리는 문자열까지
  }
  return copy;
}

/**
 * 거래 헤더(사용자가 확인·수정한 값)의 저장용 사본.
 * `supplierPhone` 은 보유하지 않는다.
 *
 * @param {object|null|undefined} header
 * @returns {object|null|undefined}
 */
export function sanitizeHeader(header) {
  if (!header || typeof header !== "object") return header;
  return { ...header, supplierPhone: dropContact(header.supplierPhone) };
}

/**
 * 이미 저장된 로컬 데이터(LocalStorage v2 스냅샷)를 정리한다.
 * 이 조치 이전에 저장된 거래명세서에 남아 있는 연락처와 OCR 원문을 제거한다.
 *
 * 대상
 *   invoices[].supplierPhone   → 빈 문자열
 *   invoices[].analysis        → sanitizeAnalysis
 *
 * **대상이 아닌 것**: `species[].suppliers[].contact`.
 * 사용자가 수종 편집 화면에서 직접 등록한 판매자 프로필일 수 있고, 저장된
 * 값만으로는 OCR 유래인지 사용자 등록인지 구분할 수 없다. 긴급 조치 지시
 * §6 이 사용자 등록 프로필의 임의 삭제를 금지하므로 기존 값은 건드리지 않는다.
 * (OCR 유래 신규 기록은 app.js 에서 이미 차단된다.)
 *
 * 멱등이다 — 이미 정리된 데이터에 다시 적용해도 `changed` 는 false 다.
 *
 * @param {object|null} data
 * @returns {{data: object|null, changed: boolean}}
 */
export function scrubStoredData(data) {
  if (!data || !Array.isArray(data.invoices)) return { data, changed: false };

  let changed = false;
  const invoices = data.invoices.map(inv => {
    if (!inv || typeof inv !== "object") return inv;
    let next = inv;

    if (inv.supplierPhone) {
      next = { ...next, supplierPhone: dropContact(inv.supplierPhone) };
      changed = true;
    }
    if (inv.analysis) {
      const clean = sanitizeAnalysis(inv.analysis);
      if (JSON.stringify(clean) !== JSON.stringify(inv.analysis)) {
        next = { ...next, analysis: clean };
        changed = true;
      }
    }
    return next;
  });

  return changed ? { data: { ...data, invoices }, changed } : { data, changed };
}

/**
 * 텍스트에 아직 개인정보가 남아 있는지 확인한다 (검증·테스트용).
 * @param {string} text
 * @returns {{phone:number, account:number, holder:number}}
 */
export function countPii(text) {
  if (typeof text !== "string") return { phone: 0, account: 0, holder: 0 };
  const phone = (text.match(PHONE_RE) || []).length;
  // 전화를 먼저 지운 뒤 계좌를 센다 — sanitizeText 와 같은 순서. 그러지
  // 않으면 `010-1234-5678` 이 전화 1 · 계좌 1 로 이중 집계된다.
  const rest = text.replace(PHONE_RE, PII_MASK.phone);
  const account = (rest.match(ACCOUNT_CANDIDATE_RE) || []).filter(isAccountNumber).length;
  const holder = (text.match(HOLDER_RE) || []).length;
  return { phone, account, holder };
}
