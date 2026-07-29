# CLAUDE.md

이 프로젝트는 대한민국 최고의 조경 AI 플랫폼을 만드는 프로젝트입니다.

## 작업 시작 전 반드시 읽을 문서 (순서대로)

1. [VISION.md](./VISION.md) — 철학·품질 목표
2. [ROADMAP.md](./ROADMAP.md) — 현재 Sprint·T1~T10
3. [ARCHITECTURE.md](./ARCHITECTURE.md) — 계층·스키마·OCR 파이프라인
4. [DEVELOPMENT_RULES.md](./DEVELOPMENT_RULES.md) — 작업 규칙 전체

> 위 4개 문서가 정본이다. 이 파일은 포인터 + 최상위 규칙 요약이며,
> 세부는 항상 원문 문서를 따른다. 확정되지 않은 것은 `[확인 필요]`.

## 최상위 판단 기준

> **"이 변경이 AI가 더 똑똑해질 데이터를 만드는가?"**

코드보다 데이터. OCR 은 "읽는" 기능이 아니라 **AI 학습 데이터를 생성하는
엔진**이다. 기능을 늘리는 것보다 실제 거래명세서·OCR 정답·수정 이력이
쌓이는 구조를 만드는 것이 목표다.

## 작업 순서 (항상 준수)

```
① 구조 분석 → ② 변경 계획 → ③ 구현 → ④ 검증
```
추측해서 구현하지 않는다. 불확실하면 `[확인 필요]` 로 명시 후 진행.

## 현재 Sprint (최우선)

**Cloud Self Test 7/7 PASS.** 판단 기준은 브라우저 `?cloudtest=1` 결과만.

**7/7 PASS 이전 절대 금지**: Migration(T5) · 데이터 이전 ·
Cloud SoT 전환 · Dual-Write 제거 · 신규 기능 · 리팩토링.

- 현재 Sprint 범위만 구현한다. Sprint 밖 기능은 구현하지 않는다.
- **기존 기능을 절대 깨뜨리지 않는다** — 모든 변경은 회귀 테스트를
  통과해야 한다: `node species-catalog/tests/ocr-accuracy.mjs` → **229/240 유지**.

## Git 규칙

- 작업 브랜치: `claude/plant-species-flowering-filter-7gww27` (feature branch 전용).
- **main 직접 수정·merge 금지.** Push 는 사용자 지시가 있을 때만.
- PR 생성·main 병합은 사용자 승인 전 금지.
- Commit 하나 = 논리적 변경 하나.
