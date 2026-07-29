-- ============================================================
-- Species Catalog · Attachment Storage  (T8)
-- ============================================================
-- 거래명세서 원본(JPG/PNG/PDF)이 올라가는 Storage 버킷과 접근 정책.
-- schema.sql 은 수정하지 않는다 — 이 파일만 추가 적용한다.
--
-- 정책 원칙 (기존 policies.sql 과 동일)
--   · 로그인 사용자(authenticated)만 접근. 익명(anon)은 정책 없음 = 차단.
--   · 공용 데이터 — 업로더별 격리 없음.
--   · 비공개 버킷: 조회는 SDK 세션을 통해서만 (public URL 없음).
--
-- 경로 규칙 (cloudStore.js buildStoragePath 와 일치):
--   <invoiceId>/<attachmentId>.<ext>      예) inv-001/att-a92fd3.jpg
--   사용자 파일명은 경로에 넣지 않는다 — attachments.filename 컬럼에만 보관.
--
-- 적용 방법: Supabase SQL Editor 에서 이 파일을 실행.
--   (대시보드 Storage 화면에서 버킷을 직접 만들어도 결과는 동일하다)
-- ============================================================

-- ------------------------------------------------------------
-- 1. 버킷 생성 — 비공개(public=false). 이미 있으면 아무것도 하지 않음.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 2. RLS 정책 — storage.objects 의 attachments 버킷 한정.
--    UPDATE 정책은 만들지 않는다(첨부 원본은 교체 대상이 아님 ·
--    교체가 필요하면 삭제 후 재업로드).
-- ------------------------------------------------------------
drop policy if exists attachments_objects_select on storage.objects;
create policy attachments_objects_select on storage.objects
  for select to authenticated using (bucket_id = 'attachments');

drop policy if exists attachments_objects_insert on storage.objects;
create policy attachments_objects_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'attachments');

drop policy if exists attachments_objects_delete on storage.objects;
create policy attachments_objects_delete on storage.objects
  for delete to authenticated using (bucket_id = 'attachments');
