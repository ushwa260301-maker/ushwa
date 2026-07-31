-- ============================================================
-- Species Catalog · ocr_corrections 개인정보 격리 (RLS A안)
-- 2026-07-31
-- ============================================================
-- 배경
--   OCR 학습 데이터 10건 분석에서 `ocr_corrections.raw_text` 에 제3자
--   개인정보(실명 · 개인 휴대폰 · 개인 이메일)가 평문 저장된 사례가
--   확인됐다(inv-057). 현재 `corrections_select` 는 `using (true)` 이므로
--   두 번째 계정이 생기는 순간 전 레코드를 열람할 수 있다.
--
-- 이 파일이 지키는 제약
--   · 기존 schema 수정 없음 — 컬럼 추가/변경/삭제 전무.
--   · 기존 policy 삭제·수정 없음 — `create policy` 추가만.
--   · 기존 데이터 변경 없음 — UPDATE/DELETE 문 전무.
--   · 재실행 안전 — 정책을 조건부로 생성한다.
--
-- 핵심: 왜 `as restrictive` 인가
--   PostgreSQL 의 PERMISSIVE 정책은 같은 커맨드끼리 OR 로 합쳐진다.
--   기존 `using (true)` 옆에 `using (uploaded_by = auth.uid())` 를 그냥
--   추가하면 `true OR (...)` = 항상 참이 되어 아무것도 제한되지 않는다.
--   (로컬 PG16 검증: 정책 추가 후에도 A 사용자가 타인 행 전부 조회 가능)
--   RESTRICTIVE 정책은 AND 로 합쳐지므로, 기존 정책을 건드리지 않고도
--   실제로 범위를 좁힐 수 있다. 이것이 "추가만 하고 수정하지 않는다"는
--   제약과 실제 격리를 동시에 만족시키는 유일한 방법이다.
--
-- legacy NULL 취급
--   `uploaded_by is null` 인 행은 소유자를 알 수 없다. 이를 제외하면
--   과거 데이터가 전원에게 사라지므로, NULL 행은 종전대로 공유한다.
--   (`기존 동작 유지` 제약) 소유자가 기록된 행부터 격리가 적용된다.
--
-- 적용 범위 — ocr_corrections 만
--   invoices · invoice_items · attachments 의 소유권 격리는 이번 배치에서
--   의도적으로 제외했다. 그 세 테이블은 policies.sql 이 명시적으로 공용
--   데이터로 설계한 것이므로("공용 데이터: 로그인 사용자 전원이 동일
--   데이터 read/write. 개인 소유권 없음"), 격리는 보안 수정이 아니라
--   제품 모델 변경이다. 별도 결정이 있을 때 별도 migration 으로 다룬다.
--   누락이 아니라 결정이다.
--
-- 왜 UPDATE/DELETE 정책이 없는가
--   ocr_corrections 는 policies.sql 설계상 INSERT-ONLY 다 — UPDATE·DELETE
--   PERMISSIVE 정책이 애초에 없어 DB 레벨에서 이미 거부된다. 따라서
--   SELECT 하나만 제한하면 격리가 완성된다.
-- ============================================================

-- `uploaded_by` 는 cloudStore.js 의 mirrorSaveOcrCorrection() 이
-- `auth.uid()` 로 채운다. 신뢰할 수 있는 소유자 컬럼이다.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ocr_corrections'
      and policyname = 'corrections_select_own'
  ) then
    create policy corrections_select_own on public.ocr_corrections
      as restrictive for select to authenticated
      using (uploaded_by is null or uploaded_by = auth.uid());
  end if;
end $$;


-- ============================================================
-- 적용 후 확인 쿼리
-- ============================================================
-- select tablename, policyname, cmd, permissive
--   from pg_policies
--  where schemaname = 'public' and tablename = 'ocr_corrections'
--  order by policyname;
--
-- 기대 (3행)
--   corrections_insert      | INSERT | PERMISSIVE
--   corrections_select      | SELECT | PERMISSIVE
--   corrections_select_own  | SELECT | RESTRICTIVE   ← 신규
--
-- 롤백
--   drop policy corrections_select_own on public.ocr_corrections;
