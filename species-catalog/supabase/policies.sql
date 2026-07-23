-- ============================================================
-- Species Catalog · Row Level Security  (T1)
-- ============================================================
-- 정책 원칙
--   · Google 로그인(authenticated) 사용자만 접근. 익명(anon) 전면 차단.
--     — 정책이 하나도 없는 role 은 기본 거부이므로 anon 에는 아무
--       정책도 만들지 않는 것 자체가 차단이다.
--   · 공용 데이터: 로그인 사용자 전원이 동일 데이터 read/write.
--     개인 소유권 없음 — WHERE created_by = auth.uid() 같은 필터 없음.
--   · INSERT-ONLY 강제: ocr_corrections / fixtures 는 UPDATE·DELETE
--     정책을 만들지 않는다 (정책 부재 = 거부 → 계약 "Fixture 절대
--     삭제·수정 금지" 를 DB 레벨에서 강제).
--   · audit_log: 직접 수정 금지 — SELECT 만. 기록은 triggers.sql 의
--     SECURITY DEFINER 함수가 RLS 를 우회해 수행.
-- ============================================================

alter table public.users           enable row level security;
alter table public.suppliers       enable row level security;
alter table public.species         enable row level security;
alter table public.invoices        enable row level security;
alter table public.invoice_items   enable row level security;
alter table public.attachments     enable row level security;
alter table public.ocr_corrections enable row level security;
alter table public.fixtures        enable row level security;
alter table public.audit_log       enable row level security;

-- ------------------------------------------------------------
-- users — 전원 조회 가능(공용 attribution 표시용) · 자기 행만 쓰기
-- ------------------------------------------------------------
create policy users_select on public.users
  for select to authenticated using (true);
create policy users_insert_self on public.users
  for insert to authenticated with check (id = auth.uid());
create policy users_update_self on public.users
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
-- DELETE 정책 없음 → 삭제 불가

-- ------------------------------------------------------------
-- 공용 CRUD 4종 — species · suppliers · invoices · invoice_items
-- (+ attachments 메타) : 로그인 사용자 전원 read/write
-- ------------------------------------------------------------
create policy species_select on public.species
  for select to authenticated using (true);
create policy species_insert on public.species
  for insert to authenticated with check (true);
create policy species_update on public.species
  for update to authenticated using (true) with check (true);
create policy species_delete on public.species
  for delete to authenticated using (true);

create policy suppliers_select on public.suppliers
  for select to authenticated using (true);
create policy suppliers_insert on public.suppliers
  for insert to authenticated with check (true);
create policy suppliers_update on public.suppliers
  for update to authenticated using (true) with check (true);
-- suppliers DELETE 정책 없음 — 거래처는 invoices 가 참조하므로 삭제 금지
-- (중복 병합은 향후 admin RPC 로)

create policy invoices_select on public.invoices
  for select to authenticated using (true);
create policy invoices_insert on public.invoices
  for insert to authenticated with check (true);
create policy invoices_update on public.invoices
  for update to authenticated using (true) with check (true);
create policy invoices_delete on public.invoices
  for delete to authenticated using (true);

create policy items_select on public.invoice_items
  for select to authenticated using (true);
create policy items_insert on public.invoice_items
  for insert to authenticated with check (true);
create policy items_update on public.invoice_items
  for update to authenticated using (true) with check (true);
create policy items_delete on public.invoice_items
  for delete to authenticated using (true);

create policy attachments_select on public.attachments
  for select to authenticated using (true);
create policy attachments_insert on public.attachments
  for insert to authenticated with check (true);
create policy attachments_delete on public.attachments
  for delete to authenticated using (true);
-- attachments UPDATE 정책 없음 — 메타는 불변 (교체 = 삭제 후 재업로드)

-- ------------------------------------------------------------
-- ocr_corrections — INSERT-ONLY (OCR 학습 데이터 영구 누적)
-- ------------------------------------------------------------
create policy corrections_select on public.ocr_corrections
  for select to authenticated using (true);
create policy corrections_insert on public.ocr_corrections
  for insert to authenticated with check (true);
-- UPDATE / DELETE 정책 없음 → DB 레벨 거부

-- ------------------------------------------------------------
-- fixtures — INSERT-ONLY ("Fixture 절대 삭제·수정 금지" DB 강제)
-- ------------------------------------------------------------
create policy fixtures_select on public.fixtures
  for select to authenticated using (true);
create policy fixtures_insert on public.fixtures
  for insert to authenticated with check (true);
-- UPDATE / DELETE 정책 없음 → DB 레벨 거부

-- ------------------------------------------------------------
-- audit_log — 조회만. 기록은 트리거(SECURITY DEFINER)가 수행.
-- ------------------------------------------------------------
create policy audit_select on public.audit_log
  for select to authenticated using (true);
-- INSERT / UPDATE / DELETE 정책 없음 → 애플리케이션 직접 쓰기 불가
