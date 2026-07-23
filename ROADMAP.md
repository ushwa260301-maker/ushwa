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

## 명시적으로 확정되지 않은 것 `[확인 필요]`

- 7/7 PASS 이후 T5~T10 의 세부 순서 조정 여부 [확인 필요]
- 각 단계의 목표 완료 일정 [확인 필요]
- OCR 외 AI 기능(가격/수요 예측 등)의 로드맵 편입 시점 [확인 필요]
