# ROADMAP

> 대화에서 확정된 단계(T1~T8)와 현재 Sprint 만 기록한다.
> 미래 기능은 구현하지 않는다 — 구조만 확장 가능하게 둔다.
> 확정되지 않은 것은 `[확인 필요]`.

## 현재 Sprint (확정)

### Sprint: Cloud Self Test 7/7 PASS

**목표**: 실제 사용자 환경(브라우저)에서 Cloud Self Test 7단계를 모두
통과시킨다. 이것이 통과하기 전에는 **Migration(T5)·신규 기능·리팩토링을
절대 진행하지 않는다.**

**현재 하위 작업**: 로그인 게이트 미표시 원인 제거 → 그 다음 7/7 검증.

**판단 기준**: 브라우저 `?cloudtest=1` 결과만. (`cloud-smoke.mjs` 는 참고용)

**7단계 정의**
| 단계 | 검증 |
|---|---|
| 1 env | SUPABASE_URL / PUBLISHABLE_KEY 설정 |
| 2 reach | auth/v1/health 도달성 |
| 3 provider | Google Provider 활성 여부 |
| 4 session | 로그인 세션 + 사용자 정보 |
| 5 schema | species SELECT (schema.sql 적용) |
| 6 write | save_invoice_tx 테스트 1건 저장 |
| 7 read | users·invoices·invoice_items·suppliers·audit_log 종합 검증 |

## Cloud 전환 단계 (T1~T10 · 확정된 계획)

| 단계 | 내용 | 상태 |
|---|---|---|
| T1 | Supabase 스키마 (schema/policies/triggers/rpc.sql) | ✅ 코드 작성 완료 · **대시보드 적용 [확인 필요]** |
| T2 | supabaseClient.js | ✅ 완료 |
| T3 | auth.js + 로그인 게이트 | ✅ 코드 완료 · **브라우저 실증 미완** |
| T4 | cloudStore.js + dual-write 미러 | ✅ 코드 완료 · 실동작 미검증 |
| **현재** | **Cloud Self Test 7/7 PASS** | 🔄 진행 중 |
| T5 | migration.js (LocalStorage → Cloud 1회 승격) | ⛔ **7/7 PASS 전 금지** |
| T6 | 읽기 전환 (Cloud = SoT) | 미착수 |
| T7 | syncManager.js (Realtime · 충돌 · 오프라인 큐) | 미착수 |
| T8 | attachmentStore 역할 전환 (Cloud Storage) | 미착수 |
| T9 | ocrRepository.js (OCR 학습 데이터 · fixture 자동 생성) | 미착수 |
| T10 | dual-write 제거 (storage.js 순수 캐시화) | 미착수 |

## OCR 품질 트랙 (Cloud 트랙과 병행 · 별도)

- 실제 거래명세서 fixture 를 계속 누적하며 OCR 정확도 개선.
- 현재 fixture 24개 · 240 필드 · 229 PASS (95.4%).
- 수정 우선순위: OCR Engine → 이미지 전처리 → normalizeOcrText → Parser.
- 이 트랙은 Cloud 작업과 독립이며, vision.js/preprocess.js/matcher.js
  만 대상. (DEVELOPMENT_RULES.md 참조)

## 절대 금지 (7/7 PASS 이전)

- Migration · 데이터 이전 · Cloud SoT 전환 · Dual-Write 제거
- 신규 기능 개발 · 리팩토링

## 미래 제안 (Sprint 밖 · 구현하지 않음 · 기록 전용)

> Decision Priority(Business>Product>Data>Architecture>Sprint>Code)에 따라
> 도출한 Sprint 밖 아이디어. **구현하지 않는다.** 7/7 PASS 이후 검토 대상.
> (대화의 `## 프로젝트 제안`·`## Business Proposal` 을 영속 기록.)

### 데이터·아키텍처 제안
- **필드 단위 OCR Confidence** — `ocr_corrections.field_confidence jsonb`.
  어느 필드가 약한지 정량화 → OCR 개선 최우선 근거 (T9 배선 시).
- **engine_version 기록 배선** — 파싱 결과의 엔진 버전 저장 → 시간에 따른
  A/B 개선 측정 가능 (현재 컬럼 존재하나 항상 '').
- **Supplier Alias 매핑** — `supplier_aliases(alias_norm, supplier_id)`.
  OCR 훼손 업체명 중복 방지·데이터 무결성. **하드코딩 금지, 데이터로만.**
- **수정↔이미지 영역(bbox) 연결** — `ocr_corrections.attachment_id` +
  `regions jsonb`. 영역 단위 학습·자동 재파싱 (T8 이후).

### Business 제안 (수익모델·대상 규모는 VISION `[확인 필요]`)
- **수종별 실거래 시세 데이터 자산** — `price_history` 기반. 자가신고가
  아닌 실거래 시세 → 복제 난이도 높은 해자.
- **공급업체 네트워크** — 실거래로 검증된 활성 공급업체 → 발주·견적 매칭 토대.
- **견적/발주 자동화** — 수종+시세+공급업체 결합 시 성립. 다음 모듈 후보.
- **획득 루프** — 무료 OCR = 획득 훅, `ocr_corrections` = 해자. freemium 후보.

## 명시적으로 확정되지 않은 것 `[확인 필요]`

- 7/7 PASS 이후 T5~T10 의 세부 순서 조정 여부 [확인 필요]
- 각 단계의 목표 완료 일정 [확인 필요]
- OCR 외 AI 기능(가격/수요 예측 등)의 로드맵 편입 시점 [확인 필요]
