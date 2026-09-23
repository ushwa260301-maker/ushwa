/**
 * pii-guard.mjs — 실물 거래명세서 기반 데이터가 커밋되는 것을 차단한다.
 *
 *   node .github/scripts/pii-guard.mjs <file> [file...]   # 차단 모드 (exit 1)
 *   node .github/scripts/pii-guard.mjs --count <file>...  # 집계 모드 (exit 0)
 *
 * 왜 필요한가 (AUDIT_PROTOCOL.md §5)
 *   fixture 정책을 문서에 적는 것만으로는 재발을 막지 못한다. GitHub 의
 *   secret scanning 은 API 키·토큰 탐지용이라 계좌번호·실명은 잡지 않는다.
 *
 * **매치된 값을 절대 출력하지 않는다.** CI 로그는 공개될 수 있으므로,
 * 값을 찍으면 가드 자신이 새로운 노출 경로가 된다. 파일명과 패턴 종류만
 * 보고한다 (AUDIT_PROTOCOL.md §5).
 *
 * 왜 diff 범위인가
 *   corpus 실측(2026-09-23): 휴대폰 형식은 합성 fixture 5건에도 존재한다
 *   (전화 표기 변형을 검증하는 fixture 들이다). 전수 차단으로 두면 정상
 *   자산이 CI 를 영구히 막는다. 따라서 **이번 변경분만** 차단하고, 전체
 *   현황은 집계 모드로 관찰한다. corpus 가 정리되면 전수 차단으로 승격한다.
 *
 * 더미 표기 규약 (비식별화 시 이 형식을 쓴다)
 *   휴대폰  010-0000-NNNN   — 국번 0000 은 더미로 간주해 통과시킨다
 *   계좌    000-0000-0000-00 — 첫 그룹 000 은 더미로 간주해 통과시킨다
 *   이 규약이 없으면 비식별화한 값도 형식이 같아 가드에 다시 걸린다.
 */

import { readFileSync, statSync } from "node:fs";

/** 데이터 파일만 검사하는 규칙을 위한 판정. 문서(.md)는 §4 로 통제한다. */
const isDataFile = f => f.endsWith(".json");

const RULES = [
  {
    name: "금융계좌 형식",
    // 3~6자리 4그룹 — 국내 은행 계좌 표기. 첫 그룹이 000 이면 더미로 본다.
    re: /(?<!\d)(\d{2,6})-(\d{2,6})-(\d{2,6})-(\d{2,6})(?!\d)/g,
    isDummy: m => /^0+$/.test(m[1]),
    appliesTo: () => true
  },
  {
    name: "휴대폰 형식",
    // 국번(2번째 그룹)이 0000 이면 더미로 본다.
    re: /(?<!\d)(01[016789])-?(\d{3,4})-?(\d{4})(?!\d)/g,
    isDummy: m => /^0+$/.test(m[2]),
    appliesTo: () => true
  },
  {
    name: "예금주 표기",
    // '예금주' 뒤에 한글 이름이 오는 관용 표기.
    //
    // **데이터 파일에만 적용한다.** 이 규약을 설명하는 문서(AUDIT_PROTOCOL.md
    // §4 의 `예금주: 이름(상호)` 예시 등)가 자기 자신에게 걸리기 때문이다.
    // 규칙을 기술한 문서가 그 규칙에 차단되면 가드를 끄게 되고, 그러면
    // 가드가 없는 것과 같다. 문서의 PII 는 §4(값을 복제하지 않는다)로
    // 통제하며, 문서에 대해서도 계좌·휴대폰 형식 규칙은 그대로 적용된다.
    re: /예\s*금\s*주\s*[:：]?\s*[가-힣]{2,4}/g,
    isDummy: m => /이름|홍길동|아무개|예금주\s*[:：]?\s*$/.test(m[0]),
    appliesTo: isDataFile
  }
];

const args = process.argv.slice(2);
const countMode = args.includes("--count");
const files = args.filter(a => a !== "--count");

if (!files.length) {
  console.log("PII guard: 검사할 파일이 없습니다 — 통과.");
  process.exit(0);
}

/** @type {Map<string, Set<string>>} file → 적발된 패턴 이름 집합 */
const hits = new Map();

for (const file of files) {
  let text;
  try {
    if (!statSync(file).isFile()) continue;
    text = readFileSync(file, "utf8");
  } catch {
    continue;            // 삭제된 파일 등 — 검사 대상 아님
  }

  for (const rule of RULES) {
    if (!rule.appliesTo(file)) continue;
    rule.re.lastIndex = 0;
    for (const m of text.matchAll(rule.re)) {
      if (rule.isDummy(m)) continue;
      if (!hits.has(file)) hits.set(file, new Set());
      hits.get(file).add(rule.name);
    }
  }
}

// ---------------------------------------------------------------
// 집계 모드 — 파일명을 출력하지 않는다. 전체 현황을 숫자로만 관찰한다.
// P0 의 Verification("PII 패턴 검사 결과 0건")이 이 숫자다.
// ---------------------------------------------------------------
if (countMode) {
  console.log("========================================");
  console.log("PII 전수 집계 (참고 · 차단하지 않음)");
  console.log("========================================");
  console.log(`검사 파일 : ${files.length}건`);
  console.log(`적발 파일 : ${hits.size}건`);
  console.log("");
  console.log(hits.size === 0
    ? "0건 — 전수 차단으로 승격할 수 있는 상태입니다."
    : "정리 대상이 남아 있습니다. 위치는 AUDIT.md 에서 관리합니다.");
  process.exit(0);
}

// ---------------------------------------------------------------
// 차단 모드 — 이번 변경분만 검사한다.
// ---------------------------------------------------------------
console.log("========================================");
console.log("PII guard — 변경된 파일 검사");
console.log("========================================");
console.log(`검사 대상 : ${files.length}건`);

if (hits.size === 0) {
  console.log("\nPASS — 적발 없음.");
  process.exit(0);
}

console.error(`\nFAIL — ${hits.size}개 파일에서 실물 데이터로 보이는 패턴을 발견했습니다.\n`);
for (const [file, names] of hits) {
  console.error(`  ✗ ${file}`);
  console.error(`      패턴: ${[...names].join(" · ")}`);
}
console.error(`
조치:
  1) 실물 거래명세서 기반 데이터라면 커밋하지 말고 비식별화하십시오.
     더미 표기 규약 — 휴대폰 010-0000-NNNN · 계좌 000-0000-0000-00
     (형식을 유지해야 OCR 실패 패턴과 parser 검증 의미가 보존됩니다.)
  2) 비식별화 시 corpus 전체의 교차 참조를 함께 확인하십시오.
     같은 이름·번호가 여러 fixture 에 걸쳐 있을 수 있습니다.
  3) 정당한 예외라면 이 가드의 규약에 맞추거나 규칙을 갱신하십시오.

근거: AUDIT_PROTOCOL.md §4 · §5
`);
process.exit(1);
