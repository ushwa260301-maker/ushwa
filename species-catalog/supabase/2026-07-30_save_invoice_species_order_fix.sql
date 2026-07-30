-- ============================================================
-- Species Catalog · save_invoice_tx 실행 순서 교정
-- (Production Blocker — 2026-07-30 실환경에서 발견)
-- ============================================================
-- 증상
--   신규 수종이 포함된 거래를 등록하면 Cloud 저장이 실패한다.
--     POST /rest/v1/rpc/save_invoice_tx → 409
--     insert or update on table "invoice_items"
--       violates foreign key constraint "invoice_items_species_id_fkey"
--
--   invoice 가 Cloud 에 생성되지 않으므로 후속 미러도 연쇄 실패한다:
--     attachments_invoice_id_fkey · ocr_corrections_invoice_id_fkey
--
-- 원인
--   함수가 items 를 species 보다 먼저 넣는다.
--     ① supplier upsert
--     ② invoice insert
--     ③ invoice_items insert   ← species_id 가 아직 없는 행을 참조
--     ④ species upsert         ← 너무 늦다
--
--   schema.sql:95 `species_id text references public.species (id)` 는
--   NOT DEFERRABLE(기본값)이라 ③ 시점에 즉시 검사되고, 함수 전체가
--   롤백되어 ④ 에 도달하지 못한다.
--
-- 수정
--   species upsert 를 items insert **앞으로** 옮긴다. 로직은 한 줄도
--   바꾸지 않고 두 블록의 순서만 교환한다.
--     ① supplier upsert
--     ② invoice insert
--     ③ species upsert   ← 이동
--     ④ items insert     ← 이동
--
-- 왜 update_invoice_tx 는 건드리지 않는가
--   같은 순서 문제를 갖고 있지만 도달하지 않는다 — cloudStore.js 의
--   mirrorUpdateInvoice 가 RPC 호출 전에 클라이언트에서 species 를
--   선-upsert 하기 때문이다(`from("species").upsert(..., ignoreDuplicates)`).
--   동작하는 함수를 추측으로 고치지 않는다. 다만 이는 **클라이언트가
--   선-upsert 한다는 전제에 의존**하는 구조이므로, 향후 다른 호출자가
--   생기면 같은 오류가 재발할 수 있다 — `[확인 필요]` 로 남긴다.
--
-- 원칙
--   · schema.sql / policies.sql / triggers.sql / rpc.sql 무수정
--   · create or replace function 만 사용 — 테이블·데이터 무변경
--   · supplier on conflict 절은 2026-07-27_supplier_upsert_fix.sql 의
--     정책을 그대로 유지한다 (그 수정을 되돌리지 않는다)
--   · 시그니처 동일 → 클라이언트 무수정
--
-- 롤백
--   2026-07-27_supplier_upsert_fix.sql 을 다시 실행하면 이전 정의로
--   복귀한다 (결함도 함께 복귀). 데이터 영향 없음.
--
-- 적용: Supabase SQL Editor 에서 이 파일 실행.
-- ============================================================

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

  -- ③ species upsert — items 보다 **먼저** 수행한다.
  --    invoice_items.species_id 가 이 행들을 참조하므로 순서가 뒤바뀌면
  --    FK 위반으로 트랜잭션 전체가 롤백된다 (이 파일이 고치는 결함).
  --    id 충돌 시 무시 — 이미 있으면 기존 행을 신뢰한다.
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

  -- ④ items insert (spec 은 nullable — 규격 Optional 계약)
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

  -- ⑤ 함수 정상 종료 = COMMIT (예외 발생 시 전체 자동 롤백)
  return jsonb_build_object(
    'invoiceId',  v_invoice_id,
    'supplierId', v_supplier_id,
    'itemIds',    to_jsonb(v_item_ids)
  );
end;
$$;

-- ------------------------------------------------------------
-- 실행 권한 — rpc.sql 과 동일 정책 유지 (로그인 사용자만)
-- create or replace 는 ACL 을 보존하지만, 재적용 순서에 무관하게
-- 동일 상태가 되도록 명시한다.
-- ------------------------------------------------------------
revoke all on function public.save_invoice_tx(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_invoice_tx(jsonb, jsonb, jsonb) to authenticated;
