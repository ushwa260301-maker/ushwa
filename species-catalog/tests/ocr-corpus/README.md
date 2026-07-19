# OCR 정확도 코퍼스

이 폴더는 실제 거래명세서를 Tesseract.js 로 OCR 한 결과와 유사한 **텍스트 스냅샷** 을 모아둔 곳입니다. `js/vision.js` 의 `normalizeOcrText()` + `parseInvoiceText()` 파이프라인을 회귀 방지 없이 개선하기 위한 자동 검증 기반입니다.

## 형식

각 파일은 하나의 fixture 를 JSON 으로 담습니다:

```jsonc
{
  "id": "01-standard",
  "description": "짧은 한 줄 요약 · 어느 농원 서식인지",
  "ocr": "Tesseract 가 뽑아낸 원본 텍스트 (그대로 · 오탈자 유지)",
  "expect": {
    "invoiceDate": "2025-07-18",         // 선택
    "invoiceNumber": "TR-…",             // 선택
    "supplier": {
      "name":    "천리포수목원",
      "region":  "충남 태안군",           // substring 매치 허용
      "contact": "010-1234-5678"
    },
    "rows": [
      { "name": "왕벚나무", "spec": "R6", "unitPrice": 45000 }
    ]
  }
}
```

## 실행

```bash
node species-catalog/tests/ocr-accuracy.mjs
```

목표: **평균 인식률 ≥ 95%**. 새 파일을 이 폴더에 추가하고 실행하면 자동으로 채점됩니다.

## 새 fixture 추가 방법

1. 앱을 `?debug=1` 로 열고 실제 거래명세서를 업로드
2. Debug Panel `① Vision Raw` 탭에서 `text` 값을 복사
3. `expect` 를 채워 이 폴더에 새 JSON 을 저장 (파일명은 `NN-어느농원.json` 관행)
4. `node species-catalog/tests/ocr-accuracy.mjs` 로 회귀 확인
