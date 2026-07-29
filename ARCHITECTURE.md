# ARCHITECTURE

> 대화에서 확정되고 **실제 리포에 존재하는** 구조만 기록한다.
> 확정되지 않은 설계는 `[확인 필요]`.

## 배포 · 실행 형태 (확정)

- **정적 사이트** — 빌드 단계 없음. GitHub Pages 로 배포.
  (`.github/workflows/pages.yml` 이 `species-catalog/` 를 배포)
- 브라우저 ES 모듈(`type="module"`) 직접 로드. 번들러 없음.
- 백엔드 서버 없음 — Supabase 를 브라우저 클라이언트 SDK 로 직접 사용.

## 계층 구조 (확정 · 실제 파일 기준)

```
Presentation   index.html · ui.js · components.js · modal.js ·
               invoiceModal.js · historyModal.js ·
               transactionDetailModal.js · attachmentViewer.js ·
               debugPanel.js · debugFlag.js
      ↓ 콜백(onSave 등) — 저장 방식 무지
Application    app.js (유스케이스 오케스트레이션) · state.js (메모리 상태)
      ↓ Repository 인터페이스 호출
Domain         vision.js · preprocess.js · matcher.js ·
               stats.js · filter.js · utils.js
               (순수 함수 — 저장소/네트워크 무지 · OCR 엔진 포함)
      ↓
Repository     cloudStore.js (Cloud CRUD · dual-write 미러) ·
               storage.js (LocalStorage 캐시) ·
               attachmentStore.js (IndexedDB 첨부 캐시) ·
               ocrRepository.js [미생성 · T9]
      ↓
Sync           syncManager.js [미생성 · T7]
      ↓
Infra          supabaseClient.js · supabaseConfig.js · auth.js
               cloudSelfTest.js (?cloudtest=1 검증 러너)
```

**의존 규칙**: 위 → 아래 단방향. Domain 은 Repository 를 모른다
(vision.js 가 Cloud 를 아는 순간 OCR 계약 위반). Presentation 은
Repository 를 직접 호출하지 않고 항상 app.js 를 경유한다.

## 데이터 저장 (확정)

| 데이터 | 저장소 | 상태 |
|---|---|---|
| species · invoices · invoice_items · meta | 현재 LocalStorage v2 (캐시 전환 예정) / Cloud(T6) | dual-write 중 |
| 첨부 원본(JPG/PNG/PDF) | IndexedDB `species-catalog` / Cloud Storage(T8) | 로컬만 |
| OCR 학습 데이터 | Cloud `ocr_corrections` | 스키마만(T9 배선) |
| Fixture | git `tests/ocr-corpus/*.json` (24개) + Cloud mirror(T9) | git primary |

## Cloud DB 스키마 (확정 · supabase/*.sql)

7 테이블 + 1 뷰 + audit:
`users · suppliers · species · invoices · invoice_items · attachments ·
ocr_corrections · fixtures · audit_log` + `price_history` VIEW.

- **id TEXT 보존**: species(`sp-###`)/invoices(`inv-###`)/items(`item-###`)
  — LocalStorage 마이그레이션 무손상.
- **invoice_items.spec NULLABLE**: 규격은 Optional (추측 금지).
- **ocr_corrections / fixtures INSERT-ONLY**: RLS 로 UPDATE/DELETE 차단.
- **audit_log**: 트리거(SECURITY DEFINER)가 자동 기록.
- **RPC 트랜잭션**: save_invoice_tx / update_invoice_tx / delete_invoice_tx
  — 단일 트랜잭션 · 낙관적 잠금(version).
- **RLS**: anon 정책 0개(전면 차단) · authenticated 공용 R/W.

세부는 `species-catalog/supabase/{schema,policies,triggers,rpc}.sql` 참조.

## 인증 (확정)

- Supabase Auth · **Google Provider 단일**.
- 미로그인 → 전체 화면 로그인 게이트(auth.js 가 JS 로 동적 주입 ·
  HTML/CSS 무수정). 로그인 후 users upsert (attribution).
- `supabaseConfig.js` 에 URL·Publishable Key. 미설정 시 게이트 비활성 ·
  LocalStorage 단독 동작 (안전한 단계 전환).

## OCR 파이프라인 (확정 · Domain · Cloud 독립)

```
File → preprocess.js (2× · gray · contrast · sharpen)
     → vision.js (Tesseract kor+eng · psm 6→4 confidence 재시도)
     → normalizeOcrText → parseInvoiceText (detectSupplier/rows/date/number)
     → matcher.js (NFD-jamo 3-tier: match/possible/new)
     → AnalyzeResult(JSON) — 이 shape 는 인터페이스 계약(동결)
```

`_debug.raw` 에 원문·정규화·pass·confidence 를 담아 Debug Panel 과
OCR 학습 데이터(ocr_corrections)의 원료가 된다.

## 회귀 안전장치 (확정)

- `tests/ocr-accuracy.mjs` — 24 fixture · 240 필드 · 229 PASS(95.4%).
  `<95%` 시 exit 1.
- `tests/classify-failure.mjs` — 실패를 OCR/Parser/Matcher/Ambiguous 로
  자동 분류 (pass/fail 판정 무변경 · 진단만).

## 명시적으로 확정되지 않은 것 `[확인 필요]`

- Cloud Storage 버킷 구조 · 썸네일 전략 (T8) [확인 필요]
- Realtime 채널 구성 · 충돌 UX 세부 (T7) [확인 필요]
- price_history 를 MATERIALIZED VIEW 로 전환하는 임계 규모 [확인 필요]
- 문서 4종의 리포 내 위치 규약(루트 vs docs/) — 현재 루트에 생성함,
  변경 원하면 [확인 필요]
