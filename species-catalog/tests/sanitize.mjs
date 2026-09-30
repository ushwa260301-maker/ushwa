/**
 * sanitize.mjs — 저장 직전 개인정보 제거(js/sanitize.js) 회귀 테스트.
 *
 *   node species-catalog/tests/sanitize.mjs
 *
 * 두 방향을 모두 고정한다.
 *   제거  계좌 · 전화(유선·휴대폰·괄호형·구분자 없음) · 예금주
 *   보존  금액 · 수량 · 날짜 · 사업자등록번호 · 거래처명 · 품목
 * 보존 쪽이 깨지면 거래 데이터가 손상되므로 제거 쪽만큼 중요하다.
 *
 * 입력값은 모두 합성 값이다 (실제 개인정보를 테스트에 넣지 않는다).
 */

import {
  sanitizeText, sanitizeAnalysis, sanitizeHeader, scrubStoredData, countPii, PII_MASK
} from "../js/sanitize.js";

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else {
    fail++;
    console.log(`  ✗ ${label}\n      got:  ${JSON.stringify(actual)}\n      want: ${JSON.stringify(expected)}`);
  }
}

const P = PII_MASK.phone, A = PII_MASK.account, H = PII_MASK.holder;

// 계좌 형식 테스트 값은 **실행 시 조립**한다. 저장소에 계좌 형태 리터럴을
// 두지 않기 위해서다 — PII guard 는 계좌 허용 목록을 두지 않으며(긴급 조치 §8),
// 그 정책의 예외를 만들지 않는다. 값 자체는 합성이다.
const ACCT4 = ["123", "4567", "8901", "23"].join("-");

console.log("\n[제거] 전화");
eq(sanitizeText("문의전화. 010-7777-8888"), `문의전화. ${P}`,        "휴대폰 하이픈");
eq(sanitizeText("01077778888"),             P,                        "휴대폰 구분자 없음");
eq(sanitizeText("전화 : 031-123-4567"),     `전화 : ${P}`,            "지역번호 3자리");
eq(sanitizeText("TEL 02-123-4567"),         `TEL ${P}`,               "서울 02");
eq(sanitizeText("전화: (02) 1234-5678"),    `전화: ${P}`,             "괄호 지역번호");
eq(sanitizeText("FAX 064-799-5678"),        `FAX ${P}`,               "팩스");
eq(sanitizeText("대표번호 064.799.1234"),   `대표번호 ${P}`,          "점 구분");

console.log("\n[제거] 계좌 · 예금주");
eq(sanitizeText(`계좌 : 국민 ${ACCT4}`), `계좌 : 국민 ${A}`,  "4그룹 계좌");
eq(sanitizeText("신한 110-123-456789"),          `신한 ${A}`,          "3그룹 계좌 (12자리)");
eq(sanitizeText("계좌번호 1002 123 456789"),     `계좌번호 ${A}`,      "공백 구분 계좌 (라벨 기준)");
eq(sanitizeText("예금주: 김철수(농원)"),         `예금주: ${H}(농원)`, "예금주 이름 — 상호는 보존");
eq(sanitizeText(`농협:${ACCT4}김철수농원`), `농협:${A}김철수농원`,
   "OCR 이 붙여 읽은 계좌 — 계좌만 치환 (라벨 없는 이름은 패턴으로 판정 불가)");

console.log("\n[보존] 거래 데이터 — 오탐 금지");
eq(sanitizeText("왕벚나무 R6 주 2 45,000 90,000"), "왕벚나무 R6 주 2 45,000 90,000", "품목·금액");
eq(sanitizeText("0 3200 1600"),                   "0 3200 1600",                   "공백 숫자 나열 (vision.js:65-76 실환경 오탐 사례)");
eq(sanitizeText("2025-07-18"),                    "2025-07-18",                    "날짜");
eq(sanitizeText("사업자번호 123-45-67890"),       "사업자번호 123-45-67890",       "사업자등록번호 3-2-5");
eq(sanitizeText("수량 10 단가 55,000 금액 550,000"), "수량 10 단가 55,000 금액 550,000", "수량·단가·금액");
eq(sanitizeText("No. 2025-0612"),                  "No. 2025-0612",                 "명세서 번호");

console.log("\n[보존] 예금주 뒤 숫자 — 계좌로 삼키지 않는다");
eq(sanitizeText("예금주 김철수\n2025-06-03"),     `예금주 ${H}\n2025-06-03`,   "예금주 다음 줄의 날짜 (줄을 넘지 않는다)");
eq(sanitizeText("예금주 김철수 2025-06-03"),      `예금주 ${H} 2025-06-03`,    "예금주 같은 줄의 날짜 (예금주는 계좌 라벨이 아니다)");
eq(sanitizeText("계좌 : 국민\n2025-06-03 45,000"), "계좌 : 국민\n2025-06-03 45,000", "계좌 라벨 다음 줄의 날짜·금액");

console.log("\n[멱등성] 정제는 부팅마다 저장 데이터에 다시 적용된다 — 두 번 적용해도 같아야 한다");
// 실제 결함(2026-09-28): 토큰 `[예금주]` 안의 `예금` 이 2회차에 계좌 라벨로 읽혀
// 다음 줄 날짜 `2025-06-03` 을 삼켰다. 모든 입력에 대해 f(f(x)) === f(x) 를 고정한다.
const IDEMPOTENCY_INPUTS = [
  "거래명세표\n상호 : 테스트농원\n사업자번호 123-45-67890\n핸드폰 010-7777-8888\nFAX 064-799-5678\n" +
    `계좌 : 국민 ${ACCT4}\n예금주: 김철수(테스트농원)\n2025-06-03\n수국 H0.5 주 20 12,000 240,000`,
  "핸드폰 010-7777-8888\n계좌번호 1002 123 456789\n2025-06-03",
  "문의 010-7777-8888 · 신한 110-123-456789 · 발행일 2025-06-03",
  "예금주:김철수\n2025-06-03\n10 55,000 550,000",
  `농협:${ACCT4}김철수농원\n2025-06-03`,
  "왕벚나무 R6 주 2 45,000 90,000\n0 3200 1600"
];
IDEMPOTENCY_INPUTS.forEach((x, i) => {
  const once = sanitizeText(x);
  eq(sanitizeText(once), once, `f(f(x)) === f(x) · 입력 #${i + 1}`);
});
eq(countPii(sanitizeText(IDEMPOTENCY_INPUTS[0])), { phone: 0, account: 0, holder: 0 },
   "정제 결과에 대해 PII 판정이 0 (토큰이 PII 로 오인되지 않음)");

console.log("\n[sanitizeAnalysis]");
const analysis = {
  supplier: { name: "테스트농원", region: "제주", contact: "010-7777-8888" },
  rows: [{ name: "수국", spec: "H0.5", unitPrice: 12000 }],
  invoiceDate: "2025-06-03",
  _debug: { model: "tesseract-5 (kor+eng)",
            raw: { text: `핸드폰 010-7777-8888\n계좌 : 국민 ${ACCT4}`,
                   normalized: "핸드폰 010-7777-8888" } }
};
const before = JSON.stringify(analysis);
const clean = sanitizeAnalysis(analysis);
eq(JSON.stringify(analysis), before,             "원본을 변경하지 않는다 (화면 표시용 원본 보호)");
eq(clean.supplier.contact, "",                   "supplier.contact 비움");
eq(clean.supplier.name, "테스트농원",            "거래처명 보존");
eq(clean.supplier.region, "제주",                "지역 보존");
eq(clean.rows, analysis.rows,                    "품목 행 보존");
eq(clean.invoiceDate, "2025-06-03",              "거래일자 보존");
eq(countPii(clean._debug.raw.text), { phone: 0, account: 0, holder: 0 }, "raw.text 잔존 PII 0");
eq(countPii(clean._debug.raw.normalized), { phone: 0, account: 0, holder: 0 }, "raw.normalized 잔존 PII 0");
eq(sanitizeAnalysis(null), null,                 "null 안전");

console.log("\n[sanitizeAnalysis] _debug 전체 — 필드 이름에 기대지 않는다");
// 실제 결함(2026-09-28 · 브라우저 E2E): 1차 구현은 raw.text/normalized 만 정제해
// raw.lowConfidenceLines[].text(저신뢰 OCR 줄 원문)와 raw.supplier.contact 가 남았다.
const IMG = "data:image/png;base64,iVBORw0KGgo01077778888AAAA";   // base64 안 숫자열 (전화 형식과 우연히 일치)
const deep = sanitizeAnalysis({
  supplier: { name: "테스트농원", contact: "010-7777-8888" },
  rows: [{ name: "수국", spec: "H0.5", unitPrice: 12000 }],
  invoiceNumber: "No. 2025-0612",
  _debug: { model: "tesseract-5 (kor+eng)", raw: {
    text: "핸드폰 010-7777-8888",
    lowConfidenceLines: [{ text: `계좌 : 국민 ${ACCT4}`, confidence: 41 }, { text: "예금주: 김철수", confidence: 38 }],
    supplier: { name: "테스트농원", contact: "010-7777-8888" },
    passes: [{ psm: 6, confidence: 72, textLength: 120 }],
    originalImage: IMG } }
});
eq(deep._debug.raw.lowConfidenceLines[0].text, `계좌 : 국민 ${A}`, "저신뢰 줄 원문 — 계좌 치환");
eq(deep._debug.raw.lowConfidenceLines[1].text, `예금주: ${H}`,     "저신뢰 줄 원문 — 예금주 치환");
eq(deep._debug.raw.lowConfidenceLines[0].confidence, 41,           "저신뢰 줄 신뢰도 보존");
eq(deep._debug.raw.supplier.contact, "",                           "중첩 raw.supplier.contact 비움");
eq(deep._debug.raw.passes, [{ psm: 6, confidence: 72, textLength: 120 }], "숫자 진단값 보존");
eq(deep._debug.raw.originalImage, IMG,                             "data: URL 은 건드리지 않는다 (이미지 손상 방지)");
eq(deep.invoiceNumber, "No. 2025-0612",                            "거래 필드는 문자열 정제 대상 아님");
eq(deep.rows, [{ name: "수국", spec: "H0.5", unitPrice: 12000 }],  "품목 행 보존");
eq(JSON.stringify(deep).includes("7777-8888"), false,              "사본 어디에도 휴대폰 값 없음");

console.log("\n[sanitizeHeader]");
eq(sanitizeHeader({ supplier: "테스트농원", supplierPhone: "010-7777-8888", invoiceDate: "2025-06-03" }),
   { supplier: "테스트농원", supplierPhone: "", invoiceDate: "2025-06-03" }, "supplierPhone 만 비움");

console.log("\n[scrubStoredData] 기존 로컬 데이터 정리");
const stored = {
  species: [{ id: "sp-001", suppliers: [{ name: "테스트농원", contact: "010-7777-8888" }] }],
  invoices: [
    { id: "inv-001", supplier: "테스트농원", supplierPhone: "010-7777-8888", analysis },
    { id: "inv-002", supplier: "다른농원",   supplierPhone: "" }
  ]
};
const r1 = scrubStoredData(stored);
eq(r1.changed, true,                                  "정리 대상이 있으면 changed");
eq(r1.data.invoices[0].supplierPhone, "",             "invoices[].supplierPhone 비움");
eq(r1.data.invoices[0].analysis.supplier.contact, "", "invoices[].analysis 정제");
eq(r1.data.species[0].suppliers[0].contact, "010-7777-8888",
   "species[].suppliers[].contact 는 건드리지 않음 (사용자 등록 판매자 프로필 · 긴급 조치 §6)");
eq(stored.invoices[0].supplierPhone, "010-7777-8888", "입력 객체를 변경하지 않는다");
const r2 = scrubStoredData(r1.data);
eq(r2.changed, false,                                 "멱등 — 두 번째 적용은 변경 없음");

// 부팅 재적용 시나리오: 예금주 다음 줄에 날짜가 있는 원문이 저장된 상태에서
// 부팅을 두 번 해도 날짜가 보존되어야 한다 (실제 결함의 재현 조건).
const bootA = { invoices: [{ id: "inv-b", analysis: { _debug: { raw: {
  text: "예금주: 김철수(테스트농원)\n2025-06-03\n수국 H0.5 주 20 12,000 240,000" } } } }] };
const boot1 = scrubStoredData(bootA).data;
const boot2 = scrubStoredData(boot1);
eq(boot2.changed, false, "부팅 2회차 — 추가 변경 없음");
eq(boot2.data.invoices[0].analysis._debug.raw.text.includes("2025-06-03"), true,
   "부팅 2회차 후에도 날짜 보존");
eq(scrubStoredData(null).changed, false,              "null 안전");

console.log(`\n${"=".repeat(56)}`);
console.log(`통과 ${pass} · 실패 ${fail}`);
console.log("=".repeat(56));
process.exit(fail ? 1 : 0);
