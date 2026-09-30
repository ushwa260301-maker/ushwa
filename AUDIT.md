# AUDIT — species-catalog baseline audit

```
Audit Date   : 2026-09-23
Audit Base   : 584ca21
Scope        : species-catalog/ · 루트 문서 · .github/
Out of Scope : backend/ frontend/ mobile/ shared/
Status 갱신  : 2026-09-30 · 38dfc9f (claude/chowhwa-list-project-ntltaz)
```

**Baseline Rule** — 이 감사는 `584ca21` 기준이다.
- **Evidence · Impact 는 `584ca21` 시점 코드의 스냅샷으로 동결한다.** 이후 코드가 바뀌어
  줄 번호가 밀려도 고치지 않는다. 틀린 것으로 밝혀지면 `Correction:` 을 덧붙인다.
- **Status · Required Action · Dependency · Verification 만 갱신한다.**
- 절차는 [AUDIT_PROTOCOL.md](./AUDIT_PROTOCOL.md) 를 따른다.

**Out of Scope** — `backend/` `frontend/` `mobile/` `shared/`(추적 파일 234개)는 본 감사에서
코드 감사하지 않았으며, 별도 프로젝트로 보이는 `어서화`(`package.json` name `eoseohwa`)
관련 영역이다. **본 감사의 결론을 해당 영역에 적용하지 않는다.** 1차 스캔에서 하드코딩된
비밀 값은 발견되지 않았다(`.env.example` 만 존재) — 전수 감사는 아니다.

**개인정보 표기** — 이 문서는 개인정보 값을 담지 않는다 (AUDIT_PROTOCOL §4). 저장소가
공개 상태이므로 실물 PII 가 있던 **구체 파일명도 적지 않는다** — 유형과 위치 범주만 적는다.

---

## 상태 요약

| ID | 항목 | Type | Status |
|---|---|---|---|
| P0-1 | 저장소 fixture 에 실물 개인정보 | DEFECT | FIXED · §9 ③ |
| P0-2 | OCR 결과가 개인정보를 장기 저장 | DEFECT | FIXED · §9 ③ |
| P0-3 | Cloud 기존 저장분 | DEFECT | **OPEN — 정리 SQL 실행 대기** |
| P0-4 | Git 히스토리의 실물 개인정보 | DECISION | OPEN |
| P0-5 | 첨부 원본 이미지 | DECISION | OPEN |
| P0-6 | 유선 전화번호 실물/합성 미분류 | DECISION | OPEN |
| P0-7 | 재유입 차단 장치 부재 | DEFECT | FIXED · §9 ③ |
| P0-8 | 파서 단계 1차 방어 | DECISION | OPEN (P1 보류) |
| P0-9 | 연락처 출처 메타데이터(contactSource) | DECISION | DECIDED — 지금 도입하지 않음 |
| P1-1 | 충돌 1건이 Cloud 읽기를 영구 차단 | DEFECT | OPEN |
| P1-2 | `guide_id` Cloud 왕복 소실 | DEFECT | OPEN |
| P1-3 | 백업·복구 전략 부재 | DEFECT | OPEN |
| P1-4 | authenticated 전원 DELETE 권한 | DECISION | OPEN |
| P1-5 | `engine_version` 설계/구현 불일치 | DEFECT | OPEN |
| P2-1 | CI 에 테스트 없음 | DEFECT | VERIFIED (브랜치 기준 · main 미반영) |
| P2-2 | E2E 테스트 없음 | DEFECT | OPEN |
| P2-3 | 오류 모니터링 없음 | DEFECT | OPEN |
| P2-4 | 동시성 미검증 | DEFECT | OPEN |
| P4-1 | OCR 99% 목표의 도달 경로 | DECISION | OPEN |
| P4-2 | 회귀 표본 24건 | DECISION | OPEN |
| P4-3 | 문서 드리프트 | DEFECT | OPEN (일부 해소) |
| P4-4 | 한 저장소에 두 프로젝트 공존 | DECISION | OPEN |
| P4-5 | 공개 배포 저장소 분리 | DECISION | OPEN |

**P0 정의 (2026-09-28 재정의)** — 기존 "저장소 Private 전환" 이 아니라
**"OCR 로 수집된 개인정보(전화·계좌·예금주)를 저장하지 않고, 기존 저장분을 제거하며,
CI 가 재유입을 차단한다."** Private 전환은 P0 의 필수 조건이 아니다.

---

## P0 — 개인정보

### P0-1 · 저장소 fixture 에 실물 개인정보
- Type : DEFECT · Severity : P0
- Status : **FIXED** · §9 ③ (브랜치 CI green · PR/main 미반영)
- Evidence : `species-catalog/tests/ocr-corpus/` 의 **실물 거래명세서 기반 fixture 4건**에
  제3자 실명 · 금융계좌 · 휴대폰번호 · 사업장 도로명주소. `ocr`(원문)과 `expect`(정답),
  `description` · `coverage.reason` · `changeLog` 에 걸쳐 있었고, 같은 번호가 4건에
  교차 참조되었다. 소스 주석(`vision.js` 2곳 · `classify-failure.mjs` 1곳) ·
  `OCR_DATA_POLICY.md` 예시(4줄) · `supplier-matcher.mjs` 테스트 입력(1건, 별개 실물 명세서)
  에도 실제 값이 있었다. `vision.js` 주석에는 운영 거래명세서의 유선번호가 3가지 표기로 있었다.
  `.github/workflows/pages.yml:44-48` 주석이 이 사실을 알고 배포물에서만 제거했다.
- Impact : 저장소가 public 이라 누구나 열람 가능 (GitHub API `private: false`, 비인증 HTTP 200).
- Required Action : — (완료)
- Verification :
  - 비식별화 전후 fixture 별 점수 동일 · 전체 229/240 유지
  - `584ca21` 원본에서 추출한 실제 값 5종 → 작업 트리 346개 파일 잔존 **0건**
  - PII guard 전수(in-scope 112개 파일) **PASS**
- 커밋 : `3368ca6`
- **Correction (2026-09-30)** : `3368ca6` 의 커밋 메시지가 비식별화한 fixture 의 **번호를 명시**했다.
  값은 없지만, 공개 히스토리에서 실물 데이터의 위치를 가리키는 안내가 된다. 본 문서가
  파일명을 적지 않는 원칙(AUDIT_PROTOCOL §4)과 어긋난다. P0-4 결정 범위에 포함한다.

### P0-2 · OCR 결과가 개인정보를 장기 저장
- Type : DEFECT · Severity : P0
- Status : **FIXED** · §9 ③
- Evidence (`584ca21`) :
  - `cloudStore.js:431-432` — `raw_text: dbg.raw?.text || ""` · `normalized_text: dbg.raw?.normalized || ""` (원문 그대로)
  - `cloudStore.js:440` — `debug_meta: stripHeavyDebug(dbg)` · `:462` stripHeavyDebug 는 이미지 2개만 삭제
    → 원문이 `debug_meta.raw` 에 **한 번 더** 저장
  - `vision.js:452` `lowConfidenceLines: lowConfLines` · `:479` `out.push({ text, … })` — 저신뢰 OCR 줄 원문
  - `cloudStore.js:439` — `user_edited_fields: { header, items }` (header.supplierPhone 포함)
  - `cloudStore.js:105` `supplierPhone: inv.supplierPhone || ""` → rpc 가 `invoices.supplier_phone` · `suppliers.phone` 기록
  - `cloudStore.js:64` 읽기 복원 · `app.js:460` `invoice.analysis = extras.analysis` (LocalStorage 원문 전체)
  - `triggers.sql:58` — `to_jsonb(old), to_jsonb(new)` → **audit_log 가 모든 insert/update 의 전화를 복사**
- Impact : 계좌·전화·예금주가 Cloud 5개 경로 · LocalStorage · audit_log · 내보내기 JSON 에 장기 보관.
- Required Action : — (완료)
- Verification :
  - `js/sanitize.js` 저장 직전 정제 — `tests/sanitize.mjs` **56/56** (제거·보존·멱등·`_debug` 전체 트리)
  - 브라우저 E2E(Playwright · LocalStorage 단독 · `?ocr=mock`) **17/17** — 등록 → 저장 → 상세 수정 → 재부팅, 콘솔 오류 0
  - 입력 UI 제거 — 입력한 연락처가 저장 시 조용히 버려지던 `#invPhone` · `#detailPhone`
    (`#detailPhone` 은 HTML 상 readonly 이나 수정 모드에서 입력 가능했다)
- 커밋 : `3368ca6` · `dbf7a02` · `0a58fca`
- **Correction (2026-09-30)** : `3368ca6` 시점의 정제는 `raw.text` / `raw.normalized` 만 다뤘다.
  `lowConfidenceLines` 는 브라우저 E2E 에서 발견되어 `dbf7a02` 에서 `_debug` 전체 트리 정제로 해결.

### P0-3 · Cloud 기존 저장분
- Type : DEFECT · Severity : P0
- Status : **OPEN** — 정리 SQL 준비·로컬 검증 완료 · **Cloud 실행 대기 (사용자)**
- Evidence : P0-2 의 저장 경로로 이미 기록된 행. 이 세션은 Cloud DB 에 접근할 수 없다
  (Supabase 커넥터 없음 · DB 자격 증명 없음 · 에이전트 프록시가 `*.supabase.co` 차단 ·
  공개 키는 anon 이라 RLS 가 전부 거부 — anon 조회 결과 "0건" 은 **정리됐다는 뜻이 아니다**).
- Impact : 운영 DB 에 개인정보가 남아 있을 수 있다. audit_log 는 로그인 사용자 전원이 조회 가능.
- Required Action : Supabase SQL Editor 에서 **한 파일씩** 실행.
  1. `supabase/2026-09-28_remove_ocr_pii_1_preview.sql` — 결과 A(T1~T5) · B(F01~F18) 공유
  2. 검토·승인 후 `…_2_cleanup.sql` — 자기 검증 실패 시 전체 롤백
  3. `…_3_verify.sql` — 결과 공유
- Dependency : 없음
- Verification (완료 기준) : `3_verify` 결과 A **T1~T5 = 0** · 결과 B **F01~F18 이 1_preview 와 전부 동일** ·
  결과 C **C1 · C2 PASS**. 로컬 PostgreSQL 16 검증: 정상 · 거래 데이터 손상 주입(롤백) ·
  개인정보 재주입(롤백) · 재실행 · 오류 후 계속 실행(ROLLBACK) 5개 시나리오 통과.

### P0-4 · Git 히스토리의 실물 개인정보
- Type : DECISION · Status : OPEN
- Evidence : P0-1 의 값이 `584ca21` 이전 커밋에 남아 있다. 저장소는 public.
- 결정 사항 : 히스토리 재작성 여부. 재작성하면 모든 SHA 가 바뀌고, GitHub 는 force push 후에도
  고아 커밋을 SHA 로 한동안 열어두므로 **GitHub Support 에 삭제 요청**까지 해야 실효가 있다.
  `engine_version` 은 SHA 를 쓰지 않으므로 재작성의 영향을 받지 않는다 (부록 기각 가설 참조).

### P0-5 · 첨부 원본 이미지
- Type : DECISION · Status : OPEN
- Evidence : 원본 이미지가 Storage(`attachments`) 와 IndexedDB 에 보관된다. 이미지 안의 글자는
  텍스트 정제로 지울 수 없다.
- 결정 사항 : 원본 보관 기간·범위. 학습 루프(OCR_DATA_POLICY §1)는 원본 이미지를 입력으로 쓴다.

### P0-6 · 유선 전화번호 실물/합성 미분류
- Type : DECISION · Status : OPEN
- Evidence : 합성 fixture 01~20 과 **공개 배포되는** 시드 카탈로그 `data/species.json`(판매자
  프로필 연락처)에 유선번호 형식 값이 다수 있다. 저장소 안에서 실물/합성을 가릴 수 없다.
  PII guard 는 유선번호를 판정하지 않는다.
- 결정 사항 : 시드 판매자 연락처의 공개 배포 유지 여부 · 유선번호를 guard 대상에 넣을지.

### P0-7 · 재유입 차단 장치 부재
- Type : DEFECT · Status : **FIXED** · §9 ③
- Evidence : `584ca21` 의 `.github/workflows/` 에는 `pages.yml` 하나. fixture 정책은 문서 규칙뿐.
- Verification : `.github/scripts/pii-guard.mjs` — 휴대폰은 `.github/pii-allowlist.json` 명시 허용 목록만
  통과, 계좌 허용 목록 없음, 예금주는 데이터 파일에서 검사. in-scope 전수 + 변경분 검사.
  음성 대조(실제 형식 휴대폰·계좌·예금주) 차단 확인. CI run `36668157467` 통과.

### P0-8 · 파서 단계 1차 방어
- Type : DECISION · Status : OPEN (P1 로 보류)
- 결정 사항 : 파서가 연락처를 결과 객체에 넣지 않게 할지. 비용 — `supplier.contact` 는 회귀
  240 필드 중 24 필드(기준선 재정의), `ARCHITECTURE.md:83` AnalyzeResult 는 "인터페이스
  계약(동결)", 개인정보 대부분은 원문(`_debug.raw`)에 있어 파서 변경으로 해결되지 않는다.
  현재 1차 방어선은 `sanitize.js`.

### P0-9 · 연락처 출처 메타데이터
- Type : DECISION · Status : **DECIDED (2026-09-28)** — 지금 도입하지 않는다. 판매자 등록 기능 설계에서 결정.
- 근거 : 신규 OCR 경로는 연락처를 쓰지 않으므로 새 데이터에는 불필요하고, 기존 데이터는 출처를
  소급할 수 없다. 기존 OCR 자동 생성 수종은 notes 의 "거래명세서 등록으로 자동 생성" 표지로
  식별할 수 있으나, 이후 사용자 편집 여부는 알 수 없다.

---

## P1 — 데이터 무결성

### P1-1 · 충돌 1건이 Cloud 읽기를 영구 차단
- Type : DEFECT · Status : OPEN
- Evidence (`584ca21`) : `app.js:813-814` — `if (res?.conflict) { conflicts.push(…)` 로 pending 유지 ·
  `app.js:895-897` — `if (hasPending())` → flush 후에도 남으면 `return localData`. 충돌 해결 UI 진입점 0개.
- Impact : 충돌 1건 이후 그 기기는 Cloud 를 읽지 않는다. 다른 기기의 변경이 보이지 않고 오류도 없다.
- Required Action : 충돌 해결 UI · 해결 후 pending 제거 · Cloud 재조회.
- Dependency : P2-2 (통합 경로 검증 수단)
- Verification : 충돌 발생 → 사용자 해결 → pending 제거 → Cloud 재조회까지 통합 검증.

### P1-2 · `guide_id` Cloud 왕복 소실
- Type : DEFECT · Status : OPEN
- Evidence (`584ca21`) : `cloudStore.js:28` `speciesToDb` · `:41` `speciesFromDb` 가 8개 필드만 다룸 ·
  `schema.sql` 에 `guide_id` 없음 (출현 0). PLANT_GUIDE.md §5-4 에 손실 지점 4곳 기록.
- Required Action : 컬럼 추가 migration · 매핑 2곳 · rpc upsert.
- Dependency : Plant Guide 승격(P3) 의 선행 조건.
- Verification : Cloud 왕복 후 `species.guide_id` 보존.

### P1-3 · 백업·복구 전략 부재
- Type : DEFECT · Status : OPEN
- Evidence : 백업 경로는 `importExport.js` 수동 JSON 내보내기뿐. Supabase 백업 주기·복구 절차 문서 없음.
- Required Action : Supabase 플랜의 백업 범위 확인 `[확인 필요]` · 복구 절차 문서화.
- Verification : 복구 리허설 1회 기록.

### P1-4 · authenticated 전원 DELETE 권한
- Type : DECISION · Status : OPEN
- Evidence (`584ca21`) : `policies.sql:49` · `:67` · `:76` — `for delete to authenticated using (true);`
- 결정 사항 : VISION "데이터는 공용" 원칙상 의도된 설계인지. audit_log 는 기록만 하고 되돌리지 않는다.

### P1-5 · `engine_version` 설계/구현 불일치
- Type : DEFECT · Status : OPEN
- Evidence (`584ca21`) : `schema.sql:124` 주석 "engine_version = vision.js 커밋 SHA → 엔진 버전별 정확도 추이" ↔
  `cloudStore.js:441` `engine_version: dbg.model || ""` · `vision.js:254` 값은 상수 `"tesseract-5 (kor+eng)"`.
- Impact : 엔진·전처리를 고쳐도 학습 데이터에서 개선 전후를 구분할 수 없다 (provenance 손실).
  `DEVELOPMENT_RULES.md` §6 "OCR Engine 변경 시 A/B Test" 가 실행 근거를 남기지 못한다.
  이미 쌓인 행은 소급할 수 없다 — 늦을수록 손실이 커진다.
- Required Action : 실행된 엔진 버전을 구분하는 식별자 기록 (빌드 없는 정적 사이트라 주입 방식 결정 필요).
- Dependency : P4-1 의 선행 조건.
- Verification : 수정 후 **새로 생성된** `ocr_corrections` 행에 버전 식별자가 저장되는지.

---

## P2 — 검증 체계

### P2-1 · CI 에 테스트 없음
- Type : DEFECT · Status : **VERIFIED (브랜치 기준 · main 미반영)**
- Evidence (`584ca21`) : `.github/workflows/` = `pages.yml` 하나 (배포 전용). 회귀 229/240 규칙의 강제 장치 없음.
- Verification : `.github/workflows/test.yml` — exit code 기반 러너 6개(ocr-accuracy · guide-validate ·
  sync-pending · supplier-matcher · service-items · sanitize) + PII guard. PR · feature branch 실행,
  `npm ci` 미사용. run `36668157467` 통과. (`cloud-smoke` · `import-fixture` · `classify-failure` 는
  게이트 대상 아님 — AUDIT_PROTOCOL §6)
- 커밋 : `f54ba7a`

### P2-2 · E2E 테스트 없음
- Type : DEFECT · Status : OPEN
- Evidence (`584ca21`) : `app.js` 1,122줄 · `invoiceModal.js` 1,006줄 등 UI·통합 경로 테스트 0.
- Note : P0-2 검증에 Playwright E2E(17 단정)를 썼으나 **저장소에 넣지 않았다** — CI 편입은
  Playwright 설치 방식 결정이 필요하다(`npm ci` 미사용 원칙과의 관계).
- Required Action : 최소 통합 테스트 기반.
- Verification : CI 에서 E2E 실행 green.

### P2-3 · 오류 모니터링 없음
- Type : DEFECT · Status : OPEN
- Evidence (`584ca21`) : `app.js` 전역 오류 핸들러(`window.onerror` · `unhandledrejection`) 0개. `console.*` 만 사용.
- Impact : 사용자 브라우저의 실패가 어디에도 남지 않는다. P1-1 같은 조용한 실패와 결합되면 진단 불가.

### P2-4 · 동시성 미검증
- Type : DEFECT · Status : OPEN
- Evidence : 실증은 단일 사용자·단일 기기. 2인 동시 편집 시나리오 테스트 0 · Realtime 없음.

---

## P4 — 전략 · 구조

### P4-1 · OCR 99% 목표의 도달 경로
- Type : DECISION · Status : OPEN
- Evidence : 회귀 229/240 (95.4%) · 실패 11 = OCR 계층 8 · Parser 2 · Ambiguous 1. 엔진 계층 실패가 73%.
  `VISION.md:45-46` "같은 유형 실패가 3개 이상 fixture 에서 반복되면 OCR Engine 개선으로 전환" 조건은 충족 상태.
- 방향 (합의) : 99% 를 폐기하지 않고 **"현재 24건 기준 95.4%, 100건 이상 실데이터 확보 후 재평가"**.
  엔진 비교는 P1-5(provenance) 이후.

### P4-2 · 회귀 표본 24건
- Type : DECISION · Status : OPEN
- 결정 사항 : 기준선(229/240) 재설정 시점과 방법.

### P4-3 · 문서 드리프트
- Type : DEFECT · Status : OPEN (일부 해소)
- Evidence (`584ca21`) : `ROADMAP.md:40-44` — T5 "▶ 다음" · T6 · T7 · T9 "미착수" ↔ 코드에 `migration.js` ·
  `loadCloudFirst()` · `syncManager.js` · `ocr_corrections` 배선 존재. `CLAUDE.md:43` 작업 브랜치가 실제와 다름.
- 해소된 부분 : P0 조치가 새로 만든 충돌(`OCR_DATA_POLICY.md` 원칙 1·3 ↔ 개인정보 제거)은
  원칙 5 추가로 해소 (`f6a4162`).
- Required Action : `ROADMAP.md` · `CLAUDE.md` · `PROJECT_REVIEW.md` 를 코드 실측에 맞춤.

### P4-4 · 한 저장소에 두 프로젝트 공존
- Type : DECISION · Status : OPEN
- Evidence : 위 Out of Scope 참조. 루트 `package.json` workspaces 가 species-catalog 와 무관한 영역을 가리킨다.

### P4-5 · 공개 배포 저장소 분리
- Type : DECISION · Status : OPEN
- 결정 사항 : 개발 저장소는 Private, 빌드 결과만 별도 Public 저장소로 배포할지. P0 의 선행 조건이 아니다.
  (배포물에는 `pages.yml` 이 `tests/` · `supabase/` · `docs/` 를 빼므로 fixture 가 들어간 적이 없다.)

---

## 부록 A · 조치 중 발생·해결한 결함 (baseline 밖)

`584ca21` 에는 없었고 P0 조치 과정에서 생겼다가 검증으로 잡은 결함이다.

| 결함 | 발견 경위 | 해결 |
|---|---|---|
| 치환 토큰 `[예금주]` · `[계좌번호]` 안의 라벨 단어가 재정제 시 계좌 라벨로 읽혀 **다음 줄 날짜를 삼킴**. 부팅마다 재정제하므로 데이터 손상 경로 | SQL 2회 실행 VERIFY 가 정확히 0 이 아님 | 토큰 `[PHONE]` · `[ACCOUNT]` · `[HOLDER]` · 라벨 규칙이 줄을 넘지 않음 · 예금주 ≠ 계좌 라벨. 구 코드에서 8건 실패하는 테스트 추가 |
| 라벨 계좌 규칙의 탐욕 매치가 계좌 앞자리를 라벨로 먹어 일부 노출 | `tests/sanitize.mjs` | 채움 구간에서 숫자 제외 |
| 비식별화 스크립트가 더미 전화를 계좌로 재치환 · 설명문의 자리표시 단어를 실명으로 오인 | 점수 229 → 227 · 치환 건수 불일치 | 되돌리고 원인 수정 후 재적용 (점수 전후 동일 확인) |
| PII guard 가 규칙을 설명한 문서 자신을 차단 · 서술어("예금주 라벨")를 실명으로 오인 | 로컬 · 전수 검사 | 예금주 규칙은 데이터 파일만 · 포획 단어 기준 판정 |
| 정리 SQL 이 한 파일이라 한 번의 실행으로 PREVIEW 와 UPDATE 가 함께 돌 수 있었고, 검증이 커밋 뒤라 손상을 되돌릴 수 없었음 | 실행 절차 검토 | 3개 파일 분리 · 커밋 전 자기 검증 (`38dfc9f`) |

## 부록 B · 기각된 가설

### 기각 · git history 재작성이 `engine_version` 을 깨뜨린다
- 가설 : filter-repo 가 SHA 를 바꾸면 `ocr_corrections.engine_version` 참조가 끊긴다 (`schema.sql:124` 주석 근거)
- 검증 : `cloudStore.js:441` — 기록 값은 SHA 가 아닌 상수
- 결론 : 기각. 검증 과정에서 별도 결함 P1-5 발견

### 기각 · 정리 SQL 이 audit_log 이벤트를 삭제한다 (외부 리뷰 제기)
- 검증 : `audit_log` 대상 문장은 `jsonb_set(…, '{supplier_phone}', '""')` 두 개뿐. `delete` 0개.
- 결론 : 기각. 키와 행·이벤트를 보존하고 전화 값만 비운다

### 기각 · `species.suppliers[].contact` 를 삭제한다 (외부 리뷰 제기)
- 검증 : 기존 값은 `scrubStoredData` 가 명시적으로 제외(테스트 고정) · 신규 OCR 유래만 `dropContact`
- 결론 : 기각. 리뷰가 권고한 정책이 이미 구현 상태
