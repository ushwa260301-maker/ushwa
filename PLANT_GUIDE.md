# PLANT GUIDE — 설계 문서

> **설계 전용 문서다. 이 문서로 구현하지 않는다.**
> 현재 리포 구조(`species-catalog/`)를 기준으로 작성했으며, 확정되지 않은
> 것은 `[확인 필요]` 로 표시한다.

## 0. 원칙

| | Species | Plant Guide |
|---|---|---|
| 성격 | **운영 데이터** | **참고 데이터** |
| 내용 | 구매·공급처·가격·거래이력·OCR·Invoice | 국명·학명·개화기·키·광조건·식재위치·유통규격·식재밀도·이미지·페이지 |
| 규모 | 실제 운영 식물만 (수십~수백) | 도감 전체 (수천 종 가능) |
| 쓰기 주체 | 사용자(거래 등록·수종 편집) | **없음 — 도감 OCR 결과가 원본, 런타임 불변** |
| 구매 데이터 | 보유 | **절대 보유하지 않음** |

**두 데이터는 하나로 합치지 않는다.** Plant Guide → Species 는 **복사가 아니라
승격(promotion)** 이며, 승격 시에도 Guide 레코드는 그대로 남는다.

## 1. Plant Guide 데이터 구조

```jsonc
{
  "id": "pg-110-01",          // 페이지+순번 기반 안정 ID (재추출해도 동일)
  "name": "가우라(분홍)",
  "scientific_name": "Gaura lindheimeri",
  "flowering_start": 4,       // null 허용 (개화기 표기 없음)
  "flowering_end": 11,
  "height": "60~100cm",       // 원문 문자열 (파싱하지 않음)
  "light": "양지/반음지",
  "landscape_use": "둔치/화단",
  "market_size": "8",         // 원문 (H 0.4~ · 8/2~3분얼 등 비정형 포함)
  "plant_density": { "min": 25, "mid": 36, "max": 49 },
  "image_index": 1,
  "page": 110
}
```

**파일 단위**: 도감 1페이지(또는 펼침면) = JSON 1개.
```
species-catalog/data/plant-guide/
  index.json              ← 매니페스트(파일 목록 · 총 건수)
  page-110-111.json       ← { source, pages[], extractedAt, species[] }
  page-112-113.json
  …
```

**설계 결정**
- **정적 읽기 전용**: 사용자가 편집하지 않으므로 LocalStorage·Cloud 에 넣지
  않고 **정적 JSON 을 fetch 해 메모리에 보관**한다. 수천 종도 수백 KB 수준이라
  LocalStorage 5MB 한도·Cloud 스키마를 건드릴 이유가 없다.
- **원문 보존**: `height`·`market_size` 는 파싱하지 않고 원문 그대로 둔다
  (추측 금지 원칙). 수치화가 필요해지면 파생 계층에서 계산한다.
- **저장하지 않는 항목**: 식용 · 약용 · 민간요법 · 뿌리 정보 · 사용부위 ·
  기타 설명 — 도감 원본에 있어도 버린다.
- **id 규칙**: `pg-<page>-<순번2자리>`. Species 의 `sp-###` 와 접두가 달라
  두 네임스페이스가 절대 섞이지 않는다.

## 2. Species 와의 관계

```
Plant Guide (pg-110-01)  ──승격(1:0..1)──▶  Species (sp-013)
        │                                        │
   불변·참고                                 운영·편집 가능
   구매 데이터 없음                          거래·가격·공급처 보유
```

- **참조만 한다. 데이터를 복사해 동기화하지 않는다.**
- 승격된 Species 는 자신이 어느 도감 항목에서 왔는지만 기록한다:
  `species.guide_id = "pg-110-01"` (**스칼라 1개** · 도감 필드는 복사하지 않음).
  → 도감 상세는 항상 `guide_id` 로 Guide 에서 조회한다(단일 출처 유지).
- 승격 후 도감이 개정되어도 **Species 는 자동 변경되지 않는다**(운영 데이터
  보호). 갱신이 필요하면 사용자가 명시적으로 수행한다.
- ✅ **`species.guide_id` 승인됨** (2026-07-28). 제약:
  **스칼라 1개만 · 배열 금지 · 도감 데이터 복사 금지 · 조회는 `guide_id` 경유.**
  현재 승격 기능이 없어 `guide_id` 를 쓰는 Species 는 존재하지 않는다 —
  값은 승격 기능 구현 시점에 기록되며, 그 전까지 코드 변경은 불필요하다
  (Species 저장 경로가 미지정 필드를 보존하므로 스키마 선반영이 필요 없다).

## 3. 검색 흐름

```
사용자 검색어
   ↓
plantGuideStore.search(q)
   ↓ ① 국명 부분일치  ② 학명 부분일치  ③ NFD-자모 유사도
   ↓ (matcher.js 의 normalizeSpeciesName/유사도를 import 만 해서 재사용 · 수정 없음)
결과 목록 (id · name · scientific_name · page)
   ↓
상세 보기 (개화기 · 키 · 광조건 · 식재위치 · 유통규격 · 식재밀도)
```

- **지연 로드**: 도감은 앱 부팅에 필요 없다. 사용자가 도감을 열 때만
  `index.json` → 필요한 페이지 파일을 fetch 한다(평상시 0 비용).
- **메모리 인덱스**: 로드된 항목으로 name/scientific_name 인덱스를 구성.
  수천 건 선형 탐색으로 충분하며 별도 검색 엔진은 두지 않는다.
- 필터 후보(개화월 · 광조건 · 식재위치)는 목록에서 파생 계산한다 —
  저장하지 않는다.

## 4. 관리자 승인 흐름

```
도감 검색 → 항목 선택 → [Species 등록 요청]
   ↓
승인 대기 (요청자 · 대상 guide_id · 요청 시각)
   ↓
관리자 검토 — 중복 확인(이미 같은 이름의 Species 존재?)
   ↓                              ↓
승인                            반려(사유 기록)
   ↓
Species 신규 생성 (guide_id 연결)
```

- 권한 근거는 **이미 존재**한다: `supabase/schema.sql` 의
  `users.role text check (role in ('user','admin'))`. 새 권한 체계를 만들 필요가 없다.
- 승인 이력 저장 위치 `[확인 필요]` — 후보: Cloud 신규 테이블(`guide_promotions`)
  또는 로컬 전용. **Cloud 수정은 이번 범위 밖**이므로 결정 보류.
- 단일 사용자 운영 단계에서는 "승인" 단계를 생략하고 **즉시 등록**으로
  둘 수도 있다 `[확인 필요]`.

## 5. 도감 → Species 등록 흐름

승격 시 **매핑되는 값만** 옮긴다. 도감 고유 정보는 옮기지 않고 참조로 남긴다.

| Guide 필드 | Species 필드 | 비고 |
|---|---|---|
| `name` | `name` | 그대로 |
| `scientific_name` | `latin` | 기존 Species 필드 재사용 |
| `flowering_start/end` | `bloomMonths` | 범위를 배열로 전개 (예: 4~11 → [4…11]) |
| `id` | `guide_id` | **참조** |
| — | `category` | 도감에 분류 표기 없음 → 등록 시 사용자가 선택 |
| — | `colors` · `suppliers` · `notes` | 운영 데이터 — 빈 값으로 시작 |
| `height` · `light` · `landscape_use` · `market_size` · `plant_density` · `image_index` · `page` | **옮기지 않음** | `guide_id` 로 조회 |

- **중복 방지**: 등록 전 기존 Species 이름과 대조(정확 일치 + 유사도)해
  이미 있으면 "기존 수종에 `guide_id` 연결" 을 제안한다(신규 생성 대신).
- Species 신규 생성은 기존 저장 경로(`app.js`)를 그대로 사용한다 — 별도 저장
  로직을 만들지 않는다.

## 6. 추가할 파일 (현재 구조 기준)

| 경로 | 계층 | 역할 |
|---|---|---|
| `data/plant-guide/index.json` | Data | 페이지 파일 매니페스트 |
| `data/plant-guide/page-###-###.json` | Data | 페이지별 도감 레코드 (이미 1개 존재) |
| `js/plantGuideStore.js` | **Repository** | 로드·검색·조회 (**읽기 전용** · state/UI 무지) |
| `js/plantGuideModal.js` | Presentation | 도감 검색/상세 UI (**이번 범위 밖**) |
| `PLANT_GUIDE.md` | 문서 | 본 설계서 |

**계층 규칙 준수**(ARCHITECTURE.md): `plantGuideStore` 는 Repository 계층이며
Domain(`matcher.js`)을 **읽기 전용으로 import** 할 뿐 수정하지 않는다.
Presentation 은 `app.js` 를 경유한다.

**추가하지 않는 것**: Cloud 테이블 · RPC · RLS · Storage 버킷 · 신규 권한 체계.

## 7. 기존 기능 영향

| 대상 | 영향 |
|---|---|
| Species / Invoice / InvoiceItem | **없음** — 별도 네임스페이스(`pg-`), 별도 파일, 별도 스토어 |
| OCR (`vision.js`·`preprocess.js`) | **없음** — 거래명세서 파이프라인 무관 |
| `matcher.js` | **없음** — import 만, 수정 없음 |
| Cloud (`cloudStore`·`supabase/*`) | **없음** — 도감은 Cloud 에 저장하지 않음 |
| Sync (`syncManager`) | **없음** — 도감은 쓰기가 없어 pending 대상이 아님 |
| LocalStorage 용량 | **없음** — 도감은 LocalStorage 에 저장하지 않음 |
| 앱 부팅 성능 | **없음** — 지연 로드(도감 화면 진입 시에만 fetch) |
| OCR 회귀 229/240 | **영향 없음** |

**단 하나의 접점**: `species.guide_id`(스칼라 1개) 추가 — 별도 승인 필요(§2).
승인 전까지는 도감과 Species 가 **완전히 분리**되어 상호 영향이 0 이다.

## 8. 결정이 필요한 사항 `[확인 필요]`

1. `species.guide_id` 스칼라 추가 승인 여부 (미승인 시 승격 추적 불가)
2. 승인 이력 저장 위치 — Cloud 신규 테이블 / 로컬 / 생략(즉시 등록)
3. 도감 이미지 실제 파일 연결 시점 (현재는 `image_index` 번호만 보관)
4. `3721fcb` 로 `species.json` 에 들어간 도감 12건(`sp-013`~`sp-024`) 처리 —
   새 원칙상 Species 에 있으면 안 되는 참고 데이터다. 되돌릴지 결정 필요.
