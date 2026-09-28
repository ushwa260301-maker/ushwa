/**
 * pii-guard.mjs — 실물 거래명세서 기반 데이터가 커밋되는 것을 차단한다.
 *
 *   node .github/scripts/pii-guard.mjs <file> [file...]   # 적발 시 exit 1
 *
 * 왜 필요한가 (AUDIT_PROTOCOL.md §5)
 *   fixture 정책을 문서에 적는 것만으로는 재발을 막지 못한다. GitHub 의
 *   secret scanning 은 API 키·토큰 탐지용이라 계좌번호·실명은 잡지 않는다.
 *
 * **매치된 값을 절대 출력하지 않는다.** CI 로그는 공개될 수 있으므로,
 * 값을 찍으면 가드 자신이 새로운 노출 경로가 된다. 파일명과 패턴 종류만
 * 보고한다 (AUDIT_PROTOCOL.md §5).
 *
 * 차단 범위 (2026-09-28 긴급 조치로 전수 차단 승격)
 *   실물 기반 fixture 21~24 비식별화가 끝나 corpus 가 정리되었으므로, CI 는
 *   in-scope 경로 **전체**를 차단 모드로 검사한다. 변경분 검사도 병행해
 *   in-scope 밖(미감사 영역)으로의 신규 유입도 막는다.
 *
 * 판정 정책 (긴급 조치 §8)
 *   휴대폰  허용 목록(.github/pii-allowlist.json)에 **있는 값만** 통과.
 *           목록 밖의 휴대폰 번호는 모두 실패 — 명시 허용 모델.
 *   계좌    허용 목록 없음. 첫 그룹이 0 으로만 된 비식별화 더미 형식
 *           (000-0000-0000-NN)만 통과 — 실제 계좌는 0 으로 시작하지 않는다.
 *   예금주  데이터 파일(.json)에서만 검사. 자리표시 이름만 통과.
 *
 * 유선전화는 이 가드의 판정 대상이 아니다. 실측 결과 합성 fixture 와 시드
 * 카탈로그(data/species.json)에 다수 존재하며, 실제/합성 여부를 저장소
 * 안에서 판정할 수 없다. 별도 DECISION 으로 다룬다 (AUDIT.md).
 */

import { readFileSync, statSync } from "node:fs";

/** 허용 목록은 숫자만 남겨 비교한다 — 하이픈 유무 표기 차이를 흡수. */
const digits = s => s.replace(/\D/g, "");
const ALLOW = (() => {
  const raw = JSON.parse(readFileSync(new URL("../pii-allowlist.json", import.meta.url), "utf8"));
  const phones = Object.values(raw.phone || {}).flatMap(g => g.values || []);
  return { phone: new Set(phones.map(digits)) };
})();

/** 예금주 뒤에 와도 사람 이름이 아닌 단어 — 자리표시 이름 · 서술어. */
const NOT_A_NAME = ["홍길동", "아무개", "이름", "성명", "라벨", "표기", "정보", "필드", "항목", "명의"];

/** 데이터 파일만 검사하는 규칙을 위한 판정. 문서(.md)는 §4 로 통제한다. */
const isDataFile = f => f.endsWith(".json");

const RULES = [
  {
    name: "금융계좌 형식",
    // 3~6자리 4그룹 — 국내 은행 계좌 표기. 허용 목록은 없다.
    // 첫 그룹이 0 으로만 된 값은 비식별화 더미 형식이라 통과시킨다.
    re: /(?<!\d)(\d{2,6})-(\d{2,6})-(\d{2,6})-(\d{2,6})(?!\d)/g,
    isDummy: m => /^0+$/.test(m[1]),
    appliesTo: () => true
  },
  {
    name: "휴대폰 형식",
    // 허용 목록에 있는 값만 통과 (명시 허용 모델).
    re: /(?<!\d)(01[016789])-?(\d{3,4})-?(\d{4})(?!\d)/g,
    isDummy: m => ALLOW.phone.has(digits(m[0])),
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
    //
    // 판정은 '예금주' 뒤 **포획한 단어**로 한다. 자리표시 이름과, 서술문에서
    // 예금주 뒤에 오는 설명어(실측: changeLog 의 "예금주 라벨 + 성명 + 괄호")
    // 는 이름이 아니다. 접두 비교인 이유: OCR 이 다음 글자를 붙여 읽으면
    // `홍길동대…` 처럼 4자로 포획되기 때문이다.
    re: /예\s*금\s*주\s*[:：]?\s*([가-힣]{2,4})/g,
    isDummy: m => NOT_A_NAME.some(w => m[1].startsWith(w)),
    appliesTo: isDataFile
  }
];

const files = process.argv.slice(2);

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
// 검사 결과 보고 — 값은 출력하지 않는다.
// ---------------------------------------------------------------
console.log("========================================");
console.log("PII guard");
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
     더미 — 휴대폰 010-0000-0000(허용 목록) · 계좌 000-0000-0000-NN
     (형식을 유지해야 OCR 실패 패턴과 parser 검증 의미가 보존됩니다.)
  2) 비식별화 시 corpus 전체의 교차 참조를 함께 확인하십시오.
     같은 이름·번호가 여러 fixture 에 걸쳐 있을 수 있습니다.
  3) 합성 테스트 값이라면 .github/pii-allowlist.json 에 사유와 함께 추가하십시오.

근거: AUDIT_PROTOCOL.md §4 · §5
`);
process.exit(1);
