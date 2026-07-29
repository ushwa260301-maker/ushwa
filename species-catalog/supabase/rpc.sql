-- ============================================================
-- Species Catalog · Transaction RPCs  (T1)
-- ============================================================
-- Postgres 함수 본문은 단일 트랜잭션 — 중간 실패 시 전체 롤백되어
-- 고아 레코드(헤더 없는 품목 · 품목 없는 헤더)가 원천 차단된다.
--
--   save_invoice_tx    supplier upsert → invoice insert
--                      → invoice_items insert → species upsert → commit
--   update_invoice_tx  version 낙관적 잠금 → invoice update → items 교체
--   delete_invoice_tx  items/attachments 메타 → invoice 삭제
--                      (ocr_corrections 는 on delete set null 로 보존 —
--                       OCR 학습 데이터는 영구 누적)
--
-- SECURITY INVOKER (기본값) — 호출자의 RLS 가 그대로 적용되므로
-- 함수가 권한 우회 통로가 되지 않는다.
-- ============================================================

-- ------------------------------------------------------------
-- 거래처명 정규화 — norm_name UNIQUE 의 기준.
-- 소문자화 + 공백 제거만 수행. 법인 마커 등 의미 변형은 하지 않는다
-- (over-normalization 은 서로 다른 업체를 합칠 위험 — 보수적으로).
-- ------------------------------------------------------------
create or replace function public.fn_norm_supplier_name(p_name text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(coalesce(p_name, ''), '\s+', '', 'g'));
$$;

-- ------------------------------------------------------------
-- ID 생성 — 기존 접두 관례(inv-/item-)를 유지한 uuid 기반 텍스트.
-- 클라이언트 생성 ID 와 충돌하지 않도록 충분히 김.
-- ------------------------------------------------------------
create or replace function public.fn_gen_id(p_prefix text)
returns text
language sql
volatile
as $$
  select p_prefix || replace(gen_random_uuid()::text, '-', '');
$$;

-- ------------------------------------------------------------
-- save_invoice_tx
-- ------------------------------------------------------------
-- p_invoice  { id?, invoiceDate, invoiceNumber, supplier,
--              supplierPhone, supplierAddress }
-- p_items    [ { id?, speciesId?, speciesName, spec?, unit,
--                quantity, unitPrice, amount } ]
-- p_new_species [ { id, name, latin?, category?, bloomMonths?,
--                   colors?, suppliers?, notes? } ]   -- upsert 목록
--
-- 반환: { invoiceId, supplierId, itemIds[] }
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
  -- ① supplier upsert (norm_name 충돌 시 기존 행 재사용 · 빈 필드 보충)
  insert into public.suppliers (name, norm_name, region, phone, created_by)
  values (
    p_invoice->>'supplier',
    public.fn_norm_supplier_name(p_invoice->>'supplier'),
    coalesce(p_invoice->>'supplierAddress', ''),
    coalesce(p_invoice->>'supplierPhone', ''),
    auth.uid()
  )
  on conflict (norm_name) do update
    set region = case when public.suppliers.region = '' then excluded.region else public.suppliers.region end,
        phone  = case when public.suppliers.phone  = '' then excluded.phone  else public.suppliers.phone  end
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
-- update_invoice_tx — 낙관적 잠금 (version 불일치 → 예외)
-- items 교체 전략: 전체 delete 후 insert.
--   근거: 품목 수가 소수(<20)라 차분 diff 의 복잡성이 이득보다 큼.
--   audit 트리거가 old/new 를 남기므로 이력도 보존됨.
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

  -- ② supplier upsert (변경됐을 수 있음)
  insert into public.suppliers (name, norm_name, region, phone, created_by)
  values (
    p_invoice->>'supplier',
    public.fn_norm_supplier_name(p_invoice->>'supplier'),
    coalesce(p_invoice->>'supplierAddress', ''),
    coalesce(p_invoice->>'supplierPhone', ''),
    auth.uid()
  )
  on conflict (norm_name) do update set name = public.suppliers.name
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
-- delete_invoice_tx — invoice + items + attachments 메타 삭제.
--   · invoice_items / attachments 는 FK on delete cascade 로 함께 삭제
--   · ocr_corrections 는 on delete set null — OCR 학습 데이터 보존
--   · Storage 의 실제 파일 삭제는 클라이언트/후속 배치 책임
--     (메타를 먼저 지워도 고아 파일은 주기 청소 가능 — 반대보다 안전)
-- ------------------------------------------------------------
create or replace function public.delete_invoice_tx(p_invoice_id text)
returns jsonb
language plpgsql
as $$
declare
  v_deleted int;
begin
  delete from public.invoices where id = p_invoice_id;
  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'NOT_FOUND: invoice %', p_invoice_id
      using errcode = 'P0002';
  end if;
  return jsonb_build_object('invoiceId', p_invoice_id, 'deleted', true);
end;
$$;

-- ------------------------------------------------------------
-- 실행 권한 — 로그인 사용자만. anon 은 호출 불가.
-- ------------------------------------------------------------
revoke all on function public.save_invoice_tx(jsonb, jsonb, jsonb)      from public, anon;
revoke all on function public.update_invoice_tx(text, int, jsonb, jsonb) from public, anon;
revoke all on function public.delete_invoice_tx(text)                    from public, anon;

grant execute on function public.save_invoice_tx(jsonb, jsonb, jsonb)       to authenticated;
grant execute on function public.update_invoice_tx(text, int, jsonb, jsonb) to authenticated;
grant execute on function public.delete_invoice_tx(text)                    to authenticated;
