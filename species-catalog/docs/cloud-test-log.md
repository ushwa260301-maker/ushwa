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

_아직 실패 보고 없음 — 사용자 첫 `?cloudtest=1` 결과 대기 중._

---

## 운영 체크리스트

> Cloud Self Test 7/7 PASS 달성 후, 위 누적 기록을 근거로 이 섹션을 채운다.
> (7/7 전에는 비워 둔다 — 실제 겪은 문제만 체크리스트화하기 위함)

_7/7 PASS 후 작성 예정._
