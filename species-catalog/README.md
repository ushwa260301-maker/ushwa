# 수종 카탈로그 (Species Catalog)

식물 수종별 **개화시기 · 단가표 · 수급처**를 데이터로 축적하고, 다중 필터를 조합해 원하는 수종만 골라 볼 수 있는 정적 웹앱입니다.

어서화(꽃 중개 플랫폼)와 완전히 분리된 독립 모듈이며, 서버·빌드 도구 없이 브라우저만 있으면 동작합니다.

## 폴더 구조

```
species-catalog/
├── index.html         # 메인 페이지 (필터 + 결과 그리드)
├── css/style.css      # 스타일
├── js/app.js          # 필터링/정렬/렌더링 로직
├── data/species.json  # 수종 데이터 (여기에 계속 추가)
└── README.md
```

## 실행

`fetch()`로 JSON을 불러오므로 파일을 그냥 더블클릭하지 말고 로컬 서버로 열어야 합니다.

```bash
cd species-catalog
python3 -m http.server 8080
# 브라우저에서 http://localhost:8080 접속
```

또는 VS Code의 Live Server 확장, `npx serve` 등 아무 정적 서버든 무방합니다.

## 데이터 스키마 (`data/species.json`)

```json
{
  "categories": ["교목", "관목", "초본", ...],
  "colors": ["백색", "황색", "적색", ...],
  "species": [
    {
      "id": "sp-001",
      "name": "왕벚나무",
      "scientificName": "Prunus × yedoensis",
      "category": "교목",
      "bloomMonths": [3, 4],
      "colors": ["백색", "분홍"],
      "prices": [
        { "spec": "R6", "unit": "주", "price": 45000 },
        { "spec": "R8", "unit": "주", "price": 85000 }
      ],
      "suppliers": [
        { "name": "천리포수목원", "region": "충남 태안", "contact": "041-672-9982" }
      ],
      "notes": "가로수·공원용으로 다용."
    }
  ]
}
```

| 필드 | 설명 |
|---|---|
| `id` | 고유 ID (자유 형식) |
| `name` | 수종명 (국문) |
| `scientificName` | 학명 (선택) |
| `category` | `categories` 배열 중 하나 |
| `bloomMonths` | 개화월 배열 (1~12) |
| `colors` | 개화색 배열 (`colors` 배열의 값) |
| `prices[]` | 규격별 단가 |
| `suppliers[]` | 수급처(농장/수목원) 목록 |
| `notes` | 비고 (선택) |

## 필터 기능

- **이름 검색**: 국문명/학명 부분일치
- **개화월**: 다중 선택(1~12월), 하나라도 겹치면 매칭
- **카테고리**: 다중 선택
- **개화색**: 다중 선택, 하나라도 겹치면 매칭
- **수급처**: 단일 선택 (데이터에서 자동 수집)
- **가격 범위**: 최소~최대, 단가표 중 하나라도 범위 안이면 매칭

## 정렬

- 이름순 (기본)
- 최저가 낮은순 / 높은순
- 개화 이른순

## 데이터 추가 방법

1. `data/species.json`의 `species` 배열에 새 객체를 추가
2. `categories` / `colors`에 없는 값이면 상단 배열에도 추가
3. 브라우저 새로고침 → 필터 옵션과 카드가 자동 반영

## 확장 아이디어

- CSV/엑셀 임포트 (SheetJS)
- 즐겨찾기 (localStorage)
- 지도로 수급처 시각화 (Kakao/Naver 지도)
- 관리자용 편집 UI (백엔드 연동 시)
