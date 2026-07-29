# DEVELOPMENT_RULES

> 대화에서 확정된 작업 규칙만 기록한다. 확정되지 않은 것은 `[확인 필요]`.
> **모든 작업은 이 문서 + VISION/ROADMAP/ARCHITECTURE 를 먼저 읽고 시작한다.**

## 0. 작업 순서 (항상 준수)

```
① 구조 분석  → ② 변경 계획  → ③ 구현  → ④ 검증
```
추측해서 구현하지 않는다. 불확실한 부분은 `[확인 필요]` 로 명시 후 진행.

## 1. 현재 Sprint 우선순위 (확정)

- 지금은 **Cloud Self Test 7/7 PASS** 가 최우선.
- **7/7 PASS 이전 절대 금지**: Migration(T5) · 데이터 이전 ·
  Cloud SoT 전환 · Dual-Write 제거 · 신규 기능 · 리팩토링.
- 현재 Sprint 범위만 구현. 미래 기능은 구현하지 않는다(구조만 확장 가능).

## 2. 기존 기능 보호 (확정)

- 모든 변경은 회귀 테스트를 통과해야 한다:
  `node species-catalog/tests/ocr-accuracy.mjs` → **229/240 (95.4%) 유지**.
- 성공한 것을 깨뜨리는 변경은 되돌린다.

## 3. Cloud Test iteration 규칙 (확정)

사용자가 브라우저 콘솔 로그를 전달하면 아래를 자동 진행:
```
① 실패 단계 분석 → ② 원인 추정 → ③ 수정 계획 → ④ 수정(최소 범위)
→ ⑤ Commit → ⑥ Push(feature branch) → ⑦ cloud-test-log.md 갱신
→ ⑧ 프로젝트 상태 평가
```
- **판단 기준은 브라우저 `?cloudtest=1` 결과만.** cloud-smoke.mjs 는 참고.
- **실패한 단계만** 수정. 성공한 단계는 건드리지 않는다.
- 수정은 최소 범위. 리팩토링·신규 기능 금지 — 실패 원인만 제거.
- 중간에 확인을 요구하지 않고, 명백한 위험이 없는 한 끝까지 진행.

## 4. cloud-test-log.md 갱신 (확정)

모든 Cloud Test 수정 후 `species-catalog/docs/cloud-test-log.md` 에 누적:
```
### YYYY-MM-DD
Step:
원인:
수정 파일:
수정 내용:
재검증 결과:
```
같은 문제가 재발하지 않도록 원인·해결을 남긴다.

## 5. Git 규칙 (확정)

- 수정 후 **Commit + Feature Branch Push** 까지만.
- **main merge 절대 금지** (현재 브랜치: `claude/plant-species-flowering-filter-7gww27`).
- Commit 하나 = 논리적 변경 하나.

## 6. OCR 품질관리 규칙 (확정 · 별도 트랙)

OCR 트랙은 Cloud 트랙과 독립이며 `vision.js`/`preprocess.js`/`matcher.js`
및 fixture 만 대상.

- **수정 우선순위**: OCR Engine(Tesseract psm/oem/retry) → 이미지 전처리
  → normalizeOcrText → Parser. **Parser 는 최후 수단.**
- **Parser 수정 2조건(AND)**: OCR raw 에 정답이 exact 또는 NFD-jamo
  유사도 ≥ 0.85 로 존재 AND Parser 가 잘못 해석. 둘 중 하나라도 미달 시
  Parser 수정 금지. **raw 에 없는 값은 추측해서 만들지 않는다.**
- **Rows 전체 미인식**: Parser 수정 금지 → OCR Engine/전처리 개선.
- **3-Strike Rule**: 같은 유형 실패가 3+ fixture 반복 → Parser 중단 →
  OCR Engine 개선 전환. Parser 수정은 전체의 20% 이하 목표.
- **하드코딩 금지**: 업체명·전화·계좌·주소·브랜드 등 고유명사를 규칙에
  넣지 않는다. 문서 제목(거래명세표/거래명세서/작성년월일/공급대가총액/
  합계/품목/규격/수량/단가/금액)은 일반 Noise Dictionary 로만 처리.
- **Fixture**: 실제 명세서마다 새 fixture 추가. 절대 삭제·기존 수정 금지.
- **OCR Engine 변경 시 A/B Test**: baseline vs candidate · 비교항목
  Supplier/Date/Rows/Confidence/CharRecall(=max NFD-jamo similarity) ·
  실패 fixture 1 + 성공 fixture 5 이상 동시 · 평균 향상 시에만 채택 ·
  단일 fixture 만 좋아지는 설정 폐기.

## 7. 데이터·OCR 철학 (확정 · VISION 요약)

- 코드보다 데이터. OCR 은 학습 데이터 생성 엔진.
- Cloud = SoT, LocalStorage = 캐시. 데이터는 공용(개인 소유권 없음).
- Fixture 는 영구 누적 자산.

## 8. 수정 허용 범위 (확정)

| 트랙 | 허용 파일 |
|---|---|
| Cloud | supabaseConfig/Client · auth · cloudStore · cloudSelfTest · app.js(접점) · supabase/*.sql · (T5~ 신규 모듈) |
| OCR | vision.js · preprocess.js · matcher.js · tests/ocr-corpus · tests/*.mjs |
| 문서 | VISION/ROADMAP/ARCHITECTURE/DEVELOPMENT_RULES · cloud-test-log.md |

그 외(HTML/CSS/기존 모달/stats 등)는 해당 Sprint 가 명시적으로 요구할
때만 수정.

## 9. 프로젝트 상태 평가 (매 iteration 출력)

항목별 100점: Authentication · Database · RPC · Storage · OCR ·
Cloud Sync · Realtime · Migration Ready.
각 항목 현재 점수 · 감점 이유 · 다음 iteration 최우선 작업 1개.

## 명시적으로 확정되지 않은 것 `[확인 필요]`

- 커밋 서명(Verified) 정책 — 현재 환경은 로컬 검증 불가로 hook 이 오탐 [확인 필요]
- 문서 4종의 최종 위치(루트 vs docs/) [확인 필요]
- 코드 리뷰·PR 승인 프로세스 [확인 필요]
