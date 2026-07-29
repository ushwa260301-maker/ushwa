# IDEAS — Sprint 밖 아이디어 누적

> **여기 있는 것은 구현하지 않는다.** Sprint 밖에서 떠오른 개선점·기회를
> 잃지 않도록 누적 기록만 한다. 실제 구현 예정 항목은 [ROADMAP.md](./ROADMAP.md).
> 판단 우선순위: Business > Product > Data > Architecture > Sprint > Code.
> 확정되지 않은 것은 `[확인 필요]`. 하드코딩 금지 원칙은 여기서도 유효.

## Project Insight

- **최대 위험**: Cloud 트랙(T1–T4)이 실 브라우저에서 **한 번도 검증된 적
  없음**. 코드는 있으나 동작 증명 0 → 7/7 최초 실행 시 여러 단계 동시
  실패 가능. 병목은 규칙이 아니라 "검증 실행"으로 이동함.
- **최대 기회**: Cloud 가 켜지는 순간부터 실거래·OCR 수정 데이터가 축적
  시작 → Sprint 통과 자체가 데이터 자산의 변곡점.
- **지금 안 하지만 기억할 것**: 미push 커밋은 컨테이너 소멸 시 유실
  (Data 우선순위 관점의 상시 리스크). 7/7 직후 최우선은 필드 confidence.

## Business Insight

- **수종별 실거래 시세 데이터 자산** — `price_history` 기반. 자가신고가
  아닌 실거래 시세 → 복제 난이도 높은 해자.
- **공급업체 네트워크** — 실거래로 검증된 활성 공급업체 → 발주·견적 매칭 토대.
- **견적/발주 자동화** — 수종+시세+공급업체 결합 시 성립. Species Catalog
  다음 모듈 후보.
- **획득 루프** — 무료 OCR = 획득 훅, `ocr_corrections` = 해자. freemium
  후보. (수익모델·대상 규모·B2B/B2C 는 VISION `[확인 필요]`)

## AI Insight

- OCR 은 "읽기"가 아니라 **학습 데이터 생성 엔진**. `parsed_fields ↔
  user_edited_fields` 쌍이 자가개선의 근거.
- **약점 정량화**: 필드 단위 confidence + "사용자가 고쳤는가" → "AI 가 어느
  항목에서 약한가"가 데이터가 됨 → 개선 우선순위를 감이 아니라 수치로.
- **개선 측정**: `engine_version` 을 기록해야 시간축 A/B 로 향상을 증명 가능.
- 목표: 사람이 수정해야 하는 항목을 지속적으로 줄이는 것(VISION 성공 지표).

## Architecture Insight

- **Supplier Alias 매핑** — `supplier_aliases(alias_norm, supplier_id)`.
  OCR 훼손 업체명이 별도 supplier 로 갈라지는 것 방지 → 데이터 무결성.
  **업체명 하드코딩 금지, 데이터 테이블로만.** 병합은 사용자 승인 기반.
- **수정↔이미지 영역(bbox) 연결** — `ocr_corrections.attachment_id` +
  `regions jsonb`. 영역 단위 학습·자동 재파싱 (T8 Cloud Storage 이후).
- 계층 의존 규칙 유지(Domain 은 Repository 를 모른다) — 확장해도 이 경계는
  깨지 않는다.

## Data Insight

- **필드 단위 OCR Confidence** — `ocr_corrections.field_confidence jsonb`.
  어느 필드가 약한지 정량화 → OCR 개선 최우선 근거 (T9 배선 시).
- **engine_version 기록 배선** — 현재 컬럼은 있으나 항상 ''. Cloud write
  경로 활성 시 `vision.js` 엔진 태그로 채운다.
- **Fixture 영구 누적** — 실패 사례는 삭제하지 않고 회귀 자산으로 축적.
- **price_history** — 실거래 기반 시세. 규모 커지면 MATERIALIZED VIEW 전환
  검토 (임계 규모 `[확인 필요]`).

---

> 갱신 규칙: Sprint 밖 아이디어가 새로 보이면 해당 Insight 섹션에 한 줄로
> 추가한다. 구현하지 않는다 — 7/7 PASS 이후에만 검토 대상으로 승격.
