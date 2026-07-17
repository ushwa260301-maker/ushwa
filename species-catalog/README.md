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
│   ├── storage.js       # 3 컬렉션 LocalStorage 인터페이스 + v1→v2 자동 마이그레이션
│   ├── importExport.js  # JSON 내보내기·가져오기, 시드 로드 (신·구 스키마 모두 수용)
│   ├── vision.js        # OCR: analyzeInvoice() Mock + parseInvoiceText() · Claude/OpenAI 훅
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

또는 VS Code Live Server 확장, `npx serve .` 등 정적 서버 무엇이든 무방합니다.

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
- **미래의 실제 명세서 임포트와 호환** — Vision API가 만들 Invoice 레코드와 같은 스키마

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

ui.js     ── state · filter · stats · components
modal.js  ── state · vision · stats · components
app.js    ── 위 모두 · orchestrates
```

순환 의존 없음, 각 모듈이 독립적으로 단위 테스트 가능.

## 확장 포인트

### 1. `vision.js` — 실 Vision API 연동 (핵심 확장 포인트)

`analyzeInvoice(file)`는 현재 Mock (`ok:false`)을 반환합니다. `vision.js`의 `analyzeInvoice()` 함수 내부에 **두 provider 훅**이 완전한 요청 스켈레톤과 함께 명확하게 표시되어 있습니다:

- **Option A · Claude Vision** (Anthropic): `claude-sonnet-5` 모델 · `/v1/messages` 엔드포인트 · image + text content 조합
- **Option B · OpenAI Vision** (`gpt-4o` / `gpt-5`): `/v1/chat/completions` · JSON response_format 지정

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
- **JSON 가져오기/내보내기**: 백업·공유용 (v1·v2 스키마 모두 호환)
- **시드 복원**: `data/species.json` 원본으로 리셋
- **개화기 블록**: 12칸, 개화 월만 활성색
- **구매 빈도 블록**: 12칸 GitHub Contribution 스타일 5단계 히트맵 (색상 농도만)
- **단가표**: 규격/단위/단가 행 편집
- **수급처**: 상호/지역/연락처 행 편집
- **OCR 화면**: 파일 첨부(이미지 미리보기) + 텍스트 붙여넣기 → 자동 파싱 → 폼 채움

## 시드 데이터 안내

`data/species.json`의 시드는 **구조 예시용 목업**입니다. 실제 시세·수급처는 검증되지 않았으므로 실무 발주에는 사용하지 마세요. 실제 데이터는 국립수목원, 조달청 나라장터, 지역 산림조합 등의 자료로 대체하시기 바랍니다.
