# ROADMAP

> 대화에서 확정된 단계(T1~T8)와 현재 Sprint 만 기록한다.
> 미래 기능은 구현하지 않는다 — 구조만 확장 가능하게 둔다.
> 확정되지 않은 것은 `[확인 필요]`.

## 현재 Sprint (확정)

### Sprint: T12-1 Species Detail UI — 진행 중

**T12 는 설계 Sprint 가 아니라 UI 구현 Sprint 다.** 설계가 필요한 단계는
남기되, **각 단계가 끝날 때마다 GitHub Pages 화면이 실제로 바뀌어야 한다.**
완료 기준은 문서 PASS 가 아니라 **웹 화면 PASS(스크린샷)** 다.

> **"배선 완료" 와 "화면 확인 완료" 를 반드시 분리해서 기록한다.**
> 같은 칸에 적으면 ROADMAP 이 실제 상태와 어긋난다.

#### 판정은 항상 두 칸으로 적는다

| 체크포인트 | 무엇을 본다 | 무엇이 아니다 |
|---|---|---|
| **구현 PASS (Local)** | 코드 연결 완료 · 테스트 통과 · 로컬 확인 | Sprint 종료가 아니다 |
| **Sprint PASS (Pages)** | GitHub Pages 배포 · 실제 화면 스크린샷 · PASS/FAIL 기록 | — |

**설계 완료만으로 Sprint 를 종료하지 않는다.**

**T12-1 현재 판정**
- 구현 PASS (Local) — ✅ **8/8 통과 (2026-09-23)**
- Sprint PASS (Pages) — ⬜ **미완료.** main 병합 → 배포 → 스크린샷이 남았다.

#### T12-1 완료 기준 — 카드 5개가 화면에 있다

데이터가 비어 있어도 된다. 이 Sprint 가 만드는 것은 **자리**다.

| # | 카드 | 코드 | Pages 확인 |
|---|---|---|---|
| 1 | 상세 페이지/모달 | ✅ | ⬜ |
| 2 | 이미지 카드 (없으면 자리표시자) | ✅ | ⬜ |
| 3 | 기본정보 카드 (과·속·생육형·광조건·개화월 칸) | ✅ | ⬜ |
| 4 | 출처 카드 (제공·동기화) | ✅ | ⬜ |
| 5 | 가격 카드 — **데이터 없음 가능** | ✅ | ⬜ |

**값이 `—` 로 비어 있어도 T12-1 PASS 다.** 값을 채우는 것은 T12-2 다.
T12-1 에서 임시 데이터를 넣지 않는다 — 원본 없는 값은 만들지 않는다.

> ⚠ **이전 계획에서 바뀐 점**: 산수국의 과/속/생육형/광조건/개화월 **표시**는
> T12-1 종료 조건이 아니라 **T12-2 UI PASS** 로 옮겨졌다. T12-1 은 칸이
> 있는지까지만 본다.

#### T12-1.5 GitHub Pages PASS 체크리스트

| # | 확인 | 기대 |
|---|---|---|
| 1 | 상세가 열린다 | 모달이 뜬다 |
| 2 | 이미지 카드 | 이미지 또는 "이미지 없음" 자리표시자 |
| 3 | 기본정보 카드 | 과·속·생육형·광조건·개화월 칸이 모두 있다 |
| 4 | 출처 카드 | 제공·동기화 두 줄이 있다 |
| 5 | 가격 카드 | "데이터 없음 — …" 문구 |
| 6 | 카드 순서 | 이미지 → 기본정보 → 가격 → 출처 |
| 7 | 모바일 390px | 가로 스크롤 없음 |
| 8 | 콘솔 | pageerror 0건 |

8개 + 스크린샷 → **T12-1 종료**.

검증 절차(고정): ① feature branch 개발 → ② 로컬 UI PASS → ③ main 병합
→ ④ Pages 배포 → ⑤ 스크린샷 PASS → ⑥ Sprint 종료.
Pages 는 `main` 만 배포한다(`.github/workflows/pages.yml`).

#### 이미 만들어 둔 것 (뒤 단계 선행)

T12-1 을 하며 뒤 단계의 배선이 함께 들어갔다. **배선일 뿐 화면 확인은 안 됐다.**

- **URL 딥링크** `?plant=산수국` · `?plant=Hydrangea serrata`
  → 이것의 UI PASS 는 **T12-3** 이다(실제 DB 조회).
  국명은 **정확히 같은 이름만** 학명으로 바꾼다 — 검색(T12-4)이 아니다.
- **`plantDetailSource`** 가 `plant_taxa` · `plant_images` 를 읽는다
  → 값이 화면에 뜨는 UI PASS 는 **T12-2** 다.
- 데이터 흐름은 이 한 경로만 쓴다:
  `plant_taxa → plantDetailSource → toDetailView → Detail UI`

---

### Sprint: Cloud Self Test 7/7 PASS — ✅ 완료 (2026-07-23)

**목표(달성)**: 실제 사용자 환경(브라우저)에서 Cloud Self Test 7단계를
모두 통과시킨다. → **7/7 PASS 확인**(사용자 PC 브라우저 `?cloudtest=1`).
게이트 해제 → **T5 migration.js 도 완료** (2026-09-23).

**T5 결과**: DRY-RUN 에서 이전 대상 0건 · 로컬 거래 77건 전부 Cloud 에 이미
존재(skip) · 경고 0건. T4 dual-write 미러가 저장 시점마다 Cloud 에 써 왔으므로
옮길 잔여분이 없었다. 실제 이전(`dryRun:false`)은 무동작이라 실행하지 않았다.

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
| T1 | Supabase 스키마 (schema/policies/triggers/rpc.sql) | ✅ 완료 · **대시보드 적용·동작 확인 (7/7)** |
| T2 | supabaseClient.js | ✅ 완료 |
| T3 | auth.js + 로그인 게이트 | ✅ 완료 · **브라우저 실증 완료 (7/7)** |
| T4 | cloudStore.js + dual-write 미러 | ✅ 코드 완료 · **write/read 실증 (7/7)** |
| **게이트** | **Cloud Self Test 7/7 PASS** | ✅ **PASS (2026-07-23)** |
| T5 | migration.js (LocalStorage → Cloud 1회 승격) | ✅ **완료 · 이전 대상 0건** — dual-write 로 이미 동기화 · DRY-RUN 확인 2026-09-23 |
| T6 | 읽기 전환 (Cloud = SoT) | 대기 — **현재 Sprint 는 T12-1** |
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

## 기준 도감 트랙 (T12 · Species Catalog)

**각 단계는 UI PASS 로 끝난다.** UI 변화가 없는 단계는 그렇게 적어 둔다 —
그 단계는 Sprint 종료를 화면으로 증명하지 않는다.

| 단계 | 내용 | UI PASS 기준 | 구현 | Sprint |
|---|---|---|---|---|
| T12-1 | Species Detail UI | 카드 5개가 화면에 있다 | ✅ 8/8 | ⬜ Pages |
| T12-2A | KNA 기준정보 연결 — **산수국 1종** | 산수국 상세에 **10개 항목 실제 표시** | ⬜ | ⬜ |
| T12-2B | `plant_taxa` 전체 적재 | 39,603종 적재 · 행 수 검증 | ⬜ | — |
| T12-3 | Cloud Read / URL 딥링크 실데이터 | `?plant=산수국` 로 **실제 DB 조회** · LocalStorage 는 캐시만 | ⬜ | ⬜ |
| T12-4 | 39,603종 검색 UI | 국명/학명 검색 · 자동완성 · 검색 후 상세 이동 | ⬜ | ⬜ |
| T12-5 | MASTER/PENDING 관리자 기능 | **사용자 UI 변화 없음** | ⬜ | — |
| T12-6 | 대표 이미지 규칙 | 대표 이미지 안정화 | ⬜ | ⬜ |
| T12-8 | `metadata` jsonb / migration | **UI 변화 없음** | ⬜ | — |
| T12-9 | 도감 완성 | 가격이력 · 분포/원산지 · 생육 설명 · 여러 장 이미지 | ⬜ | ⬜ |

#### T12-2 — UI Sprint 와 데이터 Sprint 를 나눈다

**39,603종 전체 적재는 Sprint PASS 조건이 아니다.**

| | 내용 | PASS 조건 |
|---|---|---|
| **T12-2A** (UI) | **산수국 1종** 적재 | Pages 에서 산수국 상세 10개 항목 표시 |
| **T12-2B** (데이터) | `plant_taxa` 전체 적재 | 39,603종 적재 · 행 수 검증 |

**T12-2A 완료 기준 — 산수국 상세에 10개가 실제 값으로 뜬다**

대표 이미지 · 국명 · 학명 · 과 · 속 · 생육형 · 광조건 · 개화월 ·
출처(국립수목원) · 동기화 날짜. **빈칸(`—`)이면 PASS 가 아니다.**
모든 항목이 실제 값으로 표시된 **스크린샷**이 PASS 다.

**구현 우선순위 (고정)**

```
① plant_taxa 테이블 생성
② 산수국 1종 적재          ← 전체 적재 전에
③ plantDetailSource 연결    ← 이미 되어 있다
④ GitHub Pages 확인         ← T12-2A PASS
⑤ 전체 적재 (import-plant-taxa)  ← T12-2B
```

**전체 적재 전에 UI 를 먼저 확인한다.** 39,603종을 넣고 나서 화면이 틀린 것을
발견하면 되돌릴 것이 많다.

기준 원본은 확정돼 있다. **새 원본을 기다리지 않는다.**
- 국립수목원 표준식물목록 API (KNA API)
- 국립수목원 표준식물목록 이미지 CSV (`plant_images_supabase.csv`)

`plant_taxa` 는 **T12-2 가 화면에 쓰는 10개 컬럼만** 갖는다:
`scientific_name · korean_name · family · genus · growth_form · sunlight ·
flowering_months · shpe_raw · grw_evrnt_raw · synced_at`.
`metadata` · `status` · `origin` · `merged_into` 는 넣지 않는다(T12-8 · T12-5).

### 구현 원칙 (T12 전체)

1. **OCR 코드 수정 금지.**
2. **`price_history` 수정 금지.**
3. `metadata` jsonb 는 T12-8.
4. Species Detail UI 우선.
5. **KNA 데이터는 UI 에 연결되는 순간 PASS.**
6. **"배선 완료" 와 "화면 확인 완료" 를 반드시 분리해서 기록한다.**

- 39,603종을 LocalStorage 에 저장하지 않는다. Cloud = SoT, LocalStorage 는
  최근 조회 캐시와 편집 상태만 갖는다.

## Sprint 게이트 — ✅ 통과 (7/7 PASS · 2026-07-23)

- **Migration(T5) 게이트는 해제됨** — 7/7 PASS 로 열렸고, T5 자체도
  2026-09-23 완료·검증됐다(이전 대상 0건).
- **한 번에 한 Sprint 만** — 이 원칙은 유지한다. 다음 Sprint 는 ROADMAP 의
  우선순위와 **별도 승인**에 따라 착수한다. 승인 없이 동시에 둘을 열지 않는다.
- 회귀 안전장치는 계속 유지: 모든 변경은 OCR 229/240 통과.
- **각 Sprint 는 "실제 웹사이트에서 확인 가능한 기능" 하나로 끝난다** —
  설계만 끝난 상태를 완료로 적지 않는다.

> Sprint 밖 아이디어는 여기 두지 않는다 → [IDEAS.md](./IDEAS.md).
> ROADMAP 에는 실제 구현 예정 항목만 기록한다.

## 명시적으로 확정되지 않은 것 `[확인 필요]`

- 7/7 PASS 이후 T5~T10 의 세부 순서 조정 여부 [확인 필요]
- 각 단계의 목표 완료 일정 [확인 필요]
- OCR 외 AI 기능(가격/수요 예측 등)의 로드맵 편입 시점 [확인 필요]
- `plant_taxa` 적재 원본 — 국립수목원의 어느 CSV/API 인지 [확인 필요]
- `plant_taxa.flowering_months` 의 실제 모양 (월 배열인지 문자열인지) [확인 필요]
  — 코드는 둘 다 받도록 해 두었다.
- `plant_images` 에 산수국 행이 있는지 [확인 필요] — T12-2 에서 판명된다.
- `plant_images` 대표 이미지 선정 기준 — **T12-6 에서 정한다.** `is_primary` 가
  없어 지금은 (종류, URL) 정렬 첫 장을 쓴다. 임시 안정화일 뿐 규칙이 아니다.
