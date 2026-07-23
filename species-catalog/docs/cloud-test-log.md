# Cloud Self Test — 실패·수정 누적 로그

`?cloudtest=1` 브라우저 셀프테스트(7단계)에서 발생한 실패와 수정을 시간순으로
누적 기록한다. 같은 문제가 재발하지 않도록 원인과 해결을 남긴다.

- 기준: **브라우저 `?cloudtest=1` 7단계 결과만** (cloud-smoke.mjs 미사용)
- 목표: **Cloud Self Test 7/7 PASS**
- 7/7 달성 후: 이 로그를 기준으로 하단 "운영 체크리스트" 작성 → 그 다음 T5(Migration)

## 7단계 정의 (참조)

| 단계 | 검증 |
|---|---|
| 1 env | SUPABASE_URL / PUBLISHABLE_KEY 설정 |
| 2 reach | `auth/v1/health` 도달성 |
| 3 provider | Google Provider 활성 여부 (`auth/v1/settings`) |
| 4 session | 로그인 세션 + 사용자 정보 |
| 5 schema | `species` SELECT (schema.sql 적용 여부) |
| 6 write | `save_invoice_tx` 테스트 거래 1건 저장 |
| 7 read | users·invoices·invoice_items·suppliers·audit_log 5테이블 종합 검증 |

## 관련 파일 (수정 대상 후보)

| 파일 | 역할 |
|---|---|
| `js/supabaseConfig.js` | URL · Publishable Key |
| `js/supabaseClient.js` | SDK 싱글턴 |
| `js/auth.js` | 로그인 게이트 · OAuth · users upsert |
| `js/cloudSelfTest.js` | 7단계 러너 |
| `supabase/schema.sql` | 테이블 · 뷰 · 인덱스 |
| `supabase/policies.sql` | RLS |
| `supabase/triggers.sql` | audit_log · updated_at/version |
| `supabase/rpc.sql` | save/update/delete_invoice_tx |

---

## 누적 기록

<!-- 새 항목은 이 줄 아래에 최신순으로 추가. 형식:

### [YYYY-MM-DD] 실패 단계: <N 단계명>
- **원인**:
- **수정 파일**:
- **수정 내용**:
- **결과**: (재검증 후 PASS/FAIL · 몇 단계까지 통과)

-->

### [2026-07-23] Cloud Self Test — 7/7 PASS ✅
- **결과**: 사용자 PC 브라우저 `?cloudtest=1` 기준 **1~7단계 전부 PASS**.
- **의미**: env · reach · Google provider · session · `species` SELECT(schema)
  · `save_invoice_tx` write · 5테이블(users·invoices·invoice_items·suppliers·
  audit_log) read 검증 통과 → Supabase 스키마/정책/트리거/RPC 가 실제
  대시보드에서 동작함을 실증.
- **수정 파일**: 없음 (러너·스키마 코드 변경 없이 통과. 사용자가 대시보드에
  SQL 4종 적용 + Google Provider 활성 후 달성).
- **비고**: 판단 기준은 브라우저 결과(정본). 컨테이너는 egress 차단으로 재현
  불가. 콘솔 `console.table(results)` 세부가 필요하면 이 항목 아래 첨부.

---

## 운영 체크리스트

> 7/7 PASS(2026-07-23) 기준. 환경 변경 시 재점검용 상시 체크리스트.

- [x] Supabase 대시보드에 `schema → policies → triggers → rpc` 4종 적용
- [x] Auth → Google Provider 활성
- [x] Auth → Redirect URLs 에 실행 origin 등록
- [x] anon 전면 차단 · authenticated 공용 R/W (RLS 동작)
- [x] `save_invoice_tx` write · 5테이블 read · `audit_log` 자동 기록 동작
- [ ] (다음) T5 `migration.js` — LocalStorage → Cloud 1회 승격 설계

**재점검 트리거**: Supabase URL/Key 변경 · 스키마 변경 · 배포 도메인(Redirect
URL) 추가 시 → `?cloudtest=1` 재실행하여 **7/7 유지** 확인.
