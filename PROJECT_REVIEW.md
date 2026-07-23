# PROJECT REVIEW — Species Catalog

> 외부(CTO) 리뷰용 상태 리포트. **최종 갱신: 2026-07-23 (Cloud Self Test 7/7 PASS 반영)**.
> 근거: 리포 `ushwa` / `species-catalog/`. 브랜치 `claude/plant-species-flowering-filter-7gww27`,
> main `d43c572`. OCR 회귀는 `node species-catalog/tests/ocr-accuracy.mjs` 실측.
> ✅ = 코드/명령/검증으로 확인됨, ⚠️ = 미확인·미완.

## 0. 이번 갱신의 핵심 변화

- **Cloud Self Test 7/7 PASS** (사용자 PC 브라우저 `?cloudtest=1`, 2026-07-23).
  → Cloud 레이어가 "코드만 있고 한 번도 켜본 적 없음" 상태에서
  **"실브라우저에서 동작 실증됨"** 으로 전환. Sprint 게이트 해제 → 다음은 T5(migration).

## 1. 프로젝트 목적

- **해결하려는 업무 문제** ✅: 한국 조경업체 거래명세서(수기+인쇄 혼재)를 사람이
  옮겨 적는 수작업을, OCR 로 구조화하고 **공용 DB로 축적**해 없앤다.
- **현재 구현된 핵심 기능** ✅ (`species-catalog/js` 25 모듈): 업로드 → Tesseract
  OCR → 3-Step 위저드 검토/수정 → 저장, 수종 3-tier 매칭, 거래 이력/상세, 첨부
  뷰어(IndexedDB), OCR Debug Panel, 회귀 코퍼스(24 fixture)·러너·실패 분류기.
- **최종 목표**: 공용 거래명세서 DB + 자가개선 OCR 엔진 → "대한민국 최고의 조경
  AI 플랫폼". 수종 도감은 첫 모듈. 견적·발주·농장 네트워크는 ⚠️ Planned
  (`IDEAS.md`/`DATA_MODEL.md §4`).

## 2. 현재 기술 구조

- **Frontend** ✅: Vanilla JS ES6 모듈, 번들러 없음, 정적(GitHub Pages).
  계층: Presentation → `app.js` → Domain(vision·preprocess·matcher·stats·filter·
  utils) → Repository(cloudStore·storage·attachmentStore) → Infra(supabaseClient·
  supabaseConfig·auth·cloudSelfTest).
- **데이터 저장**:
  - **LocalStorage v2** — 현재 authoritative (Cloud=SoT 전환은 T6, 미완 ⚠️)
  - **IndexedDB** — 첨부 blob
  - **Supabase** — 9테이블+`price_history` VIEW. ✅ **대시보드 적용·동작 실증(7/7)**.
    dual-write 미러. (읽기 전환 T6 전까지 LocalStorage 가 원본)
- **OCR 처리 흐름** ✅: `preprocess.js` → `vision.js`(Tesseract kor+eng, psm 6→4
  confidence 재시도, 15s idle watchdog) → `normalizeOcrText` → `parseInvoiceText`
  → `matcher.js`(NFD-jamo 3-tier).
- **AI 데이터 학습 구조** ✅ 스키마·동작 / ⚠️ 배선: `ocr_corrections`(raw·normalized·
  `parsed_fields ↔ user_edited_fields`·`engine_version`, INSERT-ONLY). 7단계에서
  RPC write/read 실증됨. ⚠️ 앱 내 학습데이터 자동 적재(T9)는 미완.
- **인증 구조** ✅: Supabase Auth Google 단일, 로그인 게이트(`auth.js` JS 주입),
  users upsert(attribution), 공용 데이터. **7/7 session 단계 통과로 실증**.

## 3. 현재 완료된 작업

- **구현 완료 기능** ✅: 위저드 등록, OCR 파이프라인, 수종 매칭, 거래 이력/상세,
  첨부 저장/뷰어, Debug Panel, OCR 코퍼스·러너·분류기·fixture 임포터.
- **Cloud** ✅: SQL 4종(schema/policies/triggers/rpc), supabaseClient/Config, auth+
  게이트, cloudStore(dual-write), cloudSelfTest(7단계). **7/7 PASS 로 동작 실증**.
- **테스트 결과**:
  - ✅ OCR 회귀 **229/240 (95.4%) PASS** (24 fixture · 240 필드)
  - ✅ **Cloud Self Test 7/7 PASS** (2026-07-23, 사용자 PC 브라우저)
- **완료 Sprint/Task** ✅: T1~T4 코드 완료 + **Cloud Self Test 게이트 통과**.
  정본 문서 8종(VISION·ROADMAP·ARCHITECTURE·DEVELOPMENT_RULES·CLAUDE·IDEAS·
  DATA_MODEL·본 리뷰). `cloud-test-log.md` 에 PASS·운영 체크리스트 기록.

## 4. 현재 위험 요소

- **기술 부채** ⚠️: dual-write 실앱 플로우(위저드 저장→Cloud 미러)의 실사용
  검증은 7단계 테스트 거래로만 확인됨 — 실제 사용자 저장 경로 반복 검증 필요.
  Tesseract 한계로 11 fixture 실패(대부분 OCR-layer).
- **데이터 구조 문제** ⚠️: 아직 **LocalStorage 가 authoritative**(T6 전) →
  Cloud 로 승격(T5) 전까지 실질 원본은 로컬. `ocr_corrections` 필드단위
  confidence 부재. `suppliers.norm_name`=lower+공백제거 → OCR 훼손 중복 위험.
- **보안** ✅: Publishable Key 공개는 정상(RLS 가 실보안). anon 차단·authenticated
  공용·INSERT-ONLY·audit SELECT-only. **7/7 에서 RLS/RPC 권한 동작 실증**.
- **확장성** ⚠️: 번들러 없는 25+ 모듈 관리 부담. `price_history` VIEW 대규모 시
  MATERIALIZED 전환 필요(임계 미정).
- **유지보수** ⚠️: 문서(`DATA_MODEL.md`) ↔ `schema.sql` 수동 동기화(drift 위험).
  **미push 커밋 다수**(컨테이너 소멸 시 유실).

## 5. 현재 의사결정이 필요한 부분

- **방향** ✅ 일관: Cloud=SoT + 공용 DB + 자가개선 OCR. 7/7 로 토대 실증됨. 유지.
- **재설계** — 없음. 결정 필요: `supplier_aliases`·`field_confidence` 스키마
  확장 시점(T5~T9 중 어디).
- **우선순위** — 게이트 해제됨 → **T5(migration.js)** 착수 여부/시점 확정 필요.
  한 번에 한 Sprint 원칙 유지 권장.

## 6. 다음 1~3개월 로드맵

- **반드시**: T5 `migration.js`(LocalStorage→Cloud 1회 승격, 무손상·id 보존) →
  T6 읽기 전환(Cloud=SoT). 이후 T8(Cloud Storage 첨부), T9(ocrRepository).
- **미뤄도 됨**: T7 Realtime, T10 dual-write 제거, IDEAS 의 Business/Planned.
- **예상 병목**: migration 무손상 검증(LocalStorage 기존 데이터 → Cloud) ·
  OCR 99% 목표는 Tesseract 한계로 장기(엔진 A/B).

## 7. CTO 관점 평가

- **완성도** (⚠️ CTO 주관 추정, 100점):

| 영역 | 이전 | 현재 | 근거 |
|---|---|---|---|
| OCR 엔진/앱 | ~85 | ~85 | 회귀 95.4% |
| Authentication | ~60 | **~85** | 7/7 session 실증 |
| Database(schema) | ~55 | **~85** | 7/7 schema/read 실증 |
| RPC | ~55 | **~85** | 7/7 save_invoice_tx write 실증 |
| Storage(첨부) | ~40 | ~40 | Cloud Storage(T8) 미착수 |
| Cloud Sync(dual-write) | ~40 | **~65** | RPC 경로 실증·읽기전환(T6) 미완 |
| Realtime | ~5 | ~5 | 미착수 |
| Migration Ready | ~10 | **~40** | 게이트 해제·migration.js 미작성 |

  → **종합: "로컬 앱 MVP + 클라우드 토대 실증 완료. 이제 데이터 승격(T5)
  단계."** (이전: "클라우드 미점화")
- **가장 큰 기회**: 실거래 기반 데이터 해자 — Cloud 실증됨 → 축적 개시 가능.
- **가장 큰 위험**: 데이터가 아직 LocalStorage 원본 → **T5 migration 무손상**이
  다음 최대 리스크.
- **지금 당장 3가지**:
  1. T5 `migration.js` 설계(무손상·id 보존·1회 승격·롤백 가능)
  2. dual-write 실앱 저장 경로 반복 검증(테스트 거래 아닌 실사용)
  3. 미push 커밋 push 로 자산 보호(사용자 승인 시)

## 부록: 확인된 상태 (사실)

- 브랜치 `claude/plant-species-flowering-filter-7gww27`, main `d43c572`(Cloud 코드 없음) ✅
- OCR 회귀 229/240 (95.4%) PASS ✅
- Cloud Self Test **7/7 PASS** (2026-07-23, 사용자 PC 브라우저) ✅
- 구조: 루트 문서 8 · `js` 25 · `supabase` SQL 4 · `tests` 러너 4 + fixture 24 ✅
