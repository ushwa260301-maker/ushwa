-- ============================================================
-- Species Catalog · Supplier Upsert 정책 수정  (T6 Release Blocker #2)
-- ============================================================
-- 문제
--   rpc.sql 의 supplier upsert 가 기존 행을 갱신하지 못했다.
--     · save_invoice_tx   : 기존 값이 빈 문자열일 때만 채움
--                           → 이미 값이 있으면 전화/주소 수정이 반영 안 됨
--     · update_invoice_tx : on conflict do update set name = suppliers.name
--                           → 자기 자신 대입(no-op). 전화/주소는 대상에도 없음
--
-- 수정
--   두 함수의 on conflict 절만 동일 정책으로 통일한다.
--     "들어온 값이 비어 있지 않으면 갱신, 비어 있으면 기존 값 유지"
--   → 빈 입력이 기존 데이터를 지우는 퇴행을 막으면서 실제 수정은 반영된다.
--
-- 원칙
--   · schema.sql / rpc.sql 직접 수정 없음 — 이 파일만 추가 적용
--   · create or replace function 만 사용 (테이블·데이터 무변경)
--   · 함수 본문의 나머지 로직은 rpc.sql 원본과 동일 (on conflict 절만 상이)
--   · invoices / invoice_items 동작 영향 없음
--
-- 롤백
--   rpc.sql 을 다시 실행하면 이전 정의로 복귀한다 (데이터 영향 없음).
--
-- 적용: Supabase SQL Editor 에서 이 파일 실행 (schema/policies/triggers/rpc
--       적용 이후 시점이면 언제든 가능).
-- ============================================================

-- ------------------------------------------------------------
-- save_invoice_tx — supplier upsert 정책만 변경
-- ------------------------------------------------------------
create or replace function public.save_invoice_tx(
  p_invoice     jsonb,
  p_items       jsonb,
  p_new_species jsonb default '[]'
)
returns jsonb
language plpgsql
as $$
declare
  v_supplier_id uuid;
  v_invoice_id  text;
  v_item        jsonb;
  v_sp          jsonb;
  v_item_id     text;
  v_item_ids    text[] := '{}';
begin
  -- ① supplier upsert (변경분 반영 · 빈 입력은 기존 값 보존)
  insert into public.suppliers (name, norm_name, region, phone, created_by)
  values (
    p_invoice->>'supplier',
    public.fn_norm_supplier_name(p_invoice->>'supplier'),
    coalesce(p_invoice->>'supplierAddress', ''),
    coalesce(p_invoice->>'supplierPhone', ''),
    auth.uid()
  )
  on conflict (norm_name) do update
    set name   = case when coalesce(excluded.name, '')   <> '' then excluded.name   else public.suppliers.name   end,
        region = case when coalesce(excluded.region, '') <> '' then excluded.region else public.suppliers.region end,
        phone  = case when coalesce(excluded.phone, '')  <> '' then excluded.phone  else public.suppliers.phone  end
  returning id into v_supplier_id;

  -- ② invoice insert
  v_invoice_id := coalesce(nullif(p_invoice->>'id', ''), public.fn_gen_id('inv-'));
  insert into public.invoices
    (id, invoice_date, invoice_number, supplier_id,
     supplier, supplier_phone, supplier_address, uploaded_by)
  values
    (v_invoice_id,
     (p_invoice->>'invoiceDate')::date,
     coalesce(p_invoice->>'invoiceNumber', ''),
     v_supplier_id,
     p_invoice->>'supplier',
     coalesce(p_invoice->>'supplierPhone', ''),
     coalesce(p_invoice->>'supplierAddress', ''),
     auth.uid());

  -- ③ items insert (spec 은 nullable — 규격 Optional 계약)
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_item_id := coalesce(nullif(v_item->>'id', ''), public.fn_gen_id('item-'));
    insert into public.invoice_items
      (id, invoice_id, species_id, species_name, spec, unit,
       quantity, unit_price, amount)
    values
      (v_item_id,
       v_invoice_id,
       nullif(v_item->>'speciesId', ''),
       v_item->>'speciesName',
       nullif(v_item->>'spec', ''),
       coalesce(v_item->>'unit', '주'),
       coalesce((v_item->>'quantity')::numeric, 1),
       coalesce((v_item->>'unitPrice')::numeric, 0),
       coalesce((v_item->>'amount')::numeric, 0));
    v_item_ids := array_append(v_item_ids, v_item_id);
  end loop;

  -- ④ 신규 species upsert (id 충돌 시 무시 — 이미 있으면 신뢰)
  for v_sp in select * from jsonb_array_elements(p_new_species)
  loop
    insert into public.species
      (id, name, latin, category, bloom_months, colors, suppliers, notes, created_by)
    values
      (v_sp->>'id',
       v_sp->>'name',
       coalesce(v_sp->>'latin', ''),
       coalesce(v_sp->>'category', ''),
       coalesce((select array_agg(x::int) from jsonb_array_elements_text(v_sp->'bloomMonths') x), '{}'),
       coalesce((select array_agg(x) from jsonb_array_elements_text(v_sp->'colors') x), '{}'),
       coalesce(v_sp->'suppliers', '[]'::jsonb),
       coalesce(v_sp->>'notes', ''),
       auth.uid())
    on conflict (id) do nothing;
  end loop;

  -- ⑤ 함수 정상 종료 = COMMIT (예외 발생 시 전체 자동 롤백)
  return jsonb_build_object(
    'invoiceId',  v_invoice_id,
    'supplierId', v_supplier_id,
    'itemIds',    to_jsonb(v_item_ids)
  );
end;
$$;

-- ------------------------------------------------------------
-- update_invoice_tx — supplier upsert 정책만 변경
-- ------------------------------------------------------------
create or replace function public.update_invoice_tx(
  p_invoice_id       text,
  p_expected_version int,
  p_invoice          jsonb,
  p_items            jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_supplier_id uuid;
  v_item        jsonb;
  v_item_id     text;
  v_new_version int;
begin
  -- ① 낙관적 잠금: 기대 version 과 일치하는 행만 잠금
  perform 1 from public.invoices
   where id = p_invoice_id and version = p_expected_version
   for update;
  if not found then
    raise exception 'VERSION_CONFLICT: invoice % (expected v%)',
      p_invoice_id, p_expected_version
      using errcode = '40001';
  end if;

  -- ② supplier upsert (변경분 반영 · 빈 입력은 기존 값 보존)
  insert into public.suppliers (name, norm_name, region, phone, created_by)
  values (
    p_invoice->>'supplier',
    public.fn_norm_supplier_name(p_invoice->>'supplier'),
    coalesce(p_invoice->>'supplierAddress', ''),
    coalesce(p_invoice->>'supplierPhone', ''),
    auth.uid()
  )
  on conflict (norm_name) do update
    set name   = case when coalesce(excluded.name, '')   <> '' then excluded.name   else public.suppliers.name   end,
        region = case when coalesce(excluded.region, '') <> '' then excluded.region else public.suppliers.region end,
        phone  = case when coalesce(excluded.phone, '')  <> '' then excluded.phone  else public.suppliers.phone  end
  returning id into v_supplier_id;

  -- ③ invoice update (trg_touch_invoices 가 version+1 · updated_at 자동)
  update public.invoices
     set invoice_date     = (p_invoice->>'invoiceDate')::date,
         invoice_number   = coalesce(p_invoice->>'invoiceNumber', ''),
         supplier_id      = v_supplier_id,
         supplier         = p_invoice->>'supplier',
         supplier_phone   = coalesce(p_invoice->>'supplierPhone', ''),
         supplier_address = coalesce(p_invoice->>'supplierAddress', '')
   where id = p_invoice_id
   returning version into v_new_version;

  -- ④ items 전체 교체
  delete from public.invoice_items where invoice_id = p_invoice_id;
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_item_id := coalesce(nullif(v_item->>'id', ''), public.fn_gen_id('item-'));
    insert into public.invoice_items
      (id, invoice_id, species_id, species_name, spec, unit,
       quantity, unit_price, amount)
    values
      (v_item_id, p_invoice_id,
       nullif(v_item->>'speciesId', ''),
       v_item->>'speciesName',
       nullif(v_item->>'spec', ''),
       coalesce(v_item->>'unit', '주'),
       coalesce((v_item->>'quantity')::numeric, 1),
       coalesce((v_item->>'unitPrice')::numeric, 0),
       coalesce((v_item->>'amount')::numeric, 0));
  end loop;

  return jsonb_build_object('invoiceId', p_invoice_id, 'version', v_new_version);
end;
$$;

-- ------------------------------------------------------------
-- 실행 권한 — rpc.sql 과 동일 정책 유지 (로그인 사용자만)
-- ------------------------------------------------------------
revoke all on function public.save_invoice_tx(jsonb, jsonb, jsonb)       from public, anon;
revoke all on function public.update_invoice_tx(text, int, jsonb, jsonb) from public, anon;

grant execute on function public.save_invoice_tx(jsonb, jsonb, jsonb)       to authenticated;
grant execute on function public.update_invoice_tx(text, int, jsonb, jsonb) to authenticated;
