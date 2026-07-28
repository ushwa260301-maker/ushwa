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

## 5-1. Promotion (승격) 상세 설계 — **구현 전 · 설계 확정본**

> 도감 항목을 운영 Species 로 등록하는 유일한 경로. **자동 생성은 금지**이며
> 반드시 사람의 명시적 요청 + 승인을 거친다.

### 상태 전이

```
guide 항목 (pg-110-01)
   │  [이 수종 등록] 클릭
   ▼
① 중복 검사 (자동 · 저장 없음)
   │   exact  : 기존 Species.name 완전 일치
   │   similar: matcher.calculateSimilarity ≥ 0.85
   ▼
   ├── 완전 일치 → "기존 수종에 연결" 제안 (신규 생성 금지)
   ├── 유사 후보 → 목록 제시 → 사용자가 [연결] 또는 [새로 등록] 선택
   └── 없음     → ② 로 진행
   ▼
② 등록 요청 생성 (pending)
   │   { guide_id, requested_by, requested_at, decision: "pending" }
   ▼
③ 관리자 승인 / 반려
   │   승인 권한: users.role = 'admin' (schema.sql 기존 정의 재사용)
   ├── 반려 → { decision:"rejected", reason }  · Species 변경 없음
   └── 승인 ↓
   ▼
④ Species 생성 (기존 저장 경로 app.js 사용 · 신규 저장 로직 없음)
   │   name ← guide.name
   │   latin ← guide.scientific_name
   │   bloomMonths ← [flowering_start … flowering_end]
   │   guide_id ← guide.id            ← 스칼라 1개 (승인된 규약)
   │   category ← 사용자 선택 (도감에 분류 없음 · 추측 금지)
   │   colors/suppliers/notes ← 빈 값 (운영 데이터는 이후 사용자가 채움)
   ▼
⑤ 완료 — guide 레코드는 **불변**, 아무것도 기록하지 않는다
```

### 불변 규칙

| 규칙 | 이유 |
|---|---|
| 도감 필드(height·light·landscape_use·market_size·plant_density·image_index·page)는 **복사하지 않음** | 단일 출처 유지 — `guide_id` 로 조회 |
| 도감 파일은 **읽기 전용** | 정적 JSON · 승격 상태를 도감에 쓰지 않음 |
| 자동 승격 **금지** | OCR·매칭이 임의로 운영 데이터를 만들지 않음 |
| 이미 `guide_id` 가 있는 Species 에 재승격 **금지** | 중복 방지 |
| 승격 실패/반려 시 Species **무변경** | 운영 데이터 보호 |

### 저장 위치 `[확인 필요]`

승격 요청·승인 이력을 어디에 둘지는 미확정이다.

| 후보 | 장점 | 단점 |
|---|---|---|
| A. 저장하지 않음(즉시 등록) | 구현 최소 · 단일 사용자에 충분 | 승인 흐름·이력 없음 |
| B. LocalStorage | Cloud 무변경 | 기기별 분리 · 협업 불가 |
| C. Cloud 신규 테이블 `guide_promotions` | 이력 영구·공용 | **Cloud 스키마 변경 필요(별도 승인)** |

**권장**: 현재 단계는 **A**(즉시 등록 + 중복 검사만), 다중 사용자 도입 시 **C**.

### 구현 시 변경 예상 범위 (참고 · 아직 구현하지 않음)

- `js/plantGuideModal.js` — 상세에 [이 수종 등록] 버튼 + 중복 검사 결과 표시
- `js/app.js` — 승격 진입점 1개(기존 `saveSpecies` 재사용) · **Species 로직 변경 없음**
- `matcher.js` — **수정 없음**(import 만)
- Cloud/OCR/Invoice/Sync — **무변경**

## 5-2. Promotion 설계 검증 결과 (실제 코드 기준 · 구현 전)

`saveSpecies`(app.js:56-97) 를 실제로 읽고 검증했다. **설계 수정이 필요한
사실 1건을 발견**했다.

### ⚠️ 발견: `saveSpecies` 를 그대로 쓰면 `guide_id` 가 사라진다

- `app.js:138-148` `extractSpeciesMeta()` 는 **7개 필드만**
  (`name·latin·category·bloomMonths·colors·suppliers·notes`) 반환한다.
- 신규 생성 경로는 `state.data.species.push({ id, ...meta })`(app.js:66) 이므로
  payload 에 `guide_id` 를 넣어도 **meta 단계에서 탈락**한다.
  (수정 경로 `app.js:61` 은 기존 객체를 spread 하므로 이미 있는 값은 보존된다)

**대응 3안**

| 안 | 방식 | 영향 | 평가 |
|---|---|---|---|
| A | 승격 전용 경로에서 `saveSpecies` 호출 후 `guide_id` 를 별도 대입 | `extractSpeciesMeta` 무수정 · 저장 2회 | 단순하나 중간 상태 발생 |
| B | `extractSpeciesMeta` 에 `guide_id` 패스스루 1줄 추가 | Species 코드 1줄 변경 | **권장** — 저장 1회 · 부작용 없음 |
| C | 승격이 species 배열에 직접 push | 저장 경로 이원화 | 비권장(규칙 위반) |

→ **권장 B** (`guide_id: payload.guide_id || undefined` 1줄). 구현 시 승인 필요.

### `saveSpecies` 부작용 검증 — 승격 입력에서는 안전

`saveSpecies` 는 species 저장 외에 2가지를 더 한다:

| 부작용 | 승격 시 동작 | 근거 |
|---|---|---|
| `purgeInvoiceRecordsFor(speciesId)` | **no-op** — 신규 id 라 참조 레코드 0 | app.js:72 |
| `synthesizeInvoicesForSpecies(...)` | **생성 0건** — `prices=[]`·`counts=0` 이면 두 분기(`total>0 && prices.length`, `prices.length`) 모두 false | app.js:185·223 |
| `mirrorSaveSpecies` | Cloud upsert 1회 (정상) | app.js:95 |

→ 승격 payload 에 `prices`/`purchaseCounts` 를 **넣지 않으면** Invoice·InvoiceItem
에 아무 영향이 없다. **이것이 승격 호출의 필수 조건이다.**

### 중복 검사 기준 (확정)

| 단계 | 판정 | 처리 |
|---|---|---|
| 1 | `name` 완전 일치 | **신규 생성 금지** → 기존 Species 에 연결 제안 |
| 2 | `calculateSimilarity ≥ 0.85` | 후보 목록 제시 → 사용자가 [연결]/[새로 등록] 선택 |
| 3 | 그 외 | 신규 생성 진행 |

- 비교 대상은 `normalizeSpeciesName()` 정규화 후 값 (matcher.js 재사용 · 수정 없음)
- 임계값 0.85 는 기존 Parser 수정 규칙과 동일 기준을 따른다

### `guide_id` 저장 위치 (확정)

- **위치**: `Species` 레코드의 최상위 스칼라 1개 (`species.guide_id = "pg-110-01"`)
- **경로**: LocalStorage(v2 species 컬렉션)에 그대로 직렬화됨
- ⚠️ **Cloud 한계**: `cloudStore.speciesFromDb()` 는 8개 필드만 복원하므로
  **Cloud-first read 가 로컬을 덮으면 `guide_id` 가 소실**된다.
  Cloud 반영은 `species` 테이블 컬럼 추가가 필요하며 **별도 승인 대상**이다.
  승인 전에는 `guide_id` 를 **로컬 전용 링크**로 간주한다.

### Rollback 가능 여부 (확정)

| 시나리오 | 가능 여부 | 방법 |
|---|---|---|
| 승격 직후 취소 | **가능** | `deleteSpecies(id)` — 승격 species 는 거래 이력이 0 이라 T6 Phase3 의 "참조 있으면 거부" 정책에 걸리지 않음 |
| Cloud 반영분 | **가능** | `mirrorDeleteSpecies` 가 Cloud 행도 삭제 |
| 거래 등록 이후 | **불가** | 거래 이력 보존 정책상 삭제 거부 — 정상 동작 |
| 도감 원본 | **영향 없음** | 도감은 읽기 전용이라 승격/취소로 변하지 않음 |

## 5-3. Plant Guide Validator 설계 (구현 전)

도감이 수천 종으로 커질 때 **잘못된 참고 데이터가 조용히 섞이는 것**을 막는
검증기. OCR 코퍼스 러너(`tests/ocr-accuracy.mjs`)와 같은 성격의 CLI 로 둔다.

**위치(안)**: `species-catalog/tests/guide-validate.mjs` — Node 실행,
앱 코드와 분리, 실패 시 `exit 1`.

### 검사 항목

| # | 대상 | 검사 | 실패 등급 |
|---|---|---|---|
| 1 | index.json | `schema` 값 존재·지원 버전 | **ERROR** |
| 2 | index.json | `files[]` 의 파일이 실제로 존재 | **ERROR** |
| 3 | index.json | `count` 가 실제 레코드 수와 일치 | **ERROR** |
| 4 | page JSON | `species` 가 배열 | **ERROR** |
| 5 | record | 필수 필드 존재: `name` | **ERROR** |
| 6 | record | `id` **전역 중복 없음** (파일 간 포함) | **ERROR** |
| 7 | record | `id` 가 `pg-` 네임스페이스 | **ERROR** |
| 8 | record | `page` 가 정수 · 파일 `pages[]` 에 포함 | **ERROR** |
| 9 | record | `flowering_start/end` 가 1~12 또는 null · start ≤ end | **ERROR** |
| 10 | record | `plant_density` 가 `{min,mid,max}` 정수 · min ≤ mid ≤ max | **ERROR** |
| 11 | record | 금지 필드 부재(`usage`·`root_type`·구매 관련) | **ERROR** |
| 12 | record | `scientific_name` 비어 있음 | WARN |
| 13 | record | `height`·`market_size`·`light`·`landscape_use` 비어 있음 | WARN |
| 14 | record | `image_index` 가 파일 내에서 유일 | WARN |
| 15 | source 추적 | 파일에 `source`·`extractedAt` 존재 | WARN |

- **bloomMonths 형식**: 도감 page JSON 은 `flowering_start/end` 가 정본이며
  `bloomMonths` 는 **Species 승격 시 파생**된다. page JSON 에 `bloomMonths` 가
  있으면 `[start…end]` 와 일치하는지 검사(WARN) — 불일치는 추출 오류 신호.
- **출력**: 파일별 ERROR/WARN 요약 + 총계. ERROR ≥ 1 이면 exit 1.
- **원칙**: 검증기는 **읽기만** 한다. 자동 수정·자동 보정을 하지 않는다
  (원문 보존 원칙).

## 5-4. `guide_id` Cloud 손실 지점 (실제 코드 확인 · 변경하지 않음)

승격 링크 `species.guide_id` 는 **로컬에서는 살아남지만 Cloud 왕복에서 사라진다.**
Cloud 스키마 변경은 이번 범위가 아니므로 **손실 지점만 기록**한다.

### 손실 경로

```
승격 → species.guide_id 기록 (LocalStorage 보존 ✓)
   │
   ├── mirrorSaveSpecies → speciesToDb(cloudStore.js:24-35)
   │        컬럼 8개만 전송 → guide_id 전송 안 됨          ← 손실 ①
   │
   └── 다음 로드 → loadCloudFirst → fetchAll
            speciesFromDb(cloudStore.js:40-51)
            8개 필드만 복원 → guide_id 없는 객체 생성
            → storage.save(merged) 로 로컬을 덮음          ← 손실 ② (비가역)
```

| 지점 | 파일:라인 | 현상 |
|---|---|---|
| ① 쓰기 | `cloudStore.js:24-35` `speciesToDb` | `id·name·latin·category·bloom_months·colors·suppliers·notes` 만 전송 |
| ② 읽기 | `cloudStore.js:40-51` `speciesFromDb` | 같은 8개만 복원 — `guide_id` 미포함 |
| ③ 스키마 | `supabase/schema.sql:53-66` `species` | `guide_id` 컬럼 **없음** |
| ④ RPC | `supabase/rpc.sql` `save_invoice_tx` species upsert | 동일 8개 컬럼만 |

### 결론

- **현 상태**: `guide_id` 는 **로컬 전용 링크**다. Cloud 를 쓰는 환경에서는
  Cloud-first read 가 로컬을 덮는 순간 링크가 끊긴다.
- **영향 범위**: 링크만 끊긴다. Species 본체·거래·도감 원본은 **손상되지 않는다**
  (도감은 정적 파일이라 `guide_id` 없이도 이름으로 재연결 가능).
- **Cloud 반영에 필요한 것** (모두 **별도 승인 대상**):
  1. `species` 테이블에 `guide_id text` 컬럼 추가 — **신규 migration SQL**
     (`schema.sql` 직접 수정 금지 원칙 유지)
  2. `speciesToDb` / `speciesFromDb` 에 필드 1개씩 추가
  3. `save_invoice_tx` 의 species upsert 컬럼 추가
- **그 전까지의 운용 지침**: 승격은 로컬 기준으로만 신뢰하고, Cloud 동기화
  환경에서는 `guide_id` 소실을 정상 동작으로 간주한다.

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
