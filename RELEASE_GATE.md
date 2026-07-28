# RELEASE GATE — Production 전환 차단 규칙

> **이 문서는 구속력 있는 규칙이다.**
> 아래 4개 조건이 **전부** 충족되기 전까지 `merge` · `push` · Pages 배포를
> 진행하지 않는다. 하나라도 미완료면 상태는 **HOLD** 다.
>
> 판정 기준은 "코드가 준비됐는가"가 아니라 **"되돌릴 수 없는 노출·손실이
> 남아 있는가"** 다. 현재 코드는 준비되어 있고, 막고 있는 것은 전부
> 환경 설정과 공개 범위 문제다.

작성 시점 기준선 — branch `claude/plant-species-flowering-filter-7gww27` ·
HEAD `16b8d36` · `origin/main` `d43c572` (0 ahead / 35 behind).

---

## 현재 상태 요약

| 조건 | 내용 | 상태 |
|---|---|---|
| 1 | Supabase Migration 적용 | ⛔ 미완료 — **사용자만 가능** |
| 2 | OAuth 검증 (`?cloudtest=1` 7/7) | ⛔ 미완료 — **사용자만 가능** |
| 3 | LocalStorage Migration 판단 | ⛔ 미완료 — **사용자만 가능** |
| 4 | Public Artifact 개인정보 제거 | ⛔ 미완료 — **승인 시 대응 가능** |

**→ 종합 판정: HOLD**

---

## 조건 1. Supabase Migration 적용 완료

Production Supabase SQL Editor 에서 **아래 순서로** 실행한다.

| 순서 | 파일 | 목적 |
|---|---|---|
| 1 | `species-catalog/supabase/2026-07-28_protect_user_role.sql` | `users.role` 자가승격 취약점 제거 · `audit_log` users 기록 활성화 |
| 2 | `species-catalog/supabase/2026-07-27_supplier_upsert_fix.sql` | supplier upsert 로직 보완 |
| 3 | `species-catalog/supabase/storage.sql` | `attachments` 버킷 생성 · Storage RLS 적용 |

1번을 먼저 적용해야 관리자 계정을 지정하는 시점에 이미 보호가 걸려 있다.

### 적용 후 필수 검증

- [ ] `users.role` self escalation 재현 **실패** 확인
      (로그인 상태 브라우저 콘솔에서 `update public.users set role='admin'`
      → `42501` 거부)
- [ ] 기존 로그인 upsert **성공** 확인 (로그아웃 → 재로그인 정상)
- [ ] 관리자 지정 SQL **성공** 확인
      `update public.users set role='admin' where email='<관리자 이메일>';`
- [ ] Storage anon 접근 **차단** 확인 (버킷 `public = false`)

### 참고 — 로컬 사전 검증 결과 (Production 검증을 대체하지 않음)

PostgreSQL 16 에 프로젝트 원본 `schema/triggers/policies/rpc.sql` 을 적용하고
Supabase 기본 GRANT(`grant all … to anon, authenticated`)까지 재현해 확인한
결과다. **Production 에서 다시 확인해야 한다.**

| 검증 | 결과 |
|---|---|
| 취약점 재현 (적용 전) | `UPDATE 1` → `role = admin` |
| 차단 (적용 후) | `ERROR 42501` · `role = user` 유지 |
| 로그인 upsert (`auth.js:139` 동일 컬럼) | 성공 · role 보존 |
| SQL Editor 관리자 지정 (`auth.uid()` null) | 성공 · `audit_log` 에 `user → admin` 기록 |
| admin 계정의 role 변경 | 동일하게 `42501` — 예외 없음 |
| supplier fix | 적용 전 no-op → 적용 후 수정 반영 · 빈 값은 기존 값 보존 |
| Storage | 버킷 `public=f` · anon SELECT 0행 · anon INSERT 차단 · UPDATE 정책 없음 |
| 멱등성 | 3개 파일 전부 2회 적용 무해 |
| rollback | 3개 파일 전부 복구 확인 (1번은 rollback → 재적용 왕복까지) |

---

## 조건 2. OAuth 검증 완료

Supabase → Authentication → URL Configuration

```
Site URL       https://ushwa260301-maker.github.io/ushwa/
Redirect URLs  https://ushwa260301-maker.github.io/ushwa/**
```

**와일드카드(`**`)는 선택이 아니라 필수다.** `auth.js:89` 가
`redirectTo: window.location.href` 로 **전체 URL(쿼리 포함)** 을 넘기므로,
루트만 등록하면 `?cloudtest=1` · `?debug=1` · `admin.html` 복귀가 전부 실패한다.
localhost 항목은 삭제하지 않는다 — 개발 검증 경로가 끊긴다.

Google Cloud Console → OAuth 2.0 Client 의 Authorized redirect URI 에
`https://egbbqibiaeuntzbabpec.supabase.co/auth/v1/callback` 존재 확인.

### 검증

- [ ] `?cloudtest=1` 실행 → **7/7 PASS**
- [ ] **4단계 `session` 성공 확인 전 merge 금지**
      (Redirect URL 미등록이면 정확히 여기서 멈춘다 — 이 단계가
       등록 여부를 판별하는 유일한 관문이다)

---

## 조건 3. LocalStorage Migration 판단 완료

### 위험 (실측으로 재현됨)

merge 후 첫 부팅에서 다음이 성립하면 로컬 전용 데이터가 조용히 사라진다.

1. `hasPending()` = **false** — `species-catalog:sync:pending` 키는 feature
   코드가 처음 만드는 것이라 기존 데이터에는 존재한 적이 없다
   (`syncManager.js:50-52`). 유일한 가드가 처음부터 꺼져 있다.
2. `fetchAll()` 성공 + `isCloudUsable()` = true (`app.js:722-728`)
3. → `app.js:760` `storage.save(merged)` 실행
4. `storage.js:34-36` 이 `species` · `invoices` · `invoiceItems`
   **3개 키를 통째로 교체**

브라우저 재현 결과: 거래 **50건 → 49건**, 로컬 전용 1건 소실,
`hasPending: false`. (`meta` 키는 보존 · 첨부는 IndexedDB 라 영향 없음)

### 분기

- [ ] **데이터 존재** → `?migrate=1` 접속 →
      콘솔 `await window.speciesMigration.runMigration({ dryRun:false })`
      → 완료 확인 후 merge
- [ ] **데이터 없음** → "없음 확인" 을 이 문서에 기록 후 진행

`migration.js` 는 LocalStorage 도메인 키를 쓰지 않는다 (`setItem` 1곳,
대상은 자기 로그 키 `species-catalog:migration:log` 뿐 · `storage` 는
`load()` 만 사용). idempotent 라 재실행해도 안전하다.

---

## 조건 4. Public Artifact 개인정보 제거 완료

### 문제

`pages.yml:44` 가 `./species-catalog` **전체**를 artifact 로 업로드하므로
아래가 함께 공개된다.

| 경로 | 내용 |
|---|---|
| `tests/` (30 파일) | OCR 회귀 fixture · 러너 |
| `supabase/` (SQL 7개) | 스키마 · RLS 정책 · 마이그레이션 |

`tests/ocr-corpus/21~24` 는 **실제 거래명세서 사진**에서 만든 fixture 다
(설명에 실명 상호 · iPhone JPEG · KakaoTalk 촬영 명시). 특히 fixture 24 에는
**실명 상호 · 실제 휴대폰번호 · 은행명 · "예금주" · 계좌번호 형태 문자열**이
포함되어 있다. 01~20 은 합성 번호라 무해하다.

**정적 파일은 로그인 게이트를 거치지 않는다.** 배포 즉시
`https://…/ushwa/tests/ocr-corpus/24-….json` 로 누구나 열람 가능해진다.

`supabase/*.sql` 공개는 자격증명 유출이 아니고 RLS 자체가 검증되어 실질
위험은 낮다. **거래처 전화번호·계좌 정보 공개는 성격이 다르다.**

### 해소 방법 (택일 · 승인 필요)

| 안 | 방법 | 영향 |
|---|---|---|
| **ⓐ 권장** | `pages.yml` 에서 `tests/` · `supabase/` 를 artifact 에서 제외 | 배포물만 축소 · 회귀 기준 229/240 무영향 · 저장소 파일 무변경 |
| ⓑ | fixture 민감값 비식별화 | OCR 회귀 전면 재검증 필요 · fixture 수정 금지 규칙과 충돌 |

- [ ] 방침 결정
- [ ] 적용 후 배포 artifact 에 민감 파일이 없음을 확인

---

## 이미 통과한 항목 (재검증 불필요, 참고용)

| 항목 | 결과 |
|---|---|
| OCR accuracy | 229 / 240 · 95.4% PASS |
| Guide Validator | PASS · ERROR 0 / WARN 0 |
| Species / Invoice / InvoiceItem | 12 / 49 / 122 |
| 카드 렌더 · 검색 · 상세 · 수정 · 삭제 | 전부 정상 (삭제는 참조 존재 시 거부 정책 포함) |
| uncaught error | 0 |
| RLS 전수 (9개 테이블) | anon 정책 0개 · anon SELECT 전부 0행 · anon 쓰기/RPC 차단 |
| RPC 3종 | SECURITY INVOKER · anon revoke 확인 · 동적 SQL 0건 |
| 기존 파일 변경 규모 | 수정 3개 (index.html 순수 추가 · app.js async 전환 · vision.js 파서) · 삭제 0 · 시드 byte-identical |
