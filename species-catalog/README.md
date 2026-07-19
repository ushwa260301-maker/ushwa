# 수종 도감 · Species Catalog

식물 수종별 **개화시기 · 단가표 · 수급처 · 구매 빈도**를 저장하고, 필터·검색·정렬로 조회하는 정적 웹앱입니다.

VS Code에서 바로 열고, 정적 서버 하나로 실행하며, Vercel · Netlify · GitHub Pages 어디에나 그대로 올릴 수 있는 **의존성 없는 순수 웹 프로젝트**입니다.

## 폴더 구조

```
species-catalog/
├── index.html
│
├── css/
│   ├── style.css        # 디자인 토큰, 리셋, 타이포그래피, 공용 컨트롤(버튼·칩·토스트)
│   ├── layout.css       # 마스트헤드, 페이지 그리드, 필터 레일, 툴바
│   ├── card.css         # 카드 컴포넌트 + 개화기·구매빈도 스트립·단가표·수급처
│   └── modal.css        # 모달 셸·폼 섹션·행 편집기·명세서 첨부
│
├── js/                  # 모두 ES6 모듈 (type="module")
│   ├── app.js           # 엔트리 포인트: 부트스트랩 + 이벤트 배선 + Species/Invoice 오케스트레이션
│   ├── state.js         # 중앙 상태 — 3 컬렉션 (species / invoices / invoiceItems)
│   ├── ui.js            # 렌더링·요소 캐시·토스트·테마 · enrichSpecies 파이프라인
│   ├── filter.js        # 필터·정렬 순수 함수
│   ├── components.js    # DOM 빌더 (createCard, chips, month-grid, row 편집기)
│   ├── modal.js         # 수종 추가/수정 모달 (파일 첨부 + 텍스트 파싱 포함)
│   ├── invoiceModal.js  # ★ 거래명세서 등록 4-step 위저드 (업로드→AI분석→검토→완료)
│   ├── historyModal.js  # ★ 구매 이력 모달 (수종별 통계 · 필터 · 정렬 · 이력 테이블)
│   ├── transactionDetailModal.js  # ★ 거래 상세 모달 (view/edit/delete)
│   ├── attachmentStore.js  # ★ IndexedDB CRUD (원본 이미지/PDF Blob)
│   ├── attachmentViewer.js # ★ 뷰어 모달 (zoom/rotate/download + AI/최종 비교 탭)
│   ├── debugFlag.js     # ★ Debug 모드 플래그 (URL / localStorage / Ctrl+Shift+D)
│   ├── debugPanel.js    # ★ Debug Panel — Vision 원본/정규화/사용자편집/저장/Diff 5-way 뷰
│   ├── matcher.js       # ★ Species Matching Engine (normalize + NFD-jamo Levenshtein)
│                        #   3-tier verdict: match / possible / new
│   ├── storage.js       # 3 컬렉션 LocalStorage 인터페이스 + v1→v2 자동 마이그레이션
│   ├── importExport.js  # JSON 내보내기·가져오기, 시드 로드 (신·구 스키마 모두 수용)
│   ├── vision.js        # ★ 무료 브라우저 OCR — Tesseract.js + pdf.js + parseInvoiceText 파이프라인
│   ├── stats.js         # ★ 구매 통계 계산 (avg/min/max/last/main/heatmap 등)
│   └── utils.js         # 순수 유틸리티·상수 (COLOR_MAP, MONTHS, colorFor, nextId …)
│
├── data/
│   └── species.json     # 시드 데이터 — species + invoices + invoiceItems 3 컬렉션
│
├── assets/
│   ├── icons/           # 향후 아이콘 자산용 (현재 비어 있음)
│   └── images/          # 향후 이미지 자산용
│
└── README.md
```

## 실행

`fetch()`로 `data/species.json`을 로드하고 ES 모듈을 사용하므로 **로컬 정적 서버**로 열어야 합니다 (`file://` 직접 열기 불가).

```bash
cd species-catalog
python3 -m http.server 8080
# → http://localhost:8080
```

또는 VS Code Live Server, `npx serve .` 등 어떤 정적 서버든 무방합니다. **API Key도 백엔드도 필요 없습니다** — OCR은 브라우저 안에서 Tesseract.js 로 실행됩니다.

## 배포

빌드 단계가 없어 파일 그대로 정적 호스팅 서비스에 올리면 됩니다.

- **GitHub Pages** — `.github/workflows/pages.yml`이 이미 커밋되어 있어 `species-catalog/`를 자동 배포합니다. 저장소 Settings → Pages → Source: **GitHub Actions** 지정 1회면 됩니다.
- **Vercel / Netlify / Cloudflare Pages** — Root Directory를 `species-catalog`로만 지정하면 됩니다.

**Live URL**: https://ushwa260301-maker.github.io/ushwa/

---

# 📐 데이터 모델 (v2 — 3-Collection Normalized)

## 스키마 다이어그램

```
┌─────────────────────────────────────┐          ┌──────────────────────────────────────┐
│  Species                            │          │  Invoice                             │
│─────────────────────────────────────│          │──────────────────────────────────────│
│  id            (sp-###)             │          │  id                  (inv-###)       │
│  name                               │          │  invoiceDate         (YYYY-MM-DD)    │
│  latin                              │          │  supplier                            │
│  category                           │          │  supplierAddress                     │
│  bloomMonths   [Number]             │          │  supplierPhone                       │
│  colors        [String]             │          │  invoiceNumber                       │
│  suppliers     [{name,region,…}]    │          │  createdAt           (ISO 8601)      │
│  notes                              │          └──────────────────────────────────────┘
└─────────────────────────────────────┘                          ▲
              ▲                                                  │
              │  speciesId (FK)                                  │  invoiceId (FK)
              │                                                  │
              │       ┌──────────────────────────────────────────┘
              │       │
              ▼       ▼
      ┌─────────────────────────────────────────┐
      │  InvoiceItem                            │
      │─────────────────────────────────────────│
      │  id             (item-###)              │
      │  invoiceId      →  Invoice.id           │
      │  speciesId      →  Species.id           │
      │  speciesName    (denormalized display)  │
      │  spec           (R6, H1.0, 3분 …)       │
      │  unit           (주, 포트 …)             │
      │  quantity       (Number)                │
      │  unitPrice      (Number, 원)            │
      │  amount         (Number, 원)            │
      └─────────────────────────────────────────┘
```

핵심: **Species에는 시세·이력 정보를 저장하지 않습니다.** 모든 통계는 InvoiceItem 기록에서 파생됩니다.

## Species → InvoiceItem → 카드로 흐르는 계산 파이프라인

```
                data/species.json (또는 localStorage v2)
                              │
                              ▼
                    state.data = {
                      species,       ◄── 메타데이터 only
                      invoices,      ◄── 명세서 헤더
                      invoiceItems   ◄── 각 라인
                    }
                              │
                              │  ui.render() 호출 시
                              ▼
                    enrichAllSpecies(species, invoices, invoiceItems)
                              │
                              │  stats.js:
                              │   • calculatePriceTable
                              │   • calculateMonthlyPurchaseHeatmap
                              │   • calculateAveragePrice
                              │   • calculateMinPrice / calculateMaxPrice
                              │   • calculateLastPurchase
                              │   • calculateMainSupplier
                              │   • calculatePurchaseFrequency
                              │   • calculateRecentPrice
                              ▼
                    [enriched species with .prices, .purchaseCounts, .stats.*]
                              │
                              │  filter.js · applyPipeline
                              ▼
                    createCard() ──► DOM
```

## `stats.js` API 요약

| 함수 | 반환 | 설명 |
|---|---|---|
| `calculateAveragePrice(items)` | `number \| null` | 단가 평균 |
| `calculateMinPrice(items)` | `number \| null` | 최저 단가 |
| `calculateMaxPrice(items)` | `number \| null` | 최고 단가 |
| `calculatePurchaseFrequency(items)` | `number` | 총 구매 수량 |
| `calculateLastPurchase(items, invoices)` | `YYYY-MM-DD \| null` | 최근 구매일 |
| `calculateMainSupplier(items, invoices)` | `string \| null` | 최다 거래 수급처 |
| `calculateMonthlyPurchaseHeatmap(items, invoices)` | `number[12]` | 월별 구매 히트맵 |
| `calculatePriceTable(items, invoices)` | `[{spec,unit,price}]` | 규격별 최근 단가 |
| `calculateRecentPrice(items, invoices)` | `number \| null` | 최근 구매 단가 |
| `enrichSpecies(sp, invoices, items)` | `Species+` | 카드 렌더용 합성 객체 |
| `enrichAllSpecies(species, invoices, items)` | `Species+[]` | 일괄 enrichment |

`items`는 항상 `invoiceItems.filter(i => i.speciesId === sp.id)` 결과입니다 (`itemsForSpecies()` 헬퍼 제공).

## LocalStorage 컬렉션 키

| 키 | 값 |
|---|---|
| `species-catalog:v2:species` | `Species[]` |
| `species-catalog:v2:invoices` | `Invoice[]` |
| `species-catalog:v2:invoiceItems` | `InvoiceItem[]` |
| `species-catalog:v2:meta` | `{categories, colors}` |
| `species-catalog:v1` (레거시) | 자동 감지·마이그레이션 후 삭제 |

v1 blob이 있을 경우 `storage.load()`가 자동으로 → v2 4 개 키로 마이그레이션하고 원본을 삭제합니다.

## 모달 저장 흐름 (Species / Invoice 분리)

```
사용자가 모달에서 저장 클릭
              │
              ▼
        collectForm()  ──►  { name, latin, category, bloomMonths, colors,
                              suppliers, notes,  ⚠ prices, purchaseCounts }
              │
              ▼   app.js · saveSpecies(payload, id)
              │
              ├─── 1. extractSpeciesMeta(payload)  ──► Species 필드만 취해서 upsert
              │
              ├─── 2. purgeInvoiceRecordsFor(speciesId)  ──► 이 수종의 items 전부 제거
              │                                           고아 invoice도 함께 제거
              │
              └─── 3. synthesizeInvoicesForSpecies(...)  ──► form의 prices + purchaseCounts에서
                                                            Invoice + InvoiceItem 재합성
```

이 방식으로:

- **UI/UX 100% 동일** — 사용자는 여전히 단가표와 월별 구매 횟수를 편집
- **데이터는 정규화** — 실제로는 Invoice + InvoiceItem이 저장됨
- **미래의 실제 명세서 임포트와 호환** — Tesseract OCR 로 파싱된 Invoice 레코드와 같은 스키마

---

# 🧾 사용자 흐름 — 거래명세서 등록 (4-Step Wizard)

메인 툴바의 **`+ 거래명세서 등록`** 버튼을 누르면 4단계 위저드가 열립니다.
파일 업로드 → AI가 자동으로 항목을 추출(Mock) → 사용자 검토·편집 → 저장 순서로,
한 장의 거래명세서에서 여러 수종을 한 번에 입력할 수 있습니다.

```
┌───────────┐      ┌───────────┐      ┌───────────┐      ┌───────────┐
│ 1. 업로드 │ ───► │ 2. 분석   │ ───► │ 3. 검토   │ ───► │ 4. 완료   │
│ 파일 선택 │      │ Mock AI   │      │ 편집·확인 │      │ 결과 요약 │
└───────────┘      └───────────┘      └───────────┘      └───────────┘
```

## Step 1 — 파일 업로드

- 드롭존을 클릭해 이미지(JPG/PNG) 또는 PDF를 선택합니다.
- 이미지의 경우 인라인 미리보기가 표시됩니다.
- `[다음: AI 분석 →]` 버튼으로 다음 단계로 이동.

## Step 2 — AI 분석 (Mock)

- OCR 은 브라우저 안에서 Tesseract.js 로 실행됩니다. 시연/데모 편의를 위해 `vision.js` 안의
  `analyzeInvoiceMock()`이 결정론적 샘플 데이터를 반환합니다.
- Mock 결과: 거래처 · 전화 · 주소 · 거래일 · 명세서 번호 · 품목 3건.
- `[다음: 검토 →]`로 검토 화면 진입.

> **왜 Mock인가**  
> 이 프로젝트에는 Supabase / Firebase / OpenAI / Claude 등 어떤 외부 API 도 연결되지
> 않습니다. AI 분석 자리는 흐름을 시연할 수 있도록 Mock 함수로 채워져 있으며,
> `vision.js`의 훅에 실제 provider 코드를 넣기만 하면 동작합니다.

## Step 3 — 검토 · 편집

**Invoice 헤더 필드**

| 필드 | 필수 | 기본값 |
|---|---|---|
| 거래일 | ✔ | Mock 결과 또는 오늘 |
| 명세서 번호 |  | Mock 값 (예: `M-202607-001`) |
| 거래처 | ✔ | Mock 상호 |
| 전화번호 |  | Mock 연락처 |
| 주소 |  | Mock 지역 |

**품목 그리드** (행 단위 편집)

| 컬럼 | 설명 |
|---|---|
| 품목명 | 수종명 — 실시간으로 배지가 갱신 |
| 규격 | R6, H1.0 등 |
| 단위 | 주, 포트 등 |
| 수량 | 자연수 |
| 단가 | 원 |
| 금액 | 자동 = 수량 × 단가 (직접 편집도 가능) |
| 수종 배지 | ✓ 기존 매치 / + 새 수종 / 이름 입력 |
| ✕ | 행 삭제 |

- `+ 품목 추가`로 빈 행을 삽입할 수 있습니다.
- 유효성: 거래일 + 거래처 + 품목명·수량·단가가 있는 행 ≥ 1건 필요.
- `[저장 →]`을 누르면 `saveInvoice()`가 실행됩니다.

## Step 4 — 완료

- 생성된 Invoice ID
- 추가된 품목 건수
- 기존 수종에 연결된 건수 (수종 목록)
- 새로 자동 생성된 수종 건수 (`sp-###` ID 포함)

`[닫기]`를 누르면 위저드가 종료되고, 카드 그리드에 신규 데이터가 즉시 반영됩니다.

## `saveInvoice()` 처리 로직 (app.js)

```
사용자가 [저장 →] 클릭
              │
              ▼
   1. 각 품목 행에 대해
       └─ 이름 매칭 (case-insensitive, trimmed)
           ├─ 일치 Species 있음 → speciesId 재사용 (reusedSpecies)
           └─ 없음              → Species 자동 생성 (newSpecies)
                                   · category = state.data.categories[0]
                                   · suppliers = [현재 거래처]
                                   · notes = "YYYY-MM-DD 거래명세서 등록으로 자동 생성"
              │
              ▼
   2. Invoice 헤더 레코드 생성 (nextId("inv"))
              │
              ▼
   3. InvoiceItem 레코드들 생성 (nextId("item"))
              │
              ▼
   4. storage.save() → refreshFilterUi() → rerender()
              │
              ▼
   5. { invoiceId, newSpecies, reusedSpecies } 반환 → Step 4 요약에 표시
```

핵심: **Mock 결과의 왕벚나무·산수유는 기존 시드와 매치되어 재사용되고,
신품종개나리는 새 수종으로 자동 생성**되어 두 경로가 모두 시연됩니다.

---

# 🆓 무료 브라우저 OCR (Tesseract.js)

거래명세서 등록 위저드 Step 2 는 **브라우저 안에서** OCR 을 실행합니다.
서버도 없고, API Key 도 없고, 요청당 비용도 없습니다. 이 정적 번들 그대로
GitHub Pages 에서 동작합니다.

## 아키텍처

```
┌───────────────────────────────────────────────────────────────┐
│  브라우저만 (백엔드 없음)                                     │
│                                                               │
│  invoiceModal.js                                              │
│   └─ vision.js  · analyzeInvoice(file)                        │
│        │                                                      │
│        ├── isPdf → pdf.js → 첫 페이지 canvas 렌더링           │
│        │                                                      │
│        ├── loadTesseract → jsdelivr CDN (한 번만)             │
│        │      · window.Tesseract 로 캐시                      │
│        │                                                      │
│        ├── worker = createWorker(["kor", "eng"])              │
│        │      · 언어팩 최초 1회 다운로드 (~15 MB)             │
│        │      · logger 로 진행률 → Step 2 progress bar        │
│        │                                                      │
│        ├── worker.recognize(source) → data.text               │
│        │                                                      │
│        ├── normalizeOcrText  (아래 표 참조)                   │
│        ├── parseInvoiceText  (기존 regex 파서 재사용)         │
│        ├── extractInvoiceDate / Number                        │
│        │                                                      │
│        └── AnalyzeResult (Mock/Vision과 동일한 shape)        │
│              → session.analysis → Wizard Step 3               │
│                                                               │
│  matcher.js 가 각 수종명 → 기존 Species (3-tier)             │
│  saveInvoice() 가 Invoice + InvoiceItem 을 저장               │
└───────────────────────────────────────────────────────────────┘
```

**API 비용 = 0원**. 프로바이더 서명 · 서버 유지비 · 요청 배치 관리 필요 없음.

## 실행 방법

```bash
cd species-catalog
python3 -m http.server 8080
# → http://localhost:8080  — 그게 전부입니다.
```

또는 GitHub Pages에 그대로 올리면 됩니다. **처음 OCR 을 실행할 때만**
브라우저가 CDN 에서 다음을 자동으로 다운로드 합니다 (이후 캐시):

| 리소스 | 크기 | CDN URL |
|---|---|---|
| Tesseract.js 코어 | ~1 MB | `cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js` |
| 한글 언어팩 | ~14 MB | Tesseract 가 자체적으로 다운로드 |
| 영문 언어팩 | ~4 MB | Tesseract 가 자체적으로 다운로드 |
| pdf.js (PDF 만) | ~1 MB | `cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.min.mjs` |

## 진행률 표시 (Step 2)

Tesseract 의 `logger` 콜백을 위저드 Step 2 의 `<progress>` 바로 연결해서
사용자가 실제 진행 정도를 볼 수 있게 했습니다.

| Stage | 라벨 | 퍼센트 |
|---|---|---|
| `pdf` | PDF 첫 페이지 렌더링 중 | 5% |
| `loading` | Tesseract.js 로드 중 | 10% |
| `loaded` | 언어팩(kor+eng) 준비 중 | 15% |
| `recognizing` | OCR 진행 중 · N% | 15 → 95% |
| `postprocess` | 텍스트 정규화 · 파싱 중 | 96% |
| `done` | 완료 | 100% |

## OCR 전처리 파이프라인 (`js/preprocess.js`)

Tesseract 에 원본 파일을 그대로 넣으면 그림자 · 저해상도 · JPEG 압축 ·
휴대폰 촬영 기울기 때문에 인식률이 크게 떨어집니다. 실제 명세서에서
관찰한 실패 패턴을 순수 Canvas 파이프라인으로 흡수합니다 — 새로운
의존성 없음 · 원본 파일은 IndexedDB 에 그대로 유지되고 OCR 입력에만
전처리된 canvas 를 사용합니다.

| 단계 | 목적 | 구현 |
|---|---|---|
| 2× upscale | 작은 글씨 회복 | `drawImage` (`imageSmoothingQuality:"high"`) |
| Grayscale | 색상은 OCR 에 무의미 · 후처리 단순화 | Rec.601 luma |
| Contrast stretch | 워시아웃된 사진 살리기 | 히스토그램 0.5% percentile clip |
| Unsharp mask | 리샘플로 흐려진 획 회복 | 3×3 laplacian (`amount=0.6`) |

의도적으로 하지 **않는** 것:
- **Threshold (binarize)** — 사진에서 anti-aliasing 정보를 잃어 OCR 이 오히려 나빠짐
- **Deskew (기울기 보정)** — 5° 이하는 Tesseract 내부에서 처리 · 그 이상은
  가벼운 파이프라인에 넣기 어려움 (필요 시 별도 PR)

메모리 안전: 최종 캔버스는 `PREPROCESSED_MAX_DIM = 3200` 픽셀로 제한됩니다.

**A/B 토글**: URL 쿼리 `?preprocess=off` 로 전처리를 끄고 원본으로 인식해
같은 이미지에서의 정확도 차이를 비교할 수 있습니다.

## Tesseract 옵션 · 신뢰도 기반 재시도

`analyzeInvoice()` 는 매 요청에 다음을 적용합니다:

| 옵션 | 값 | 근거 |
|---|---|---|
| `oem` | `1` (LSTM_ONLY) | v5 default · 정확도 최고 |
| `tessedit_pageseg_mode` | `6` (SINGLE_BLOCK) | 조경업체 명세서 대부분 단일 블록 표 |
| `preserve_interword_spaces` | `"1"` | 표 컬럼(수량/단가/금액) 사이 다중 공백 유지 |
| whitelist | **적용 안 함** | 한글 + 숫자 + 라틴 + 특수 다 필요 |

**Confidence 기반 재시도**:

1차 pass 의 평균 word confidence 가 **65% 미만**이면 `psm=4` (SINGLE_COLUMN)
로 2차 pass 를 실행해 더 높은 confidence 를 얻은 쪽을 채택합니다. 두 pass
모두 `_debug.raw.passes` 배열에 기록되어 Debug Panel 에서 비교 가능:

```jsonc
"passes": [
  { "psm": "6", "confidence": 58, "textLength": 812, "lineCount": 42 },
  { "psm": "4", "confidence": 71, "textLength": 851, "lineCount": 45 }   // ← winner
],
"winningPsm": "4"
```

**Line-level low-confidence flag**: `_debug.raw.lowConfidenceLines` 에 신뢰도
60% 미만 라인이 원문 · 신뢰도 % 와 함께 담기며, Debug Panel 이 목록을
표시합니다 — 잘못 읽었을 가능성이 높은 줄을 눈으로 즉시 판별할 수 있습니다.

## Debug Panel — 이미지 비교

`?debug=1` 로 진입한 Debug Panel 의 **① Vision Raw** 탭 상단에 세 가지 타일이
자동으로 나옵니다:

- **원본 · 전처리** — 두 이미지 썸네일 (JPEG 320 px)
- **OCR pass 요약** — 각 psm 의 confidence · 문자수 · winner 표시
- **저(<60%) confidence 라인** — 원문과 confidence 목록

HTML 은 변경하지 않았고 (`renderRawPanel()` 이 안전하게 inject),
데이터가 없으면 스트립이 자동 제거됩니다.

## OCR 후처리 파이프라인

Tesseract 의 원본 텍스트는 자모 사이 공백, 규격 사이 공백, 콤마가 섞여 있어
그대로 파서에 넘기면 인식률이 크게 떨어집니다. `normalizeOcrText()` 가
다음을 정리합니다:

| 규칙 | 예시 | 결과 |
|---|---|---|
| 파편화된 한글 결합 | `왕 벚 나 무` | `왕벚나무` |
| 규격 공백 제거 | `R 8` · `H 1.2` | `R8` · `H1.2` |
| 가격 콤마 제거 | `35,000` | `35000` |
| 빈 줄 정리 | 여러 개의 `\n` | 하나 |

정규화된 텍스트를 기존 `parseInvoiceText()` 에 넣으면 상호/주소/연락처/품목
행이 추출되고, `extractInvoiceDate()` · `extractInvoiceNumber()` 로 날짜·
명세서 번호를 뽑아 최종 AnalyzeResult 를 구성합니다.

**수종명 자동 보정**은 `matcher.js` (NFD-자모 Levenshtein) 가 담당합니다.
예: `왕벗나무 → 왕벚나무 유사도 90% → match tier → 자동 연결`.

## `analyzeInvoice()` 계약 (변경 없음)

기존 Vision 통합 때 정의한 반환 shape 를 그대로 유지합니다. downstream
consumer (Debug Panel · matcher · invoiceModal · attachmentViewer) 는
Tesseract 로의 교체를 인지하지 못한 채 그대로 동작합니다.

```jsonc
{
  "ok": true,
  "mock": false,
  "invoiceDate":   "2026-07-18",
  "invoiceNumber": "TR-2026-…",
  "supplier":  { "name": "…", "region": "…", "contact": "…" },
  "rows":      [{ "name": "…", "spec": "…", "unit": "…",
                  "quantity": 1, "unitPrice": 0, "amount": 0 }],
  "meta":      { "filename": "…", "size": 0, "type": "…",
                 "model": "tesseract-5" },
  "_debug":    { "provider": "tesseract",
                 "model":    "tesseract-5 (kor+eng)",
                 "requestedAt": "…", "latencyMs": 0,
                 "confidence": 0.87,
                 "httpStatus": null,  // 로컬 OCR — HTTP 없음
                 "raw": { "text": "…", "normalized": "…",
                          "tesseractConfidence": 87,
                          "lineCount": 0, "wordCount": 0 } }
}
```

## 실패 처리 · 재시도

에러 경로에서도 `err._debug` 를 채워서 Debug Panel 이 계속 진단 자료를
보여줍니다.

- **CDN 로드 실패** — `Tesseract.js CDN 로드 실패 (…) — 네트워크를 확인하세요.`
- **지원하지 않는 파일** — `지원하지 않는 파일 형식입니다. JPG · PNG · PDF 만 지원합니다.`
- **pdf.js 로드 실패** — `pdf.js CDN 로드 실패 — <메시지>`

Wizard Step 2 는 실패 시 오류 카드 + `[↻ 다시 시도]` 를 그대로 노출합니다.

## 테스트 · 시연 오버라이드

Playwright E2E 나 로컬 데모를 위해 다음 세 가지 모드가 있습니다.

| 지정 방식 | 값 | 효과 |
|---|---|---|
| `window.__OCR_MODE__` | `"mock"` | `analyzeInvoiceMock()` 로 결정론적 응답 |
| `window.__OCR_MODE__` | `"fail"` | 강제 오류 (Debug 실패 경로 확인용) |
| `window.__OCR_MODE__` | `"real"` (기본) | 실제 Tesseract 파이프라인 |
| URL 쿼리 `?ocr=mock` |  | 위와 동일 (window 값이 우선) |
| URL 쿼리 `?ocr=fail` |  | 위와 동일 |
| URL 쿼리 `?ocr=real` |  | 위와 동일 |

기본은 `real` 이므로 일반 사용자는 어떤 설정도 필요 없이 실제 Tesseract 가
동작합니다.

## OCR 품질 · 실제 명세서 반복 테스트

Tesseract 원본 텍스트는 농원마다 다른 서식·규격 마커·잡음(로고/스탬프/여러
페이지 헤더) 때문에 완벽할 수 없습니다. `normalizeOcrText()` 와
`parseInvoiceText()` 는 **실제 거래명세서에서 관찰한 실패 케이스를 하나씩
fixture 로 코퍼스에 담아** 규칙을 넣는 방식으로 개선됩니다.
새로운 규칙은 반드시 새로운 fixture 와 함께 추가합니다.

### 코퍼스 구조

```
species-catalog/tests/
├── ocr-accuracy.mjs           ← Node CLI 러너 (pure export 만 import)
└── ocr-corpus/
    ├── README.md              ← fixture 포맷 설명
    ├── 01-cheonripo-standard.json
    ├── 02-fragmented-hangul.json
    ├── … (총 20개, 각기 다른 서식·오탐)
    └── 20-heavy-noise.json
```

각 fixture 는 원본 OCR 텍스트와 기대값을 한 파일에 담습니다:

```jsonc
{
  "id": "05-corporate-marker",
  "description": "㈜ 법인 마커 · 주식회사 표기 · 사업자등록번호 노이즈 라인",
  "ocr": "TAX INVOICE / 거래명세서\n\n공급자: ㈜ 담양원예\n사업자등록번호 …",
  "expect": {
    "invoiceDate": "2025-07-18",
    "supplier": { "name": "담양원예", "region": "전남 담양군", "contact": "061-381-4567" },
    "rows": [{ "name": "라벤더", "spec": "3분", "unitPrice": 3500 }]
  }
}
```

### 러너 실행

```bash
node species-catalog/tests/ocr-accuracy.mjs
```

`normalizeOcrText` → `parseInvoiceText` → `extractInvoiceDate` ·
`extractInvoiceNumber` 순으로 pure 함수를 호출하고, 필드별로 다음 기준으로
채점합니다:

| 필드 | 비교 방식 |
|---|---|
| `supplier.name` | exact (앞뒤 공백만 trim) |
| `supplier.region` | substring (기대값이 짧으면 전체 주소에 포함되면 pass) |
| `supplier.contact` | 숫자만 비교 (하이픈·공백 차이 무시) |
| `invoiceDate` | `YYYY-MM-DD` exact |
| `invoiceNumber` | exact |
| `rows[i].name` / `spec` | exact |
| `rows[i].unitPrice` | numeric equality |

fixture 별 pass/fail, 필드별 got/want diff, 전체 정확도(%)를 출력하며
**정확도 95% 미만이면 exit code 1** 로 CI 를 실패시킵니다.

현재 코퍼스 성적:

```
Overall: 224 / 224 passed  ·  100.0%
Target: 95% ≥  ✓ PASS
```

### 반복 개선 워크플로우 (Debug Panel → fixture 자동 저장)

새 실제 명세서에서 잘못 인식되는 필드가 발견되면:

1. **명세서 업로드** → `?debug=1` 진입 → Wizard Step 3 진입
2. **Debug Panel 다운로드** — 두 개 버튼 중 아무거나:
   - **`↓ OCR 결과 다운로드`** — 전체 스냅샷 (원문 OCR + userEdit + toSave + meta)
   - **`💾 Vision 응답 저장`** — `_debug.raw` (원문 OCR + normalized + passes)
3. **사용자 수정** — 잘못된 필드를 Step 3 폼에서 올바른 값으로 고칩니다.
   이 값이 스냅샷의 `userEdit` 에 담깁니다.
4. **fixture 자동 저장**:
   ```bash
   node species-catalog/tests/import-fixture.mjs \
     ~/Downloads/ocr-debug-2026-07-19T04-01-00.json \
     --slug=deokyusan-farm --desc="덕유산농원 · B/W 규격 혼합"
   ```
   자동으로 다음 NN 을 붙여 `tests/ocr-corpus/NN-deokyusan-farm.json`
   을 생성합니다. `raw.text` → `ocr` 필드, `userEdit.header/items` → `expect`.
5. **러너 실행** — `node species-catalog/tests/ocr-accuracy.mjs`.
   새 fixture 가 실패하면 어느 필드가 어긋났는지 diff 로 출력됩니다.
6. **규칙 추가** — `normalizeOcrText()` (텍스트 클린업) 또는
   `parseInvoiceText()` / `detectSupplier()` / `extractInvoice*()`
   (파서 규칙) 에 최소한의 규칙을 추가합니다. **다른 fixture 가 깨지지 않는
   방향으로 좁게** 짜야 합니다 (예: `왕 벚 나 무 → 왕벚나무` 는 붙지만
   `충남 태안군` 은 그대로).
7. **재실행 · 회귀 확인** — 20+ 개 전체가 다시 pass 하는지 확인.
8. **커밋** — fixture + 규칙 개선을 한 커밋으로.

50 장 규모로 확장할 때도 동일 워크플로우 — Debug Panel 스냅샷 하나당
`import-fixture.mjs` 한 번 실행이면 회귀 코퍼스에 추가됩니다.

### 규칙이 규칙이 된 이유 (감사 로그)

`vision.js` 의 각 규칙은 실제 fixture 에서 발생한 실패로부터 유래했습니다:

| 규칙 | 유래 fixture | 실패 형태 |
|---|---|---|
| 파편화 한글 결합 (≥3개 연속) | `02-fragmented-hangul` | `왕 벚 나 무` → `왕벚나무` |
| 규격 문자↔숫자 스왑 (`R O`→`R0`, `R l`→`R1`) | `06-spec-letter-swap` | Tesseract 특유의 O/0, l/1 오탐 |
| 장식 문자 제거 (`★☆✦…`) | `20-heavy-noise` | 로고 라인 잡음이 상호에 딸려 들어옴 |
| 전화 정규식 토큰 경계 (lookbehind/ahead) | `14-quantity-in-price-column` | `500 3200 1600000` 이 phone 으로 오탐 |
| 사업자등록번호 lookbehind | `18-mokryeon-target` | `123-45-67890` 이 명세서 번호로 잡힘 |
| `대표번호` lookbehind | `20-heavy-noise` | 유선 번호가 명세서 번호 후보로 들어감 |
| `번호` 라벨 다중 매치 순회 | `20-heavy-noise` | 첫 매치가 rejected 되면 다음 후보로 |
| `stripCorporateMarker` (`㈜`, `주식회사`) | `05-corporate-marker` | `㈜ 담양원예` → `담양원예` |
| 첫 줄 fallback (접미사 없는 상호) | `14-quantity-in-price-column` | `허브아일랜드` 같은 브랜드명 |
| 라벨 접두어 스트립 (`공급자<value>`) | `02-fragmented-hangul` | 파편화 후 `공급자남양수목원` 처럼 붙음 |
| 날짜 라인 배제 (`YYYY-MM-DD`) | `20-heavy-noise` | 날짜 라인이 품목 행으로 오탐 |
| 노이즈 단어 확장 (`대량`, `납품`, `견적서` …) | `14`, `20` | 첫 줄 fallback 시 잡음 제거 |

새 규칙을 넣을 때는 이 표에 한 줄을 추가하는 것을 원칙으로 합니다.

---

# 🎯 Species Matching Engine (`js/matcher.js`)

OCR/AI 가 반환한 `speciesName` 을 기존 Species 와 자동 연결합니다.
오타·규격 접미사·괄호·공백은 정규화로 흡수하고, 남은 문자열의 유사도가
임계값을 넘으면 자동 연결하거나 후보 목록을 사용자에게 제안합니다.

## 3-Tier 판정

```
score = calculateSimilarity(normalized(input), normalized(species.name))

score ≥ 0.85          →  match     ✓ 자동 연결
0.60 ≤ score < 0.85   →  possible  ? 사용자 선택 (후보 목록에서)
score < 0.60          →  new       + 새 Species 자동 생성
```

## 정규화 (`normalizeSpeciesName`)

| 규칙 | 예시 | 결과 |
|---|---|---|
| 괄호·대괄호 내용 제거 | `왕벚나무 (신품종)` | `왕벚나무` |
| 규격 마커 제거 (R/H/B/W/D + 숫자) | `산수유R4`, `왕벚나무 H1.2` | `산수유`, `왕벚나무` |
| 수량 마커 제거 (숫자 + 분/포트/주/…) | `산수유 3분` | `산수유` |
| 변종 마커 제거 | `신품종개나리` | `개나리` |
| 공백 제거 | `왕 벚 나 무` | `왕벚나무` |
| Latin 소문자화 | `Rosa Alba` | `rosaalba` (규격 마커에 걸리지 않는 한) |

## 유사도 (`calculateSimilarity`)

**Levenshtein 편집 거리** 를 사용합니다. 단, 두 문자열을 먼저
**Unicode NFD 로 자모 분해** 한 뒤 편집 거리를 계산해서 한글 오타에
민감합니다.

```
왕벚나무   ─NFD→  왕  벚  나  무         (10 jamo)
왕벗나무   ─NFD→  왕  벗  나  무         (10 jamo)
                         ▲ 종성 1자 차이
Levenshtein 거리 = 1
similarity = 1 - 1/10 = 0.90  →  match ✓
```

문자 단위 편집 거리로는 `왕벗나무` vs `왕벚나무` 가 1/4 = 0.75 (possible)
로만 판정되지만, NFD-자모 단위에서는 종성 하나만 다르다는 사실이 반영되어
자동 연결됩니다.

## 4개 함수 API

```js
normalizeSpeciesName(raw)                    → string
calculateSimilarity(a, b)                    → number ∈ [0, 1]
findBestMatch(rawName, speciesList, {topK})  → [{species, score}] (내림차순)
matchSpecies(rawName, speciesList, {matchThreshold, possibleThreshold, topK})
   → {
       status:     "match" | "possible" | "new",
       species:    Species | null,     // match 일 때만 top species
       candidates: [{species, score}], // possibleThreshold 이상, 최대 topK 개
       score:      number              // top score (없으면 0)
     }
```

기본 임계값은 상수로 노출됩니다: `matchThreshold=0.85`, `possibleThreshold=0.60`,
`topK=3`. 옵션 인자로 재정의 가능합니다.

## Wizard Step 3 배지 상태

| 판정 | 배지 데이터 속성 | UI 동작 | `item.speciesId` |
|---|---|---|---|
| **match** | `data-status="match"` | `✓ 왕벚나무` 자동 표시 · 클릭 불가 | top species id 자동 설정 |
| **possible** | `data-status="possible"` | `? 왕벚나무 외 · 선택` — **클릭 시 후보 팝오버** | 사용자가 후보 클릭 → 해당 id · `+ 새 수종으로 등록` → null |
| **new** | `data-status="new"` | `+ 새 수종` — 저장 시 자동 등록 | null |
| **unknown** | `data-status="unknown"` | 이름 입력 대기 | null |

**후보 팝오버**는 각 후보에 대해 `이름 · id · 유사도%` 3열을 보여주고,
맨 아래에는 `+ 새 수종으로 등록` 옵션이 있습니다. 바깥 클릭 · Escape 로 닫힙니다.

## `saveInvoice()` 해결 우선순위

거래명세서 저장 시 각 품목 행은 다음 순서로 Species 에 연결됩니다:

```
1) it.speciesId 가 있으면        →  해당 Species 재사용 (재사용 목록에 추가)
2) matchSpecies(name, species)   →  status="match" 면 top species 재사용
3) 그 외 (possible unresolved · new · 조회 실패) → 새 Species 생성
```

Wizard 를 통과하지 않는 자동 저장 경로(향후 확장)에서도 동일한 fallback
사슬로 안전하게 동작합니다.

## 시연 케이스

| Vision 반환값 | 정규화 | 판정 | 결과 |
|---|---|---|---|
| `왕벚나무` | `왕벚나무` | `match` (1.00) | seed 왕벚나무 자동 연결 |
| `왕벗나무` | `왕벗나무` | `match` (0.90) | seed 왕벚나무 자동 연결 (오타 흡수) |
| `산수유R4` | `산수유` | `match` (1.00) | seed 산수유 자동 연결 (규격 제거) |
| `왕벚나` | `왕벚나` | `possible` (0.80) | 후보 [왕벚나무] 팝오버, 사용자 선택 |
| `신품종개나리` | `개나리` | `new` (0.20) | seed 에 없음 → 새 Species |

---

# 🛠 Debug Mode — OCR 검증 화면

실제 거래명세서 수십~수백 장으로 OCR 정확도를 지속 개선하기 위한
**개발자 전용** 검증 환경. 사용자 화면은 그대로 두고, wizard Step 3 안쪽에
Debug Panel 하나만 추가되도록 **Feature Flag** 방식으로 격리했습니다.

## 켜기 / 끄기

3가지 방법. 모두 `localStorage` 에 저장되어 새 세션에서도 유지됩니다.

| 방법 | 예시 |
|---|---|
| URL 쿼리 | `?debug=1` (또는 `?debug=0` 로 끄기) |
| JS 콘솔 | `window.enableDebug(true)` · `window.toggleDebug()` |
| 키보드 | **Ctrl+Shift+D** — 토글 |

플래그가 켜지면 `<html>` 에 `debug-mode` 클래스가 붙고, 모든
`.debug-only` 요소가 노출됩니다. 플래그가 꺼지면 관련 DOM 은 그대로 있지만
CSS 만으로 완전히 숨겨져 일반 사용자에게는 절대 보이지 않습니다.

## Debug Panel 레이아웃 (Step 3)

```
┌──────────────────────────────────────────────────────────────┐
│ 🛠 Debug Panel  (개발 모드)                                  │
│   [📋 OCR JSON 복사] [📋 저장 JSON 복사] [↓ 다운로드]        │
│   [↻ OCR 재실행]   [💾 Vision 응답 저장]                     │
├──────────────────────────────────────────────────────────────┤
│  Provider   Model     응답시간   OCR 성공   Confidence  요청시각│
│  openai     gpt-4o    834 ms     성공      —           2026-…│
│  오류 메시지: —                                              │
├──────────────────────────────────────────────────────────────┤
│  [① Vision Raw] [② Normalized] [③ User Edit] [④ To Be Saved]│
│  [⑤ Diff]                                                    │
├──────────────────────────────────────────────────────────────┤
│  <pre>{ ... }</pre>   ← 활성 탭의 JSON                      │
└──────────────────────────────────────────────────────────────┘
```

## 5개 JSON 뷰

| # | 이름 | 내용 |
|---|---|---|
| ① | Vision Raw | `session.analysis._debug.raw` — 프로바이더의 **원본 응답** 그대로 |
| ② | Normalized | `session.analysis` (내부 표준 shape) — `_debug` 제외 |
| ③ | User Edit | 현재 wizard 헤더 + 품목 (사용자 편집 반영 실시간) |
| ④ | To Be Saved | `projectInvoiceSave(header, items)` 결과 — 실제 Invoice / InvoiceItem / newSpecies / reusedSpecies |
| ⑤ | Diff | OCR vs User-Edit 필드별 비교 · **수정된 필드 색상 강조** |

Diff 는 헤더 5필드 + 각 품목별 6필드 (수종명·규격·단위·수량·단가·금액) 를
비교합니다. 상태별 색상:
- `수정 없음` — 기본 색
- **`→ 사용자 수정`** — 노란 배경 (`diff-modified`)
- **`→ 추가됨`**     — 파란 배경 (`diff-added`)
- **`→ 삭제됨`**     — 빨간 배경 + 취소선 (`diff-removed`)

## Vision 메타 스트립

`analysis._debug` 에서 표시. 프로바이더가 필드를 제공하지 않으면 `—`.

| 필드 | 소스 |
|---|---|
| Provider | `openai` \| `anthropic` \| `gemini` \| `mock` |
| 모델 | `_debug.model` (e.g. `gpt-4o`) |
| 응답시간 | `_debug.latencyMs` |
| OCR 성공 | `analysis.ok !== false` |
| Confidence | `_debug.confidence` (0..1, 있는 경우) |
| 요청 시각 | `_debug.requestedAt` (ISO-8601) |
| 오류 메시지 | `_debug.errorMessage` |

## Vision 인터페이스 계약

`js/vision.js` 는 **DebugEnvelope** 라는 프로바이더 중립 shape 을 정의합니다.
Tesseract · OpenAI · Claude · Gemini — 어떤 프로바이더든 이 하나만 채우면 Debug Panel 이 동일하게 동작합니다.

```jsonc
{
  "provider":    "openai",             // or "anthropic" | "gemini" | "mock"
  "model":       "gpt-4o",
  "requestedAt": "2026-07-18T04:52:00Z",
  "latencyMs":   834,
  "confidence":  null,                 // 0..1 if available
  "errorMessage": null,
  "raw":         { /* untouched provider response */ }
}
```

`vision.js` 는 Tesseract 호출 전후로 `Date.now()` 를 찍어 `latencyMs`
를 계산하고, 응답 body 자체를 `_debug.raw` 에 담아 클라이언트로 넘깁니다.
새 프로바이더 프록시를 추가할 때는 이 shape 만 지키면 UI 코드를 건드릴
필요가 없습니다.

## 유틸리티 버튼

| 버튼 | 동작 |
|---|---|
| 📋 OCR JSON 복사 | Normalized(②) 를 `navigator.clipboard.writeText` |
| 📋 저장 JSON 복사 | To Be Saved(④) 를 클립보드로 |
| ↓ OCR 결과 다운로드 | `{exportedAt, ocr, userEdit, toSave, meta}` 스냅샷을 `.json` 다운로드 |
| ↻ OCR 재실행 | `session.file` 로 `analyzeInvoice()` 재호출 (Step 2 진행 화면 재표시) |
| 💾 Vision 응답 저장 | `_debug.raw` 만 별도 `.json` 다운로드 |

클립보드 API 가 막혀있는 브라우저(구형/헤드리스)에서는 `document.execCommand("copy")`
로 자동 fallback.

## 저장 로직 무변경

Debug Panel 은 **읽기 전용 관찰자**입니다. [저장] 버튼은 기존 `saveInvoice()`
로 그대로 이어져 `Invoice · InvoiceItem · Species` 3 컬렉션으로 저장됩니다.
④ 탭은 순수 함수 `projectInvoiceSave()` 로 미리보기만 계산하며 **state 를
전혀 건드리지 않습니다**.

## 자동 인식 성공률

Debug Panel 최상단에 큰 숫자로 표시됩니다.

```
96%     22 / 23 필드 자동 인식 · 1 수정
─────
```

- **총 필드 수**  = 헤더 5 (거래일·거래번호·거래처·연락처·주소) + 품목 × 6 (수종명·규격·단위·수량·단가·금액)
- **자동 인식**   = OCR 이 값을 반환했고 사용자가 그대로 유지한 필드
- **수정**       = OCR 이 값을 반환했지만 사용자가 고친 필드
- **미인식**     = OCR 이 빈 값을 반환한 필드 (아래 색상 강조)

값 색상: `≥90%` = 초록, `≥60%` = 노랑, `<60%` = 빨강.

## 필드 색상 3-tier (Diff 탭)

| 상태 | 색상 | 조건 |
|---|---|---|
| **초록** (recognized) | 🟢 | OCR 이 값을 반환했고 사용자가 그대로 저장 |
| **주황** (modified) | 🟠 | OCR 값이 있었지만 사용자가 고침 |
| **빨강** (missing) | 🔴 | OCR 이 값을 반환하지 못함 |

각 행은 `data-dbg-field-state` 속성으로 상태를 실어서 E2E 로도 검증 가능합니다.

## HTTP status + 실패 처리

OCR 실패 시에도 Debug Panel 은 계속 동작하며 다음 정보를 노출합니다:

| 필드 | 소스 |
|---|---|
| **HTTP**  | `err._debug.httpStatus` (예: `502`) — 2xx 초록, 4xx/5xx 빨강 |
| **응답시간** | 클라이언트가 측정한 실제 round-trip (`ms`) |
| **요청 시각** | ISO-8601 (`_debug.requestedAt`) |
| **오류 메시지** | `_debug.errorMessage` — 프로바이더 원문 유지 |
| **Vision Raw** | 실패 응답 body 도 그대로 담아줌 (진단 자료) |

네트워크 오류 · 타임아웃 · 프록시 미실행에서도 vision.js 가 최소 `_debug`
envelope 을 채워 놓기 때문에 Debug Panel 이 "빈 화면" 이 되지 않습니다.

## 사용 시나리오

```
1. 페이지를 ?debug=1 로 열기
2. 툴바의 [+ 거래명세서 등록] → 실제 거래명세서 JPG / PNG / PDF 업로드
3. Step 2 에서 Tesseract OCR 분석 대기 (진행률이 progress bar 로 표시됨)
4. Step 3 진입 시 Debug Panel 자동 노출
   - ① Vision Raw 를 확인해 프로바이더가 실제로 무엇을 반환했는지 검증
   - ② Normalized ↔ 헤더/품목 그리드가 일치하는지 확인
   - 상단 성공률에서 몇 %가 인식됐는지 즉시 확인
   - ⑤ Diff 탭에서 필드별 색상 (초록/주황/빨강) 으로 어느 필드가 문제인지 확인
5. OCR 오탐 (예: 왕벗나무) 을 필드에서 직접 수정 (예: 왕벚나무)
   - ③ User Edit / ④ To Be Saved / ⑤ Diff 가 실시간 갱신
   - matcher.js 가 왕벗나무를 왕벚나무 species 로 해결하는 것도 ④ 탭에서 확인
6. [↓ OCR 결과 다운로드] 로 스냅샷 파일 저장 (수십/수백 장 축적용)
7. [저장 →] 로 실제 저장 → 기존 대로 stats.js 재계산 · Species 카드 갱신
8. Step 4 에서 [📥 저장 Invoice 다운로드] 로 LocalStorage 에 저장된 실제
   레코드를 JSON 으로 내려받아 ④ To Be Saved 와 byte-equivalent 인지 확인
9. 카드 그리드 → 구매 이력 → 거래 상세 로 이어지는 실제 사용자 흐름이
   방금 저장한 거래명세서를 정확히 반영하는지 검증
```

## 실제 거래명세서 테스트 체크리스트

Debug Panel 하단에 자동 갱신되는 체크리스트가 표시됩니다. 각 항목은
현재 세션 상태에서 자동으로 ✓ / ☐ 로 표시되며, 저장 후 항목은 실제
LocalStorage 조회 결과를 기반으로 판정됩니다.

- ☐ **JPG 업로드** — 첨부 파일 MIME 이 `image/jpeg` 인 경우
- ☐ **PNG 업로드** — MIME 이 `image/png`
- ☐ **PDF 업로드** — MIME 이 `application/pdf`
- ☐ **OCR 성공** — `analysis.ok !== false`
- ☐ **OCR 실패 처리 준비** — 실패 시 `_debug.errorMessage` 노출 여부
- ☐ **OCR 결과 수정** — Diff 에서 `field-modified` 행이 하나라도 있으면
- ☐ **LocalStorage 저장** — 저장 후 `state.data.invoices` 에 새 id 존재
- ☐ **카드 반영** — 저장 후 연결된 Species 카드가 존재
- ☐ **구매이력 반영** — 저장 후 이 Invoice 의 InvoiceItem 이 존재
- ☐ **통계 자동 계산** — 카드 + 이력 이 함께 있으면 (`enrichAllSpecies` 파이프라인이 실행됨)

이 체크리스트는 실제 거래명세서를 수십~수백 장 반복 테스트할 때
"이번 파일은 어디서 실패했나?" 를 즉시 알 수 있게 해 줍니다.

## 저장 데이터 다운로드 2종

| 버튼 | 대상 |
|---|---|
| **💾 Vision 응답 저장** | `_debug.raw` — 프로바이더 원본 응답 |
| **📥 저장 Invoice 다운로드** | LocalStorage 에 실제 저장된 `{invoice, items, linkedSpecies}` 스냅샷 (저장 후에만 활성) |

---

# 📒 사용자 흐름 — 구매 이력 (Transaction History)

수종 카드 어디를 클릭하면 **해당 수종의 모든 구매 이력**을 한눈에 볼 수 있는
모달이 열립니다. 카드 디자인 자체는 변경하지 않았고(우측 상단 hover ✎ / ✕
버튼도 그대로), **카드 본문 클릭 = 이력 모달 열기**로 배선됐습니다.

```
┌────────────────────────────────────────────────────────────────┐
│  구매 이력 · 왕벚나무    SP-001                            ✕   │
├────────────────────────────────────────────────────────────────┤
│  ┌─────────┬─────────┬─────────┬─────────┬─────────┬────────┐ │
│  │ 최근    │ 평균    │ 최저    │ 최고    │ 총구매  │ 총수량 │ │
│  │ 구매일  │ 단가    │ 단가    │ 단가    │ 횟수    │        │ │
│  │ 2025-  │ 40,833  │ 30,000  │ 50,000  │ 4건     │ 15주   │ │
│  │ 07-04  │ 원      │ 원      │ 원      │         │        │ │
│  └─────────┴─────────┴─────────┴─────────┴─────────┴────────┘ │
│                                                                │
│  [거래처 ▾] [규격 ▾] [시작] [종료] [정렬 ▾] [필터 초기화]     │
│                                                                │
│  ┌──────────┬──────────┬──────┬────┬────────┬─────────┐       │
│  │ 거래일   │ 거래처   │ 규격 │ 수량│ 단가   │ 금액    │       │
│  ├──────────┼──────────┼──────┼────┼────────┼─────────┤       │
│  │ 07-04    │ 천리포수 │ R6   │ 2  │ 45,000 │ 90,000  │       │
│  │ 05-12    │ 남양수목 │ R5   │ 3  │ 38,000 │ 114,000 │       │
│  │  …       │  …       │  …   │ …  │  …     │  …      │       │
│  ├──────────┴──────────┴──────┴────┴────────┴─────────┤       │
│  │ 합계 4건            총 15주  ·  650,000원          │       │
│  └────────────────────────────────────────────────────┘       │
└────────────────────────────────────────────────────────────────┘
```

## 상단 통계 (모두 InvoiceItem으로부터 자동 계산)

| 통계 | 계산식 (stats.js) |
|---|---|
| 최근 구매일 | `calculateLastPurchase(items, invoices)` |
| 평균 단가 | `calculateAveragePrice(items)` |
| 최저 단가 | `calculateMinPrice(items)` |
| 최고 단가 | `calculateMaxPrice(items)` |
| 총 구매 횟수 | `new Set(items.invoiceId).size` — 이 수종을 포함한 거래명세서 수 |
| 총 구매 수량 | `calculatePurchaseFrequency(items)` — 수량 합 |
| 총 구매 금액 | Σ `item.amount` |

## 표시 컬럼 (테이블)

| 컬럼 | 출처 |
|---|---|
| 거래일 | `Invoice.invoiceDate` |
| 거래처 | `Invoice.supplier` |
| 규격 | `InvoiceItem.spec` (`/ InvoiceItem.unit`) |
| 수량 | `InvoiceItem.quantity` |
| 단가 | `InvoiceItem.unitPrice` |
| 금액 | `InvoiceItem.amount` |

## 필터 · 정렬

- **거래처 필터** — 이 수종의 이력에 등장하는 거래처 목록
- **규격 필터** — 이 수종의 이력에 등장하는 규격 목록
- **기간 필터** — `시작 ≤ invoiceDate ≤ 종료` (문자열 비교로 YYYY-MM-DD 순)
- **정렬** — 최근 거래순(기본) · 오래된 순 · 단가 높은순 · 단가 낮은순 · 수량 많은순
- **필터 초기화** — 모든 필터를 지우고 기본 정렬로 복귀

필터가 적용되어도 상단 **통계 카드는 전체 이력 기준**으로 유지되고, 테이블
하단의 **합계 행**만 현재 필터 결과 기준으로 재계산됩니다.

## 데이터 흐름

```
사용자가 카드 클릭 → app.js · cardHandlers.onOpen(sp.id)
              │
              ▼   historyModal.js · openHistoryModal(speciesId)
              │
              ├─ state.data.species 에서 수종 찾기
              ├─ state.data.invoices → Map<invoiceId, invoice> 캐시
              ├─ itemsForSpecies(id, state.data.invoiceItems)
              │      → invoiceDate / supplier 를 붙여 hydrated rows 생성
              │
              ├─ renderStats()  — 통계 카드 7개 갱신
              ├─ populateFilterOptions() — 거래처·규격 셀렉트 채움
              └─ renderTable() — 필터·정렬 적용 후 테이블 렌더 + 합계 갱신
```

이 모달은 **읽기 전용**입니다. 개별 거래를 편집·삭제하려면 각 행을 클릭해
아래의 **거래 상세** 모달을 여세요.

---

# 🧾 사용자 흐름 — 거래 상세 (Transaction Detail)

구매 이력 테이블에서 각 행을 클릭하면 해당 **한 건의 거래(Invoice)** 를
읽기/편집/삭제할 수 있는 모달이 열립니다.

```
Species Card
    │  (카드 본문 클릭)
    ▼
구매 이력 (Transaction List — historyModal.js)
    │  (테이블 행 클릭 · Enter · Space)
    ▼
거래 상세 (Transaction Detail — transactionDetailModal.js)
    │
    ├─ 보기 모드
    │     • 거래일 · 거래번호 · 거래처 · 연락처 · 주소
    │     • 품목 목록 · 총 구매수량 · 총 구매금액
    │     • [🖼 원본 이미지]  [✎ 수정]  [삭제]
    │
    └─ 수정 모드  ([✎ 수정] 클릭 시)
          • 헤더 5필드 편집 가능
          • 품목 그리드 편집 가능 (수량·단가는 금액 자동 재계산)
          • [+ 품목 추가] · 행 [✕] 삭제
          • [저장]  [취소]  변경사항이 없으면 [저장] 비활성화
```

## 화면 구성

**헤더** (거래 정보)

| 필드 | 필수 | 편집 |
|---|---|---|
| 거래일 | ✔ | ✔ |
| 거래번호 |  | ✔ |
| 거래처 | ✔ | ✔ |
| 연락처 |  | ✔ |
| 주소 |  | ✔ |

**품목 그리드** (컬럼)

수종명 · 규격 · 단위 · 수량 · 단가 · 금액 · [✕] (수정 모드에서만)

**합계 (자동 계산)**

| 항목 | 계산 |
|---|---|
| 총 구매수량 | Σ 수량 |
| 총 구매금액 | Σ 금액 |

## Validation (저장 시)

- 거래일 필수 (`invoiceDate`)
- 거래처 필수 (`supplier`)
- 품목 최소 1건
- 각 행의 수량 ≥ 0, 단가 ≥ 0
- 실패 시 toast 알림 + 첫 문제 필드에 포커스

## Dirty 감지 · UX 규칙

- 수정 모드 진입 시점의 폼 상태를 스냅샷으로 저장 (`originalSerialized`).
- 헤더·품목 어느 필드든 입력이 있을 때마다 재직렬화하여 비교.
- **변경사항 없음 → [저장] 버튼 비활성화** (`disabled`).
- 편집 중 닫기/Escape 시도 → `confirm()` 확인.
- 취소 클릭 → 스냅샷 시점의 값으로 되돌리고 보기 모드 복귀.

## 저장 후 데이터 흐름

```
[저장] 클릭
    │
    ▼
transactionDetailModal.js · commitSave()
    │  (validation)
    ▼
app.js · updateInvoice(invoiceId, header, items)
    │
    ├─ 1. Invoice 헤더 in-place 패치  (id, createdAt 는 그대로)
    ├─ 2. 이 invoice 의 모든 InvoiceItem 제거
    └─ 3. 새 items 생성
          · speciesId 가 있으면 재사용
          · 없으면 matchSpecies() 로 재해석
          · 여전히 매치 없으면 새 Species 자동 생성
    │
    ▼
persistAndRerender() ─► storage.save() + refreshFilterUi() + rerender()
    │
    ▼
ui.render() ─► enrichAllSpecies(species, invoices, invoiceItems)
    │
    │  stats.js 재계산 (avg/min/max/last/main/heatmap …)
    ▼
Species 카드 그리드 자동 갱신
    │
    ▼
refreshHistoryModal() ─► 구매 이력 모달이 열려 있으면 재렌더
```

## 거래 삭제

`[삭제]` 버튼 → `confirm()` → `app.js · deleteInvoice(id)`
- `state.data.invoices` 에서 해당 Invoice 제거
- `state.data.invoiceItems` 에서 `invoiceId === id` 인 라인 모두 제거
- `persistAndRerender()` → stats 자동 재계산 → 카드 갱신
- 열려있던 구매 이력 모달도 `refreshHistoryModal()` 로 즉시 반영

Species 는 삭제하지 않습니다 — 이 거래 외 다른 이력이 남아 있을 수 있고,
없더라도 카드는 통계가 0 인 상태로 계속 표시됩니다.

## 원본 이미지

`[🖼 원본 이미지]` 버튼은 이제 실제로 동작합니다. 첨부된 원본이 있으면
enabled, 없으면 disabled 로 표시되며, 클릭 시 아래의 **첨부 뷰어** 모달을
엽니다.

---

# 🖼 원본 첨부 (Attachment)

거래명세서 원본(이미지 또는 PDF)을 브라우저 안에 안전하게 보관합니다.
아직 Supabase / Firebase 는 사용하지 않습니다.

## 저장 계층

```
┌────────────────────────────────────────────────────────────────┐
│  LocalStorage  ─ species-catalog:v2:*                          │
│      • Species / Invoice / InvoiceItem 3 컬렉션 (JSON 직렬화)  │
│      • Invoice.attachment  = { id, filename, mimeType, size,   │
│                                 createdAt, storagePath,        │
│                                 thumbnailPath, status }        │
│      • Invoice.analysis    = OCR 원본 JSON              │
├────────────────────────────────────────────────────────────────┤
│  IndexedDB   ─ species-catalog · attachments                   │
│      • { id, invoiceId, filename, mimeType, size,              │
│           blob:Blob, createdAt } — 실제 바이너리               │
│      • invoiceId 인덱스로 Invoice 삭제 시 카스케이드 제거     │
└────────────────────────────────────────────────────────────────┘
```

메타데이터는 LocalStorage, **바이너리(수 MB)** 는 IndexedDB — 각각의
용량 제약(5 MB vs 수백 MB)에 맞는 배치입니다.

## `attachmentStore.js` API

| 함수 | 설명 |
|---|---|
| `initAttachmentStore()` | 앱 부팅 시 DB open + 스토어 생성. 실패해도 앱 자체는 계속 동작. |
| `putAttachment({invoiceId, file})` | Blob 저장 + JSON-직렬화 가능한 메타데이터 반환 |
| `getAttachment(id)` | `{ id, invoiceId, filename, mimeType, size, blob, createdAt }` 반환 |
| `deleteAttachment(id)` | 단일 삭제 |
| `deleteAttachmentsForInvoice(invoiceId)` | Invoice 삭제 시 카스케이드 |
| `listAttachments()` | 디버그용 · 메타데이터만 |

## 업로드 흐름

거래명세서 등록 위저드 Step 3 에서 **[저장]** 을 누르면:

```
invoiceModal.onSaveClicked (async)
    │  session.file  · session.analysis
    ▼
app.saveInvoice(header, items, { file, analysis })   ← async
    ├─ 1. Species 해결 (기존 로직 · matcher.js)
    ├─ 2. Invoice 헤더 생성
    ├─ 2b. invoice.analysis = OCR 원본 JSON  (있는 경우)
    ├─ 2c. putAttachment({invoiceId, file})
    │       ↳ Blob → IndexedDB
    │       ↳ 메타데이터 → invoice.attachment
    │       (실패 시 toast, invoice 자체는 저장 진행)
    ├─ 3. InvoiceItem 생성
    └─ persistAndRerender()  ← LocalStorage 저장 + 카드 재렌더
```

## 뷰어 (`attachmentViewer.js`)

Transaction Detail 의 `[🖼 원본 이미지]` → `openAttachmentViewer(invoiceId)`:

```
┌───────────────────────────────────────────────────────────────┐
│  원본 이미지 · inv-041 · sample-invoice.png                   │
│  [ − ]  [ 100% ]  [ + ]  [ 1:1 ]  [ ↻ ]  [↓ 다운로드]  [↗ 새창] [✕]│
├──────────────────────────────┬────────────────────────────────┤
│                              │  [원본] [AI 분석] [최종 저장값] │
│     (Blob 이미지 렌더링)     │                                │
│                              │  파일명 : sample-invoice.png   │
│     transform: scale/rotate  │  형식   : image/png            │
│     scrollable stage         │  크기   : 68 B                 │
│                              │  업로드 : 2026-07-18T…         │
│                              │  경로   : indexeddb:…/att-…    │
└──────────────────────────────┴────────────────────────────────┘
```

## 툴바 액션

| 액션 | 구현 |
|---|---|
| **확대 / 축소** | `[25, 50, 75, 100, 125, 150, 200, 300, 400]%` step |
| **원본 크기** | 100% 로 리셋 |
| **회전** | 90° 씩 증가 (0 → 90 → 180 → 270 → 0) |
| **다운로드** | `<a href=objectURL download=filename>` 클릭 |
| **새 창 열기** | `window.open(objectURL, "_blank", "noopener")` |

PDF는 `<iframe>` 으로 렌더되며 zoom/rotate 버튼은 자동 비활성화됩니다.

## 비교 탭

| 탭 | 내용 | 편집 |
|---|---|---|
| **원본** | 파일 메타데이터 (`filename`, `mimeType`, `size`, `createdAt`, `storagePath`) | — |
| **AI 분석 결과** | `Invoice.analysis` — OCR 원본 JSON | **읽기 전용** |
| **최종 저장값** | 현재 `Invoice` 헤더 + 연결된 `InvoiceItem` 배열 | — |

향후 Vision 재분석 · diff · 재편집 UI 는 이 3-way 구조 위에 붙일 수 있습니다.

## 카스케이드 삭제

`deleteInvoice(id)`:
1. `state.data.invoices` 에서 제거
2. `state.data.invoiceItems` 에서 `invoiceId === id` 제거
3. `deleteAttachmentsForInvoice(id)` — IndexedDB 카스케이드 (best-effort)
4. `persistAndRerender()` + `refreshHistoryModal()`

## 원본이 없는 거래

시드 데이터의 기존 Invoice 는 attachment 를 가지지 않습니다. 이 경우:
- 상세 모달의 `[🖼 원본 이미지]` 버튼은 **disabled** + `title="이 거래에는 원본 이미지가 없습니다"`
- 사용자가 강제로 뷰어를 열더라도 좌측 스테이지는 "저장되지 않음" 안내를 표시

---

## 모듈 아키텍처 (의존 방향)

```
utils.js  ◄──── (leaf)
state.js  ◄──── (leaf)

storage.js   ── depends on (none)
filter.js    ── utils
stats.js     ── (leaf, pure functions)
components.js── utils
vision.js    ── (leaf, self-contained parser)
importExport ── (leaf)

matcher.js    ── (leaf, pure functions — normalize / similarity / matchSpecies)
debugFlag.js  ── (leaf — URL/localStorage/keyboard toggle)
debugPanel.js ── state? (no) · vision debug envelope · via callbacks

ui.js         ── state · filter · stats · components
modal.js      ── state · vision · stats · components
invoiceModal  ── state · vision (Tesseract) · matcher (Step 3 배지 · 후보 팝오버) · debugPanel
historyModal  ── state · stats (거래 목록 · onOpenTransaction → 상세 모달)
transactionDetailModal ── state (view/edit/delete · onOpenAttachment → 뷰어)
attachmentStore ── IndexedDB (species-catalog/attachments)
attachmentViewer ── state · attachmentStore (image transform · tabs)
app.js        ── 위 모두 · matcher · IndexedDB 카스케이드 · orchestrates


```

순환 의존 없음, 각 모듈이 독립적으로 단위 테스트 가능.

## 확장 포인트

### 1. `vision.js` — 다른 OCR 프로바이더로 교체

`analyzeInvoice(file)`는 현재 Mock (`ok:false`)을 반환합니다. `vision.js`의 `analyzeInvoice()` 함수 내부에 **두 provider 훅**이 완전한 요청 스켈레톤과 함께 명확하게 표시되어 있습니다:

- **Option A · Claude Vision** (Anthropic): `claude-sonnet-5` 모델 · `/v1/messages` 엔드포인트 · image + text content 조합
- **Option B · OpenAI Vision** (`gpt-4o`): `/v1/chat/completions` · 유료 · 프록시 필요

응답 스키마(`AnalyzeResult`)는 JSDoc으로 정의되어 있어, 백엔드 프록시가 그 형식만 지키면 UI 코드 변경 없이 바로 동작합니다.

### 2. `storage.js` — DB / 서버 백엔드 연동

`save / load / clear` 3 메서드만 다른 구현으로 교체하면 됩니다. Fetch API로 REST 엔드포인트에 연결하거나 IndexedDB로 확장 가능. 컬렉션 단위(species/invoices/invoiceItems)가 이미 분리되어 있어 collection-per-table 매핑이 자연스럽습니다.

### 3. 향후 예정 기능 (모두 위 구조에서 자연 확장)

- **거래명세서 AI 자동 인식** → `vision.js` 실 구현 + `saveInvoice()` 헬퍼 추가
- **자동 수종 등록** → `analyzeInvoice()` 결과 → 새 Invoice + Items 삽입
- **구매 이력 관리** — 이미 지원됨 (`state.data.invoiceItems`)
- **구매 빈도 자동 계산** — 이미 지원됨 (`calculateMonthlyPurchaseHeatmap`)
- **사용자 로그인** → 인증 헤더 통과하는 `storage.js` 구현
- **웹 서버 배포** → 위 확장 후 정적 앱 + API 조합

## 기능 요약 (전부 유지됨)

- **검색**: 수종명/학명(`latin`) 부분일치
- **필터**: 개화월 · 카테고리 · 개화색 · 수급처 · 가격범위
- **정렬**: 이름순 · 최저가순 · 개화 이른순
- **다크모드**: OS 설정 자동 감지 + Theme 버튼 수동 전환
- **CRUD**: + 수종 추가 · 카드 hover ✎ 수정 · ✕ 삭제
- **거래명세서 등록**: `+ 거래명세서 등록` → 업로드 → **Tesseract.js 무료 OCR** → 검토 → 저장 (신규 수종 자동 생성 포함, API Key · 서버 필요 없음)
- **Species Matching**: Vision 결과가 오타여도 자동 연결 (`왕벗나무` → `왕벚나무`) · 애매하면 사용자 선택 팝오버 · 매치 없으면 새 수종 자동 생성
- **구매 이력 조회**: 카드 본문 클릭 → 수종별 통계 · 필터(거래처/규격/기간) · 정렬 이력 테이블
- **거래 상세 · 편집 · 삭제**: 이력 행 클릭 → view/edit 모드 전환 · 헤더/품목 편집 · 저장 시 stats 자동 재계산
- **원본 첨부 뷰어**: 상세 모달의 [🖼 원본 이미지] → zoom · rotate · 다운로드 · 새 창 · 원본/AI/최종 저장값 3-way 비교 탭 (IndexedDB 저장)
- **Debug Mode** (`?debug=1`): 개발자 전용 OCR 검증 화면 · Vision 원본 JSON · 정규화 · 사용자 편집 · 실제 저장 · **3-way Diff (OCR/사용자/최종)** · **자동 인식 성공률 %** · **필드 색상 3-tier (초록·주황·빨강)** · **HTTP status + 응답시간** · **10개 테스트 체크리스트** · 저장 Invoice/Vision 응답 다운로드
- **JSON 가져오기/내보내기**: 백업·공유용 (v1·v2 스키마 모두 호환)
- **시드 복원**: `data/species.json` 원본으로 리셋
- **개화기 블록**: 12칸, 개화 월만 활성색
- **구매 빈도 블록**: 12칸 GitHub Contribution 스타일 5단계 히트맵 (색상 농도만)
- **단가표**: 규격/단위/단가 행 편집
- **수급처**: 상호/지역/연락처 행 편집
- **OCR 화면**: 파일 첨부(이미지 미리보기) + 텍스트 붙여넣기 → 자동 파싱 → 폼 채움

## 시드 데이터 안내

`data/species.json`의 시드는 **구조 예시용 목업**입니다. 실제 시세·수급처는 검증되지 않았으므로 실무 발주에는 사용하지 마세요. 실제 데이터는 국립수목원, 조달청 나라장터, 지역 산림조합 등의 자료로 대체하시기 바랍니다.
