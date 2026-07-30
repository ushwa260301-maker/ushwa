# OCR 학습 데이터 운영 규칙 v1.0

> **이 문서는 설명서가 아니라 운영 정책이다.**
> OCR 개선 · 공급처 자동 매칭 · 수종명 자동 매칭 · AI 추천 · 데이터 품질
> 관리의 기준 문서로 사용한다.
>
> 문서에 적힌 수치·컬럼·임계값은 전부 현재 코드에서 확인한 값이다.
> 확정되지 않은 것은 `[확인 필요]` 로 표시한다.

작성 시점 — T9 배선 실환경 검증 완료(2026-07-30) · 누적 학습 데이터 1건 ·
OCR 회귀 fixture 24개 / 240 필드 / 229 PASS (95.4%).

---

## 1. OCR 데이터의 목적 정의

**OCR 은 이미지를 읽는 기능이 아니다. 학습 데이터를 만드는 엔진이다.**

이 구분이 실무에서 갖는 의미는 하나다 — **OCR 이 틀렸을 때가 데이터를 얻는
순간**이라는 것. 100% 정확한 OCR 은 학습 데이터를 만들지 않는다. 틀리고,
사람이 고치고, 그 쌍이 남을 때 자산이 된다.

### 학습 루프

```
거래명세서 이미지
   ↓                        Storage(attachments) · 영구 보관
OCR raw 데이터               ocr_corrections.raw_text / normalized_text
   ↓
파서 추출값                  ocr_corrections.parsed_fields
   ↓
사용자 수정값                ocr_corrections.user_edited_fields   ← 정답
   ↓
오류 분석                    §4 분류 체계 · 계층 판정
   ↓
자동화 규칙 개선             vision.js 파서 · matcher.js · alias 테이블
   ↓
회귀 측정                    tests/ocr-accuracy.mjs (229/240 기준선)
   ↓
(루프 반복)
```

### 이 루프가 이미 작동한 증거

fixture 24번(`24-parens-account-holder-supplier`)은 실제 명세서 1장에서
"예금주: 이름(상호)" 관용 표기를 발견해 파서 규칙으로 만든 결과다. **명세서
1장 = 규칙 1개.** 학습에 대량 데이터가 먼저 필요하지 않다.

### 원칙 4가지

| # | 원칙 |
|---|---|
| 1 | **원본을 버리지 않는다** — raw_text 는 파서를 바꿔도 재평가할 수 있는 유일한 기준점이다 |
| 2 | **사용자 수정은 정답이다** — 오류 기록이 아니라 라벨(label)이다 (§7) |
| 3 | **append-only** — `ocr_corrections` 는 UPDATE/DELETE 정책 부재로 DB 가 강제한다. 과거 데이터를 고쳐 쓰지 않는다 |
| 4 | **측정 없는 개선은 개선이 아니다** — 규칙 변경은 반드시 회귀 수치로 검증한다 |

---

## 2. `ocr_corrections` 데이터 정의

한 거래당 1행. 저장 주체는 `cloudStore.js` 의 `mirrorSaveOcrCorrection()`.

| 컬럼 | 출처 | 의미 | 활용 목적 |
|---|---|---|---|
| `invoice_id` | 저장된 거래 id | 거래와의 연결. FK → `invoices` | 원본 이미지·품목·가격과 조인. **삭제 시 `set null`** — 거래를 지워도 학습 데이터는 남는다 |
| `raw_text` | `_debug.raw.text` | Tesseract 가 읽은 **가공 전** 원문 | **가장 중요한 컬럼.** 파서를 바꾼 뒤 과거 데이터를 재평가하는 기준. fixture 변환의 입력 |
| `normalized_text` | `_debug.raw.normalized` | `normalizeOcrText()` 적용 후 | 정규화 단계 자체의 개선 여부 측정 (raw→normalized 손실 추적) |
| `parsed_fields` | `{supplier, rows, invoiceDate, invoiceNumber}` | 파서가 뽑아낸 값 | 사용자 수정값과의 **diff 가 곧 오류 목록** |
| `user_edited_fields` | `{header, items}` | 사용자가 최종 확정한 값 | **정답 라벨.** 자동 수정 후보·alias·규칙의 근거 |
| `debug_meta` | `_debug` (썸네일 제외) | confidence · psm 패스별 결과 · latency · 저신뢰 라인 | 등급 판정(§3) · 이미지 품질 진단 · 엔진 버전별 추이 |
| `engine_version` | `_debug.model` | 예: `tesseract-5 (kor+eng)` | 엔진 교체 시 성능 비교의 기준. **엔진을 바꾸면 과거 데이터와 섞어 평가하지 않는다** |
| `version` | 고정 `1` | 수정 회차 | 향후 "수정할 때마다 새 행" 용도로 예약. 현재는 최초 1행만 기록 |
| `uploaded_by` | `auth.uid()` | 등록자 | 다중 업체 운영 시 데이터 출처 추적 |
| `created_at` | DB 기본값 | 시각 | 시계열 정확도 추이 |

### 저장하지 않는 것

| 항목 | 이유 |
|---|---|
| `raw.originalImage` · `raw.preprocessedImage` | base64 썸네일. 각 수십 KB 로 행을 비대화시키고 학습에 쓰이지 않는다. **원본 이미지는 Storage(`attachments`) 에 있다** |
| 이미지 자체 | Storage 가 담당. DB 에 blob 을 넣지 않는다 |

### confidence 의 위치

**별도 컬럼이 아니라 `debug_meta.confidence` 안에 있다** (0~1 범위).
`debug_meta.raw.tesseractConfidence` 는 0~100 원본값이다.

집계 성능이 필요해지면 생성 컬럼(`generated always as`)으로 승격한다 —
`[확인 필요]` 시점: 행 1,000건 이상 또는 대시보드 응답 지연 발생 시.

---

## 3. 학습 데이터 등급 기준

**등급은 사람이 매기지 않는다.** `parsed_fields` 와 `user_edited_fields` 의
diff, 그리고 `raw_text` 에 정답이 존재하는지로 자동 판정한다.

### 판정 규칙

| 등급 | 조건 | 학습 사용 | 우선순위 |
|---|---|---|---|
| **A** | parsed ≠ user_edited **AND** 정답이 `raw_text` 에 존재 **AND** 일반화 가능한 패턴 | ✅ **즉시 규칙화** | ★★★★★ |
| **B** | parsed ≠ user_edited **AND** 정답이 `raw_text` 에 존재 **AND** 단순·국소 오류 | ✅ 정규화 테이블에 축적 | ★★★☆☆ |
| **C** | 정답이 `raw_text` 에 **없음** (OCR 계층 실패) | ❌ 규칙 학습 불가 · **이미지 품질 지표로만 사용** | ★☆☆☆☆ |
| **D** | parsed == user_edited (전부 일치) | — | 회귀 기준선으로만 유지 |

### 판정의 핵심 — "정답이 raw 에 있는가"

이 한 가지가 A/B 와 C 를 가른다.

```
raw_text 에 "대림원예가든센테" 가 있고 사용자가 "대림원예가든센터" 로 고쳤다
  → 파서/정규화로 해결 가능 → A 또는 B

raw_text 에 품목 표가 아예 없고 사용자가 3건을 손으로 입력했다
  → 파서로 해결 불가 → C (이미지 품질 문제)
```

**C 등급을 규칙으로 고치려 하면 안 된다.** raw 에 없는 글자는 어떤 파서도
만들어낼 수 없다. C 등급이 많아지면 개선 대상은 파서가 아니라 **촬영 가이드와
전처리**다.

### 등급별 예시

**A등급** — 일반화 가능한 패턴
```
raw          : = 농협:251-1118-4809-83문명석대림원예가든센테
parsed       : supplier.name = ""
user_edited  : supplier      = "대림원예가든"
판정          : 정답이 raw 에 존재 · "계좌 예금주 라인에 상호가 붙는" 패턴
조치          : 파서 규칙 추가 → 같은 형식의 모든 명세서에 적용
```

**B등급** — 단순·국소 오류
```
raw          : 2024, 4. .| whgewo | 이
parsed       : invoiceDate = ""
user_edited  : invoiceDate = "2024-04-17"
판정          : 연·월은 raw 에 존재(파서 가능), 일(17)은 훼손(불가)
조치          : 연·월 부분 추출 규칙 + 일자는 사용자 입력 유지
```

**C등급** — 판단 불가
```
raw          : (품목 표 관련 문자열 전무)
parsed       : rows = []
user_edited  : items = [남천 15주, 남천 15주, 사철 50주]
판정          : raw 에 정보 부재 → 규칙 불가
조치          : 이미지 품질 지표로만 집계. 콘솔의
                "Image too small to scale!!" / "Line cannot be recognized!!" 확인
```

### 현재 corpus 의 등급 분포 (실측)

`tests/ocr-accuracy.mjs` 의 실패 11건 분류:

| 계층 | 건수 | 대응 등급 |
|---|---|---|
| OCR (raw 에 정보 부재) | **8** | C |
| Parser (raw 에 정보 존재) | 2 | A/B |
| Matcher | 0 | — |
| Ambiguous | 1 | B |

**해석**: 현재 병목은 파서가 아니라 **이미지 품질**이다(8/11). 파서 규칙을
아무리 정교하게 만들어도 8건은 풀리지 않는다. 투자 우선순위는
① 촬영 가이드 ② 전처리 파라미터 ③ 파서 규칙 순이다.

---

## 4. OCR 오류 분류 체계

| # | 분류 | 예 | 발생 원인 | 처리 방법 | 자동화 |
|---|---|---|---|---|---|
| 1 | **문자 혼동** | `O`↔`0` · `I`↔`1` · `B`↔`8` · `S`↔`5` | 글리프 형태 유사 | 숫자 문맥에서 문자→숫자 치환 (`normalizeOcrText`) | ✅ 완전 자동 |
| 2 | **한글 유사 오류** | `센터`→`센테` · `천`→`츤` · `릉`→`능` | 받침·모음 획 유사 | NFD 자모 분해 후 유사도 비교 (`calculateSimilarity`, 임계 0.85) | ✅ 자동 (후보 제시) |
| 3 | **띄어쓰기 오류** | `남 천`→`남천` · `업 태`→`업태` | 문자 간격을 단어 경계로 오판 | 정규화 시 공백 전면 제거 후 비교 | ✅ 완전 자동 |
| 4 | **공급처명 오류** | `대림원예가든센테` | 상호가 계좌·예금주 라인에 혼입 · 로고 폰트 | alias 테이블(§5) + `fn_norm_supplier_name` | ⚠️ 반자동 — 최초 1회 사람 확인 |
| 5 | **수종명 오류** | `남츤` · `사철(나무)` | 손글씨 · 약칭 · 규격 혼입 | `normalizeSpeciesName` + 별칭 테이블(§6) | ⚠️ 반자동 — 0.60~0.85 구간은 사람 선택 |
| 6 | **구조 손실** | 품목 표 전체 미인식 | 얇은 표 행이 전처리에서 소실 | **파서로 해결 불가.** 전처리·촬영 개선 | ❌ 불가 |

### 계층 판정 규칙 (분류의 전제)

오류를 보면 **먼저 계층을 정한다.** 계층을 틀리면 엉뚱한 곳을 고친다.

```
정답 문자열이 raw_text 에 있는가?
├─ 없다        → OCR 계층 (분류 6) · 이미지/전처리 문제
└─ 있다
   ├─ 파서가 못 뽑았다   → Parser 계층 (분류 1·3·4)
   └─ 뽑았지만 매칭 실패 → Matcher 계층 (분류 2·5)
```

이 판정은 `tests/ocr-accuracy.mjs` 가 fixture 실행 시 자동으로 수행한다.
**사람이 눈으로 판단하지 않는다.**

### 자동화 3단 정책

| 단계 | 조건 | 동작 |
|---|---|---|
| 자동 적용 | 유사도 ≥ 0.85 (`matchThreshold`) | 사용자 확인 없이 매칭 |
| 후보 제시 | 0.60 ≤ 유사도 < 0.85 (`possibleThreshold`) | **사람이 선택** — 이 선택이 새 학습 데이터 |
| 신규 생성 | 유사도 < 0.60 | 새 항목으로 취급 |

**임계값을 임의로 낮추지 않는다.** 0.85 미만을 자동 적용하면 서로 다른
수종이 병합되는 비가역 손상이 발생한다. 0.60 구간의 사람 선택이 데이터를
만드는 지점이므로, 그것을 없애는 것이 목표가 아니다.

---

## 5. 공급처 Alias 관리 규칙

### 목적

OCR 이 잘못 읽은 공급처명을 기존 공급처와 연결한다.

```
OCR  : 대림원예가든센테
정답 : 대림원예가든
```

### 현재 구조 (이미 있는 것)

| 자산 | 위치 | 역할 |
|---|---|---|
| `suppliers.norm_name` | `schema.sql` · UNIQUE | `fn_norm_supplier_name()` = `lower` + 공백 제거. 표기 차이를 DB 레벨에서 단일화 |
| 정규화 정책 | `rpc.sql:23-29` | **의도적으로 보수적** — 법인 마커 등 의미 변형은 하지 않는다. over-normalization 은 서로 다른 업체를 합칠 위험 |

`norm_name` 은 `대림원예가든` 과 `대림 원예 가든` 은 합치지만
`대림원예가든센테` 는 합치지 못한다. **그 간극을 alias 가 메운다.**

### 제안 구조 `[미구현 · 승인 필요]`

```
supplier_alias
├─ id               uuid
├─ alias_text       text     OCR 원문 (정규화 전)
├─ norm_alias       text     fn_norm_supplier_name(alias_text) · 조회 키
├─ supplier_id      uuid     → suppliers.id
├─ correction_count int      이 alias 로 교정된 횟수
├─ confidence       numeric  자동 적용 가능 여부 판정용
├─ source           text     'user' | 'rule' | 'import'
├─ created_by       uuid     → users.id
└─ created_at       timestamptz
```

### 운영 규칙

| # | 규칙 |
|---|---|
| 1 | **alias 는 자동 생성하지 않는다.** 사용자가 실제로 고친 결과(`user_edited_fields`)만 후보가 된다 |
| 2 | `correction_count = 1` 은 **후보 제시**만. 자동 적용하지 않는다 |
| 3 | `correction_count ≥ 3` **AND** 동일 `supplier_id` 로 일관될 때만 자동 적용 승격 `[확인 필요: 임계값 3]` |
| 4 | 서로 다른 `supplier_id` 로 교정된 이력이 있는 alias 는 **자동 적용 금지** — 모호한 alias 다 |
| 5 | alias 는 **append-only**. 잘못된 alias 는 삭제가 아니라 무효화 플래그로 처리 `[확인 필요]` |
| 6 | 공급처 **병합은 비가역**이므로 alias 로 자동 병합하지 않는다. alias 는 "연결"만 하고 `suppliers` 행은 그대로 둔다 |

### 왜 자동 생성을 금지하는가

`대림원예가든센테` 를 `대림원예가든` 에 자동 연결하면, 실제로 존재하는
`대림원예가든센터`(별개 업체)를 잘못 흡수할 수 있다. **거래처를 잘못 합치면
가격 이력이 오염되고 되돌릴 수 없다.** 사람 확인 1회의 비용이 그보다 싸다.

---

## 6. 수종명 학습 규칙

수종명은 조경 데이터의 핵심 키다. 공급처보다 엄격하게 다룬다.

### 현재 구조 (이미 있는 것)

`matcher.js` 의 `normalizeSpeciesName()` 이 5단계 정규화를 수행한다:

| 단계 | 대상 | 예 |
|---|---|---|
| 1 | 괄호·대괄호 내용 제거 | `(신품종)` `[3년생]` `（수경재배）` → 제거 |
| 2 | 규격 마커 제거 | `R6` `H1.2` `B10` `W0.8` `D3` → 제거 |
| 3 | 수량·단위 마커 제거 | `3분` `5포트` `2주` `본` `EA` → 제거 |
| 4 | 품종 마커 제거 | `신품종개나리` → `개나리` |
| 5 | 공백 제거 + 라틴 소문자화 | `왕 벚 나 무` → `왕벚나무` |

유사도는 **NFD 자모 분해 후 Levenshtein** — `센터`/`센테` 처럼 받침만 다른
경우를 문자 단위보다 정확히 잡는다.

### 관리 대상

| 항목 | 저장 위치 | 비고 |
|---|---|---|
| 국문명 | `species.name` | 정본 |
| 학명 | `species.latin` | 도감 데이터에서 보강 가능 |
| 규격 | `invoice_items.spec` | **수종이 아니라 거래 속성** — 수종명에 섞지 않는다 |
| 별칭 | `species_alias` `[미구현]` | 아래 |
| OCR 오인식 패턴 | `ocr_corrections` diff 에서 도출 | |
| 공급처별 표기 방식 | `species_alias.supplier_id` `[미구현]` | 업체마다 약칭이 다르다 |

### 제안 구조 `[미구현 · 승인 필요]`

```
species_alias
├─ id               uuid
├─ alias_text       text     원문 (예: "남츤", "사철나무", "남 천")
├─ norm_alias       text     normalizeSpeciesName(alias_text) · 조회 키
├─ species_id       text     → species.id
├─ supplier_id      uuid     null 이면 전역 별칭 · 값이 있으면 그 업체 표기
├─ alias_type       text     'ocr_error' | 'abbrev' | 'synonym' | 'trade_name'
├─ correction_count int
├─ created_by       uuid
└─ created_at       timestamptz
```

`supplier_id` 를 두는 이유: 업체 A 는 `사철`, 업체 B 는 `사철나무` 로 쓴다.
**전역 별칭으로 뭉개면 어느 업체가 무엇을 부르는지 정보가 사라진다.**

### 운영 규칙

| # | 규칙 |
|---|---|
| 1 | `normalizeSpeciesName` 으로 이미 같아지는 표기는 alias 로 만들지 않는다 (`남 천` → 불필요) |
| 2 | alias 후보는 **0.60~0.85 구간에서 사용자가 선택한 결과**에서만 나온다 |
| 3 | **규격·수량은 alias 에 넣지 않는다.** `남천 R6` 는 alias 가 아니라 정규화 대상이다 |
| 4 | `alias_type='synonym'`(이명)은 식물학적 판단이 필요하므로 **자동 생성 금지** — 도감 근거 필요 |
| 5 | **수종 병합은 비가역**이다. alias 는 연결만 하고 `species` 행을 지우지 않는다. 병합은 관리자 전용 + 미리보기 필수 |
| 6 | 임계값 0.85/0.60 은 회귀 측정 없이 변경하지 않는다 |

### 예시

```
남천 · 남 천 · 남천R6      → normalizeSpeciesName 이 이미 해결 (alias 불필요)
남츤                       → alias_type='ocr_error'  · 사용자 선택 후 등록
사철 / 사철나무            → alias_type='abbrev'     · 업체별 표기 (supplier_id 기록)
```

---

## 7. 사용자 수정 데이터 활용 정책

### 원칙 — 사용자 수정은 오류 기록이 아니라 정답 라벨이다

```
파서    : supplier.name = ""            (틀림)
사용자  : supplier      = "대림원예가든" (정답)
   ↓
이 쌍이 곧 라벨(label)이다
   ↓
자동 수정 후보 · alias 후보 · 파서 규칙의 근거
```

이 관점의 실무적 결과: **사용자가 많이 고치는 앱일수록 데이터가 빨리
쌓인다.** 수정 횟수는 품질 저하 지표가 아니라 학습 진행 지표다.

### 활용 단계

| 단계 | 내용 | 자동화 |
|---|---|---|
| 1 | diff 추출 — `parsed_fields` vs `user_edited_fields` | ✅ |
| 2 | 계층 판정 — 정답이 `raw_text` 에 있는가 (§4) | ✅ |
| 3 | 등급 부여 — A/B/C/D (§3) | ✅ |
| 4 | A등급 → 파서 규칙 후보 / B등급 → 정규화 테이블 / C등급 → 품질 지표 | ⚠️ 사람 검토 |
| 5 | fixture 등록 → 회귀 측정 | ✅ `tests/import-fixture.mjs` |
| 6 | 규칙 반영 → 229/240 기준선 대비 검증 | ✅ `tests/ocr-accuracy.mjs` |

### 금지 사항

| # | 금지 | 이유 |
|---|---|---|
| 1 | 사용자 수정값을 되돌리거나 덮어쓰지 않는다 | 정답 라벨의 훼손 |
| 2 | 사용자 확인 없이 자동 수정을 적용하지 않는다 (유사도 0.85 미만) | 비가역 오염 |
| 3 | 학습을 이유로 사용자에게 추가 입력을 강요하지 않는다 | 데이터 수집이 제품을 해치면 둘 다 잃는다 |
| 4 | `ocr_corrections` 행을 수정·삭제하지 않는다 | append-only 계약 (DB 가 강제) |

---

## 8. 현재 확보 데이터 기록

### 학습 데이터 #1 — 2026-07-30

| 항목 | 값 |
|---|---|
| invoice | `inv-050` |
| 파일 | `0419 레베빌 대림.jpg` · 0.58 MB · JPEG |
| 엔진 | `tesseract-5 (kor+eng)` |
| confidence | **0.72** (psm 6 = 62% → psm 4 = 72% 재시도 승격) |
| latency | 5,094 ms |
| raw 규모 | `rawLen = 209` · 14줄 68단어 |
| 저신뢰 라인 | 4건 (confidence 41 / 30 / 22 / 0) |

### 필드별 판정

| 필드 | parsed | user_edited | 계층 | 등급 |
|---|---|---|---|---|
| 소재지 | `서울특별시 서초구 헌인릉1길 21(내곡동)` | 동일 | — | **D** (일치) |
| 전화 | `010-5329-5933` | 동일 | — | **D** (일치) |
| 상호 | `""` | `대림원예가든` | Parser | **A** |
| 작성일 | `""` | `2024-04-17` | Ambiguous | **B** |
| 품목 3건 | `[]` | 남천 15주 · 남천 15주 · 사철 50주 | OCR | **C** |

### 종합 평가 — **A등급 학습 데이터**

A등급 항목(상호)이 존재하고 정답이 `raw_text` 에 있으므로 **즉시 규칙화
가능**하다. 동시에 C등급(품목 표 미인식)이 포함되어 이미지 품질 지표로도
쓰인다.

### 도출된 규칙 후보 #1 `[미적용]`

```
패턴  : 계좌 정보 라인의 예금주명 뒤에 상호가 연결됨
raw   : = 농협:251-1118-4809-83문명석대림원예가든센테
        └─ 은행 ─┘└─ 계좌번호 ─┘└예금주┘└─── 상호 ───┘
현재  : 파서가 supplier.name 을 비움
후보  : 은행명+계좌번호 패턴 이후 잔여 문자열에서 상호 후보 추출
        → 기존 suppliers 와 유사도 비교 → 0.85 이상이면 매칭
관련  : fixture 24 가 "예금주: 이름(상호)" 괄호 형태를 이미 처리 —
        이번은 **괄호 없이 연결된 변형**
주의  : 규칙 추가는 229/240 기준선에 영향을 줄 수 있다. fixture 등록 →
        측정 → 규칙 → 재측정 순서를 지킨다
```

### 누적 현황

| 지표 | 값 |
|---|---|
| `ocr_corrections` 행 | **1** |
| OCR 회귀 fixture | 24 (240 필드 · 229 PASS · 95.4%) |
| A등급 규칙 후보 | 1건 (상호 추출) |
| 확보 이미지 | Storage `attachments` 1건 |

---

## 부록 A. 데이터 수집 절차 (운영자용)

1. `https://ushwa260301-maker.github.io/ushwa/?debug=1` 접속 → 로그인
2. 거래명세서 등록 → 사진 첨부 → OCR 실행
3. **틀린 필드를 손으로 고친다** ← 이 행위가 학습 데이터
4. Step 3 디버그 패널에서 `↓ OCR 결과 다운로드` 클릭 (스냅샷 JSON)
5. 저장 → 콘솔에서 3줄 확인:
   `saveInvoice mirrored` · `saveAttachment mirrored` · `saveOcrCorrection mirrored`
6. 스냅샷을 fixture 로 변환:
   ```bash
   node species-catalog/tests/import-fixture.mjs <파일>.json --slug=<업체>-<특징>
   node species-catalog/tests/ocr-accuracy.mjs
   ```
7. 새 fixture 는 **처음엔 실패한다** — 그것이 원하는 신호다. 실패 계층이
   자동 분류되므로 그에 따라 대응한다

### 촬영 가이드 (C등급 감소용)

현 corpus 실패의 73%(8/11)가 이미지 계층이다. 아래가 파서 개선보다 효과가 크다.

| 항목 | 기준 |
|---|---|
| 각도 | 정면. 사다리꼴 왜곡 최소화 |
| 조명 | 균일. 그림자·반사 회피 |
| 프레임 | 명세서가 화면을 채우도록 |
| 초점 | **품목 표 영역**에 맞춘다 (표의 얇은 행이 가장 먼저 소실된다) |
| 형식 | JPEG. 과도한 압축 회피 |

콘솔에 `Image too small to scale!!` / `Line cannot be recognized!!` 가 보이면
그 이미지는 표 행이 전처리에서 소실된 것이다 — 재촬영이 유일한 해법이다.

## 부록 B. 조회 쿼리

```sql
-- 누적 현황
select count(*) as 총건수,
       round(avg((debug_meta->>'confidence')::numeric), 3) as 평균confidence,
       min(created_at) as 최초, max(created_at) as 최근
from public.ocr_corrections;

-- 엔진 버전별 추이 (엔진 교체 시 비교 기준)
select engine_version, count(*),
       round(avg((debug_meta->>'confidence')::numeric), 3) as 평균confidence
from public.ocr_corrections group by 1 order by 1;

-- 품목 미인식(C등급 후보) — parsed rows 가 비었는데 사용자는 입력한 건
select invoice_id,
       jsonb_array_length(coalesce(parsed_fields->'rows','[]'::jsonb))      as parsed품목,
       jsonb_array_length(coalesce(user_edited_fields->'items','[]'::jsonb)) as 사용자품목,
       debug_meta->>'confidence' as confidence
from public.ocr_corrections
where jsonb_array_length(coalesce(parsed_fields->'rows','[]'::jsonb)) = 0
  and jsonb_array_length(coalesce(user_edited_fields->'items','[]'::jsonb)) > 0
order by created_at desc;

-- 상호 미인식(A등급 후보)
select invoice_id,
       parsed_fields->'supplier'->>'name' as parsed상호,
       user_edited_fields->'header'->>'supplier' as 사용자상호,
       length(raw_text) as raw길이
from public.ocr_corrections
where coalesce(parsed_fields->'supplier'->>'name','') = ''
  and coalesce(user_edited_fields->'header'->>'supplier','') <> ''
order by created_at desc;
```
