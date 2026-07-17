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
│   ├── app.js           # 엔트리 포인트: 부트스트랩 + 이벤트 배선
│   ├── state.js         # 중앙 상태 (state, formState, resetFilters)
│   ├── ui.js            # 최상위 렌더링·요소 캐시·토스트·테마 토글
│   ├── filter.js        # 필터·정렬 순수 함수 (matches, sortList)
│   ├── components.js    # DOM 빌더 (createCard, chips, month-grid, row 편집기)
│   ├── modal.js         # 수종 추가/수정 모달 (파일 첨부 + 텍스트 파싱 포함)
│   ├── storage.js       # LocalStorage 인터페이스 (교체 가능)
│   ├── importExport.js  # JSON 내보내기·가져오기, 시드 로드
│   ├── vision.js        # OCR: analyzeInvoice() Mock + parseInvoiceText() 파서
│   └── utils.js         # 순수 유틸리티·상수 (COLOR_MAP, MONTHS, colorFor …)
│
├── data/
│   └── species.json     # 시드 데이터 (첫 방문 시 로드 → localStorage로 이관)
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

또는:

- **VS Code**: `Live Server` 확장 설치 후 `index.html` 우클릭 → `Open with Live Server`
- `npx serve .` · `npx http-server .` 등 정적 서버 무엇이든 무방

## 배포

빌드 단계가 없어 파일 그대로 정적 호스팅 서비스에 올리면 됩니다:

- **Vercel**: 리포지토리 임포트 → Build 명령 없음, Output 디렉토리 `species-catalog/`
- **Netlify**: 새 사이트 → Publish directory `species-catalog/`
- **GitHub Pages**: 저장소 Settings → Pages → Source: `main` 브랜치 / `species-catalog/` 폴더
- **Cloudflare Pages / S3 / Nginx**: 4개 CSS + JS 모듈 + `data/species.json`만 서빙

## 모듈 아키텍처

**의존 방향** (순환 없음):

```
utils.js  ←────────┐
                   │
state.js ← storage.js
   ↑              ↑
   │              │
   ├── filter.js  │
   ├── components.js
   ├── vision.js
   ├── importExport.js
   ├── ui.js  ─→  components.js, filter.js, state.js
   └── modal.js ─→ components.js, vision.js, state.js
                 
app.js ─→ 모두 임포트하여 배선
```

### 데이터 흐름

1. **부트**: `storage.load()` → 없으면 `loadSeed()` → `state.data` 채움
2. **필터 변경**: 사용자 입력 → `state.filters.*` 갱신 → `render()` 호출
3. **CRUD**: 모달 저장/삭제 → `app.js`의 `saveSpecies/deleteSpecies` → `storage.save` + `render`
4. **가져오기/내보내기**: `importExport.js` → 검증 후 `state.data` 교체 → 저장 + 리렌더

## 확장 포인트

### 1. `vision.js` — Vision API 연동 (핵심 확장 포인트)

`analyzeInvoice(file)`는 현재 Mock입니다. 실제 Vision API 연동 위치:

```js
export async function analyzeInvoice(file) {
  // 1. 파일 → base64
  // 2. 백엔드 API로 POST (Claude Vision / OpenAI Vision)
  // 3. AnalyzeResult 형식으로 반환
}
```

응답 스키마(JSDoc)는 `vision.js` 파일 끝부분에 정의되어 있으므로, 백엔드는 그 형식만 지키면 UI 코드 변경 없이 바로 동작합니다.

### 2. `storage.js` — DB / 서버 백엔드 연동

`storage.save / load / clear` 3개 메서드만 다른 구현으로 교체하면 됩니다.
Fetch API로 REST 엔드포인트로 연결하거나 IndexedDB로 확장 가능.

```js
export const storage = {
  async save(data) { await fetch("/api/catalog", { method:"PUT", body: JSON.stringify(data) }); },
  async load()     { const res = await fetch("/api/catalog"); return res.json(); },
  async clear()    { await fetch("/api/catalog", { method:"DELETE" }); }
};
```

호출자(`app.js` 등)에서 async 대응 필요.

### 3. `state.js` — 상태 관리 확장

지금은 평범한 mutable 객체입니다. 반응성이 필요해지면(예: 여러 페이지에서 동일 상태 참조) `state.js`만 Zustand-스타일 store로 교체하면 됩니다.

### 4. 향후 예정 기능

- 거래명세서 AI 자동 인식 → `vision.js` 실 구현
- 자동 수종 등록 → `analyzeInvoice()` 결과 → `saveSpecies()` 직결
- 구매 이력 관리 → `state.data.species[].purchases[]` 스키마 추가
- 구매 빈도 자동 계산 → 이력에서 `purchaseCounts` 파생
- 사용자 로그인 → 인증 헤더 통과하는 `storage.js` 구현
- 웹 서버 배포 → 위 확장 후 정적 앱 + API 조합

## 기능 요약 (전부 유지됨)

- **검색**: 수종명/학명 부분일치
- **필터**: 개화월 · 카테고리 · 개화색 · 수급처 · 가격범위
- **정렬**: 이름순 · 최저가순 · 개화 이른순
- **다크모드**: OS 설정 자동 감지 + Theme 버튼 수동 전환
- **CRUD**: + 수종 추가 · 카드 hover ✎ 수정 · ✕ 삭제 (localStorage)
- **JSON 가져오기/내보내기**: 백업·공유용
- **시드 복원**: `data/species.json` 원본으로 리셋
- **개화기 블록**: 12칸 브래킷, 개화 월만 활성색
- **구매 빈도 블록**: 12칸 GitHub Contribution 스타일 5단계 히트맵 (색상 농도만)
- **단가표**: 규격/단위/단가 행 편집
- **수급처**: 상호/지역/연락처 행 편집
- **OCR 화면**: 파일 첨부(이미지 미리보기) + 텍스트 붙여넣기 → 자동 파싱 → 폼 채움

## 데이터 스키마

```jsonc
{
  "categories": ["교목", "관목", ...],
  "colors": ["백색", "황색", ...],
  "species": [
    {
      "id": "sp-001",                        // 자동 부여
      "name": "왕벚나무",                    // 필수
      "scientificName": "Prunus × yedoensis",
      "category": "교목",
      "bloomMonths": [3, 4],
      "colors": ["백색", "분홍"],
      "prices": [
        { "spec": "R6", "unit": "주", "price": 45000 }
      ],
      "suppliers": [
        { "name": "천리포수목원", "region": "충남 태안", "contact": "041-672-9982" }
      ],
      "purchaseCounts": [0, 0, 3, 5, 0, 0, 0, 0, 0, 0, 0, 0],
      "notes": "가로수·공원용으로 다용."
    }
  ]
}
```

## 시드 데이터 안내

`data/species.json`의 시드 12개 수종은 **구조 예시용 목업**입니다. 실제 시세·수급처는 검증되지 않았으므로 실무 발주에는 사용하지 마세요. 실제 데이터는 국립수목원, 조달청 나라장터, 지역 산림조합 등의 자료로 대체하시기 바랍니다.
