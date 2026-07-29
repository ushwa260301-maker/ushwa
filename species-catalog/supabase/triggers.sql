-- ============================================================
-- Species Catalog · Triggers  (T1)
-- ============================================================
--   1. updated_at 자동 갱신 + version 자동 증가 (species · invoices)
--      — 클라이언트가 잊어도 DB 가 보장. version 은 낙관적 잠금의 기준.
--   2. audit_log 자동 기록 (INSERT/UPDATE/DELETE 전부)
--      — SECURITY DEFINER: audit_log 에는 애플리케이션 INSERT 정책이
--        없으므로(정책 부재=거부) 함수 소유자 권한으로 RLS 를 우회해
--        기록한다. 코드 0줄로 "모든 변경 이력" 계약을 충족.
-- ============================================================

-- ------------------------------------------------------------
-- 1. updated_at + version
-- ------------------------------------------------------------
create or replace function public.fn_touch_row()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  -- version 컬럼이 있는 테이블(species/invoices)에서만 호출되도록
  -- 트리거를 개별 부착하므로 무조건 증가시켜도 안전.
  new.version := coalesce(old.version, 0) + 1;
  return new;
end;
$$;

drop trigger if exists trg_touch_species on public.species;
create trigger trg_touch_species
  before update on public.species
  for each row execute function public.fn_touch_row();

drop trigger if exists trg_touch_invoices on public.invoices;
create trigger trg_touch_invoices
  before update on public.invoices
  for each row execute function public.fn_touch_row();

-- ------------------------------------------------------------
-- 2. audit_log 자동 기록
-- ------------------------------------------------------------
create or replace function public.fn_audit()
returns trigger
language plpgsql
security definer               -- audit_log RLS 우회 (기록 전용)
set search_path = public
as $$
declare
  v_row_id text;
begin
  if tg_op = 'DELETE' then
    v_row_id := old.id::text;
    insert into public.audit_log (table_name, row_id, action, old_data, new_data, changed_by)
    values (tg_table_name, v_row_id, tg_op, to_jsonb(old), null, auth.uid());
    return old;
  elsif tg_op = 'UPDATE' then
    v_row_id := new.id::text;
    insert into public.audit_log (table_name, row_id, action, old_data, new_data, changed_by)
    values (tg_table_name, v_row_id, tg_op, to_jsonb(old), to_jsonb(new), auth.uid());
    return new;
  else -- INSERT
    v_row_id := new.id::text;
    insert into public.audit_log (table_name, row_id, action, old_data, new_data, changed_by)
    values (tg_table_name, v_row_id, tg_op, null, to_jsonb(new), auth.uid());
    return new;
  end if;
end;
$$;

-- 감사 대상: 변경 가능한 공용 테이블 5종.
-- ocr_corrections / fixtures 는 INSERT-ONLY 라 행 자체가 이력이므로
-- audit 중복 기록하지 않는다 (저장 공간 절약 · 이력의 진실 일원화).
drop trigger if exists trg_audit_species on public.species;
create trigger trg_audit_species
  after insert or update or delete on public.species
  for each row execute function public.fn_audit();

drop trigger if exists trg_audit_suppliers on public.suppliers;
create trigger trg_audit_suppliers
  after insert or update or delete on public.suppliers
  for each row execute function public.fn_audit();

drop trigger if exists trg_audit_invoices on public.invoices;
create trigger trg_audit_invoices
  after insert or update or delete on public.invoices
  for each row execute function public.fn_audit();

drop trigger if exists trg_audit_items on public.invoice_items;
create trigger trg_audit_items
  after insert or update or delete on public.invoice_items
  for each row execute function public.fn_audit();

drop trigger if exists trg_audit_attachments on public.attachments;
create trigger trg_audit_attachments
  after insert or update or delete on public.attachments
  for each row execute function public.fn_audit();
