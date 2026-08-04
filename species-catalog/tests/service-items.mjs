#!/usr/bin/env node
/**
 * 서비스(0원) 품목 회귀 테스트.
 *
 *   node species-catalog/tests/service-items.mjs
 *
 * 배경 — 이 테스트가 지키는 사고
 *   거래명세서에 "서비스"로 적힌 무상 품목은 단가·금액이 0이다. 저장 경로가
 *   `unitPrice > 0` 으로 걸러 버려서, 원본 7건짜리 명세서가 DB 에 5건으로
 *   들어갔다(실환경 inv-073 — 붓들레야 4주 0원, 위성류 11주 0원).
 *   게다가 디버그 스냅샷은 걸러지지 않은 7건을 그려서, 감사 기록이 실제
 *   저장과 어긋났다.
 *
 *   그래서 이 파일이 고정하는 계약은 둘이다:
 *     ① 0원 품목은 **저장된다** (거래 이력은 원본 그대로 보존)
 *     ② 0원 품목은 **가격 통계에서 빠진다** (평균·최저가 왜곡 방지)
 *
 *   두 모듈 모두 DOM·네트워크 없는 순수 함수라 Node 에서 그대로 검증된다.
 */

const { collectValidItems } = await import("../js/utils.js");
const {
  calculateAveragePrice, calculateMinPrice, calculateMaxPrice,
  calculatePurchaseFrequency, calculatePriceTable, calculateRecentPrice
} = await import("../js/stats.js");

let pass = 0, fail = 0;
const failed = [];

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : (fail++, failed.push(label));
  console.log(`${ok ? "✓" : "✗"} ${label}` +
              (ok ? "" : `\n    기대: ${JSON.stringify(expected)}\n    실제: ${JSON.stringify(actual)}`));
}
function section(t) { console.log(`\n── ${t} ${"─".repeat(Math.max(0, 54 - t.length))}`); }

// ============================================================
section("1. 케이스 1 — 0원 품목 저장");
// ============================================================
const case1 = [
  { name: "품목 A", quantity: 10, unitPrice: 10000, amount: 100000 },
  { name: "품목 B", quantity: 5,  unitPrice: 0,     amount: 0 }
];
check("정상 1건 + 서비스 1건 → 2건 모두 저장", collectValidItems(case1).length, 2);
check("서비스 행이 그대로 남는다",
      collectValidItems(case1).map(i => i.name), ["품목 A", "품목 B"]);

// ============================================================
section("2. 실환경 inv-073 — 7건 전부 저장되는가");
// ============================================================
const inv073 = [
  { name: "붓들레아",       quantity: 4,   unitPrice: 0,      amount: 0 },        // 서비스
  { name: "설유화",         quantity: 8,   unitPrice: 100000, amount: 800000 },
  { name: "진달래",         quantity: 1,   unitPrice: 600000, amount: 600000 },
  { name: "진달래",         quantity: 3,   unitPrice: 150000, amount: 450000 },
  { name: "위성류",         quantity: 11,  unitPrice: 0,      amount: 0 },        // 서비스
  { name: "스크령하멜른",    quantity: 270, unitPrice: 7000,   amount: 1890000 },
  { name: "파니쿰 헤비메탈", quantity: 150, unitPrice: 7000,   amount: 1050000 }
];
check("원본 7건 → 저장 7건 (이전에는 5건이었다)", collectValidItems(inv073).length, 7);
check("붓들레아가 살아 있다",
      collectValidItems(inv073).some(i => i.name === "붓들레아"), true);
check("위성류가 살아 있다",
      collectValidItems(inv073).some(i => i.name === "위성류"), true);

// ============================================================
section("3. 빈 행·잘못된 행은 계속 걸러진다");
// ============================================================
check("품목명 없음 → 제외",
      collectValidItems([{ name: "", quantity: 1, unitPrice: 100 }]).length, 0);
check("공백만 있는 품목명 → 제외",
      collectValidItems([{ name: "   ", quantity: 1, unitPrice: 100 }]).length, 0);
check("수량 0 → 제외 (빈 행)",
      collectValidItems([{ name: "품목", quantity: 0, unitPrice: 100 }]).length, 0);
check("수량 누락 → 제외",
      collectValidItems([{ name: "품목", unitPrice: 100 }]).length, 0);
check("수량 있고 단가 0 → 포함 (서비스)",
      collectValidItems([{ name: "품목", quantity: 3, unitPrice: 0 }]).length, 1);
check("빈 배열", collectValidItems([]).length, 0);
check("null 입력", collectValidItems(null).length, 0);

// ============================================================
section("4. 케이스 2 — 가격 통계에서 0원 제외");
// ============================================================
const case2 = [
  { invoiceId: "inv-1", spec: "R6", unit: "주", quantity: 1, unitPrice: 10000, amount: 10000 },
  { invoiceId: "inv-1", spec: "R6", unit: "주", quantity: 5, unitPrice: 0,     amount: 0 }
];
check("평균가 = 10,000 (0원 제외)", calculateAveragePrice(case2), 10000);
check("최저가 = 10,000 (0원이 최저가가 되지 않는다)", calculateMinPrice(case2), 10000);
check("최고가 = 10,000", calculateMaxPrice(case2), 10000);

// 0원을 포함했을 때의 잘못된 값 — 이 테스트가 막는 대상
check("0원을 포함했다면 평균은 5,000 이었을 것 (회귀 감시)",
      Math.round(case2.reduce((a, i) => a + i.unitPrice, 0) / case2.length), 5000);

// ============================================================
section("5. 구매 횟수는 서비스 품목도 센다");
// ============================================================
// 무상이라도 실제로 받은 거래다 — 가격이 아닌 지표에서는 빼지 않는다.
check("수량 합계 = 1 + 5 = 6", calculatePurchaseFrequency(case2), 6);
check("inv-073 수량 합계에 서비스 포함 (4 + 11 도 계산됨)",
      calculatePurchaseFrequency(inv073.map(i => ({ quantity: i.quantity }))), 447);

// ============================================================
section("6. 단가표 · 최근 단가도 0원 제외");
// ============================================================
const invoices = [
  { id: "inv-1", invoiceDate: "2024-01-10" },
  { id: "inv-2", invoiceDate: "2024-06-20" }
];
const mixed = [
  { invoiceId: "inv-1", spec: "R6", unit: "주", quantity: 2, unitPrice: 45000, amount: 90000 },
  { invoiceId: "inv-2", spec: "R8", unit: "주", quantity: 3, unitPrice: 0,     amount: 0 }
];
check("단가표에 0원 규격이 들어가지 않는다",
      calculatePriceTable(mixed, invoices), [{ spec: "R6", unit: "주", price: 45000 }]);
check("최근 단가 = 45,000 (더 최근이지만 0원인 행은 무시)",
      calculateRecentPrice(mixed, invoices), 45000);

// ============================================================
section("7. 전부 서비스일 때는 '정보 없음'");
// ============================================================
const allFree = [
  { invoiceId: "inv-1", spec: "R6", unit: "주", quantity: 1, unitPrice: 0, amount: 0 },
  { invoiceId: "inv-2", spec: "R8", unit: "주", quantity: 2, unitPrice: 0, amount: 0 }
];
check("평균가 null", calculateAveragePrice(allFree), null);
check("최저가 null (0 이 아니라)", calculateMinPrice(allFree), null);
check("최고가 null", calculateMaxPrice(allFree), null);
check("최근 단가 null", calculateRecentPrice(allFree, invoices), null);
check("단가표 빈 배열", calculatePriceTable(allFree, invoices), []);
check("구매 횟수는 3 (가격이 없어도 거래는 있었다)",
      calculatePurchaseFrequency(allFree), 3);

// ============================================================
section("8. 기존 동작 — 0원 행이 없으면 종전과 동일");
// ============================================================
const normal = [
  { invoiceId: "inv-1", spec: "R6", unit: "주", quantity: 1, unitPrice: 10000, amount: 10000 },
  { invoiceId: "inv-2", spec: "R6", unit: "주", quantity: 1, unitPrice: 30000, amount: 30000 }
];
check("평균가 20,000", calculateAveragePrice(normal), 20000);
check("최저가 10,000", calculateMinPrice(normal), 10000);
check("최고가 30,000", calculateMaxPrice(normal), 30000);
check("빈 배열 → 평균 null", calculateAveragePrice([]), null);
check("null → 평균 null", calculateAveragePrice(null), null);
check("null → 최저 null", calculateMinPrice(null), null);

// ============================================================
console.log("\n" + "=".repeat(56));
console.log(`통과 ${pass} · 실패 ${fail}`);
if (fail) { console.log("\n실패 항목:"); for (const l of failed) console.log("  ✗ " + l); }
console.log("=".repeat(56));
process.exit(fail ? 1 : 0);
