# ADMIN — 관리자 운영 구조 설계

> **설계 전용 문서다. 이 문서로 구현하지 않는다.**
> 현재 리포(`species-catalog/`)의 실제 코드·스키마를 확인해 작성했으며,
> 확정되지 않은 것은 `[확인 필요]` 로 표시한다.
> 원칙: **신규 권한 체계를 만들지 않는다** — 기존 `users.role` 을 재사용한다.

## 0. 권한 기반 — 신규 생성 불필요 (확인 완료)

| 자산 | 위치 | 상태 |
|---|---|---|
| 역할 컬럼 | `schema.sql:28` `role text not null default 'user' check (role in ('user','admin'))` | **이미 존재** |
| 사용자 미러 | `auth.js:139` 로그인 시 `users` upsert | **이미 동작** |
| RLS 기준 | `policies.sql` — 전부 `to authenticated` | admin 전용 정책을 **추가**하는 방식으로 확장 가능 (기존 정책 수정 불필요) |
| 현재 admin 사용처 | `policies.sql:58` 주석뿐 | **아직 아무 기능도 role 을 읽지 않음** |

**결론**: 권한 체계는 이미 있고, 남은 것은 ① 클라이언트가 `role` 을 읽는 것
② admin 전용 RLS 정책을 **추가**하는 것뿐이다.

⚠️ **보안 원칙**: 클라이언트의 `role` 판정은 **화면 제어용**일 뿐이다.
실제 강제는 반드시 **RLS/RPC(서버측)** 로 한다 — 정적 사이트라 클라이언트
코드는 신뢰할 수 없다.

## 1. 관리자 모드 구조

```
Admin Dashboard  (role='admin' 일 때만 진입)
 ├ OCR Review        — AI 결과 검수 · 학습 데이터 확정
 ├ Species Manager   — 운영 수종 정리(중복 병합 · 품질)
 ├ Plant Guide Approval — 도감 → Species 승격 승인
 └ Audit Log         — 변경 이력 조회
```

### 1-1. Admin Dashboard

| 항목 | 내용 |
|---|---|
| 목적 | 관리자 전용 진입점. 4개 영역으로 분기 |
| 필요 데이터 | `users.role`(현재 사용자) |
| 권한 | `role='admin'` |
| 기존 연결점 | `auth.js` `currentUser()` · `users` upsert 경로 |
| 위험 | 클라이언트 판정만으로 보호하면 **우회 가능** → 데이터 보호는 RLS 로 |

### 1-2. OCR Review — §2 상세

| 항목 | 내용 |
|---|---|
| 목적 | OCR 결과 ↔ 사용자 수정 쌍을 검수해 **학습 데이터로 확정** |
| 필요 데이터 | `ocr_corrections`(raw·normalized·parsed·edited·debug_meta) |
| 권한 | 조회: authenticated · **확정/반려: admin** |
| 기존 연결점 | `vision.js` `_debug.raw` · `debugPanel.js:435-447`(3-way diff 로직 **재사용**) |
| 위험 | **현재 `ocr_corrections` 에 쓰는 코드가 0** → 검수할 데이터 자체가 없음(T9 배선 선행 필요) |

### 1-3. Species Manager

| 항목 | 내용 |
|---|---|
| 목적 | 운영 수종 품질 관리 — 중복 수종 병합, 잘못 자동 생성된 수종 정리 |
| 필요 데이터 | `species` · `invoice_items`(참조 수) |
| 권한 | **admin 전용**(병합은 거래 이력에 영향) |
| 기존 연결점 | `matcher.js` 유사도(중복 후보 탐지) · `app.js` `deleteSpecies`(참조 시 거부 정책) |
| 위험 | **병합은 되돌리기 어렵다** — `invoice_items.species_id` 재지정이 필요하고, 잘못 병합하면 가격 이력이 뒤섞인다. 반드시 `audit_log` 기록 + 사전 미리보기 |

### 1-4. Plant Guide Approval — PLANT_GUIDE §5-1/5-2 참조

| 항목 | 내용 |
|---|---|
| 목적 | 도감 항목 → Species 승격 승인 |
| 필요 데이터 | 도감 레코드(`pg-*`) · 기존 `species`(중복 검사) |
| 권한 | 요청: authenticated · **승인: admin** |
| 기존 연결점 | `plantGuideStore.getById` · `app.js` `saveSpecies` |
| 위험 | 승격 payload 에 `prices`/`purchaseCounts` 가 섞이면 **Invoice 가 합성됨**(app.js:185) |

### 1-5. Audit Log — §3 상세

| 항목 | 내용 |
|---|---|
| 목적 | 누가·언제·무엇을 바꿨는지 조회 |
| 필요 데이터 | `audit_log`(이미 자동 기록 중) |
| 권한 | 조회 authenticated(현 정책) · **admin 전용으로 좁힐지** `[확인 필요]` |
| 기존 연결점 | 없음 — **조회 화면만 만들면 됨** |
| 위험 | `old_data`/`new_data` 전문이 담기므로 화면 노출 범위 주의 |

## 2. OCR Review 설계

### 현재 OCR 저장 구조 (실제 코드)

```
vision.js  analyzeInvoice()
   └ 반환 { invoiceDate, invoiceNumber, supplier, rows[], meta,
            _debug:{ provider, model, latencyMs, confidence,
                     raw:{ text, normalized, passes[] } } }        (vision.js:378-397)
        ↓
invoiceModal  session.analysis (:273) → 사용자가 header/items 편집 (:334·349, write-back)
        ↓
app.js  saveInvoice → invoice.analysis = extras.analysis  (:434)
        ↓
LocalStorage 에만 저장 —
   · cloudStore.invoiceToRpc 가 analysis 를 전송하지 않음
   · invoiceFromDb 도 복원하지 않음
   → **Cloud-first read 가 로컬을 덮는 순간 raw/normalized 소실**
```

**검수 대상 데이터가 아직 축적되지 않는다**는 것이 핵심 제약이다.
`ocr_corrections` 테이블·RLS(INSERT-ONLY)는 완비돼 있으나 **쓰는 코드가 0건**이다.

### 목표 흐름

```
① 업로드 → OCR (vision.js)         : raw · normalized · parsed
② 사용자 수정 (위저드)              : edited
③ 저장 시 ocr_corrections INSERT    ← **T9 배선 필요 (미구현)**
        { raw_text, normalized_text, parsed_fields, user_edited_fields,
          debug_meta, engine_version, version }
        ↓
④ Admin OCR Review
        · 목록: 필드별 불일치 건수 · confidence · engine_version 별 추이
        · 상세: parsed ↔ edited 3-way diff (debugPanel 로직 재사용)
        · 판정: [확정] → 학습 데이터로 승인 · [반려] → 사유 기록
        ↓
⑤ 확정분 → fixture 승격 후보 (fixtures 테이블 + git corpus)
```

### 판정 결과 저장 `[확인 필요]`

`ocr_corrections` 는 **INSERT-ONLY**(policies.sql:89-92 · UPDATE 정책 없음)라
행에 검수 상태를 쓸 수 없다. 후보:

| 안 | 방식 | 평가 |
|---|---|---|
| A | 검수 결과를 **새 correction 행**으로 INSERT(version+1) | append-only 유지 · 권장 |
| B | 신규 테이블 `ocr_reviews` | 명확하나 Cloud 스키마 추가 |
| C | 저장 안 함(조회 전용 대시보드) | 최소 구현 |

**권장**: 1단계는 **C**(읽기 전용 대시보드), 검수 이력이 필요해지면 **A**.

## 3. Audit Log 설계

### 기존 자산 — **이미 구현되어 있다** (확인 완료)

| 구성 | 위치 | 상태 |
|---|---|---|
| 테이블 | `schema.sql:168-177` `audit_log(id, table_name, row_id, action, old_data, new_data, changed_by, changed_at)` | 존재 |
| 기록 | `triggers.sql:41` `fn_audit()` **SECURITY DEFINER** | 자동 |
| 대상 | species · suppliers · invoices · invoice_items · attachments **5개 테이블** INSERT/UPDATE/DELETE | 존재 |
| 정책 | `policies.sql:107` `audit_select` — **SELECT 만**(앱이 직접 쓸 수 없음) | 존재 |
| 인덱스 | `schema.sql:230-233` `(table_name,row_id)` · `(changed_by, changed_at desc)` | 존재 |
| 앱 사용 | **없음** — `cloudSelfTest.js:147` 검증 조회가 유일 | **화면 미구현** |

→ **새로 만들 것이 없다. 조회 UI 만 붙이면 된다.**

### 조회 화면 설계

- **필터**: 기간 · `table_name` · `action` · `changed_by`
  (두 인덱스가 `(table_name,row_id)`·`(changed_by,changed_at)` 이므로 이 조합이 효율적)
- **목록**: 시각 · 사용자 · 테이블 · 액션 · row_id
- **상세**: `old_data` ↔ `new_data` diff (debugPanel diff 로직 재사용 가능)
- **페이징**: `changed_at desc` + limit — 전량 로드 금지(감사 로그는 무한 증가)

### 감사되지 않는 영역 (알고 있어야 할 공백)

| 영역 | 이유 |
|---|---|
| `ocr_corrections` · `fixtures` | INSERT-ONLY 라 행 자체가 이력 → 의도적으로 트리거 미부착(`triggers.sql:69-71`) |
| LocalStorage 단독 변경 | Cloud 미러 실패 시 서버에 기록이 남지 않음 |
| 도감(Plant Guide) | 정적 파일 · 런타임 변경 없음 |

## 4. Promotion 구현 전 최종 검토

PLANT_GUIDE §5-2 에서 코드로 검증한 내용의 요약 + 최종 판정.

| 항목 | 판정 | 근거 |
|---|---|---|
| `guide_id` 전달 | ⚠️ **코드 1줄 필요** | `extractSpeciesMeta`(app.js:138-148)가 7필드만 반환 → 생성 경로에서 탈락. 권장: 패스스루 1줄 |
| `saveSpecies` 부작용 | ✅ **안전** | `prices`/`purchaseCounts` 미전달 시 `purgeInvoiceRecordsFor`=no-op, `synthesize`=0건(app.js:185·223) |
| Cloud 저장 | ⚠️ **불가(현재)** | `speciesToDb`/`speciesFromDb` 8필드 · `species` 테이블에 컬럼 없음 → **로컬 전용 링크** |
| 중복 검사 | ✅ 확정 | exact name → 유사도 ≥0.85 → 신규. `matcher.js` import 만 |
| Rollback | ✅ 가능 | 승격 직후엔 거래 이력 0 → `deleteSpecies` 통과(T6 Phase3 정책) · Cloud 행도 삭제 |
| Invoice/OCR 영향 | ✅ 없음 | 저장 경로 재사용, 신규 로직 없음 |

### 승인이 필요한 사항 (구현 착수 조건)

1. `extractSpeciesMeta` 에 `guide_id` 패스스루 **1줄 추가** — Species 코드 변경
2. 승격 UI(도감 상세의 [이 수종 등록] 버튼) 추가 — `plantGuideModal.js`
3. 승격 시 `saveSpecies` 호출 규약: **`prices`/`purchaseCounts` 미포함** 강제

→ 위 3건 승인 시 구현 가능. **Cloud 반영은 별도 승인**(migration + 필드 2개).

## 5. 구현 순서 제안 (착수 시)

```
1. Audit Log 조회      ← 위험 0 · 기존 자산만 노출 · 즉시 가치
2. Plant Guide Approval ← 설계·검증 완료 · Species 쓰기 1곳
3. OCR Review          ← T9(ocr_corrections 배선) 선행 필요
4. Species Manager     ← 병합은 비가역 · 마지막 · audit_log 필수
```

**근거**: 위험도 오름차순. Audit Log 는 읽기 전용이라 회귀 위험이 사실상 0 이고,
Species Manager 의 병합은 가장 비가역적이라 감사 로그가 먼저 보이는 상태에서
착수해야 한다.

## 6. 공통 위험 요소

| 위험 | 대응 |
|---|---|
| 클라이언트 role 우회 | 화면 제어만 담당 · 데이터 보호는 **RLS/RPC** |
| admin RLS 정책 추가 시 기존 정책 파손 | 기존 정책 **수정 금지**, `create policy` 로 **추가만** · 신규 migration SQL |
| Species 병합 비가역성 | 미리보기 + `audit_log` + 참조 건수 표시 필수 |
| OCR 검수 데이터 부재 | T9 배선 전에는 화면을 만들어도 **표시할 데이터가 없음** |
| 관리자 기능이 운영 데이터 손상 | 모든 쓰기는 기존 저장 경로 재사용(신규 저장 로직 금지) |

## 7. `[확인 필요]`

1. `audit_log` 조회 권한을 admin 전용으로 좁힐지 (현재 authenticated 전체)
2. OCR 검수 판정 저장 방식 (A: 새 correction 행 / B: 신규 테이블 / C: 저장 안 함)
3. Species 병합 정책 — `invoice_items.species_id` 재지정 허용 여부
4. Admin 진입 방식 — 별도 화면 vs 기존 UI 내 조건부 노출
