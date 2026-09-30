-- =====================================================================
-- 2026-09-28 · 저장된 OCR 개인정보(계좌번호·전화번호·예금주) 제거 — 1/3 PREVIEW (읽기 전용)
-- =====================================================================
--
-- 세 파일을 **순서대로, 한 번에 하나씩** Supabase SQL Editor 에서 실행한다.
--   1_preview.sql   읽기 전용. 제거 대상 건수 + 보존 지문.
--   2_cleanup.sql   단일 트랜잭션. 자기 검증에 실패하면 전체 롤백.
--   3_verify.sql    읽기 전용. 1 과 같은 쿼리 — 전후를 독립적으로 비교한다.
-- 파일을 나눈 이유: SQL Editor 는 편집기 내용 전체를 실행한다. 한 파일에
-- PREVIEW 와 UPDATE 가 함께 있으면 한 번의 클릭으로 둘 다 실행된다.
--
-- 출력은 **건수와 해시뿐**이다. 개인정보 값은 출력하지 않는다 —
-- 결과를 그대로 복사해 공유해도 된다.
--
-- 정본 규칙: js/sanitize.js · OCR_DATA_POLICY.md 원칙 5 · VISION.md §7
-- 1·3 의 판정/지문 쿼리는 2 의 자기 검증과 **같은 텍스트**다 (한 템플릿에서 생성).
-- =====================================================================

-- 결과 A — 제거 대상. 정리 후 모두 0 이 되어야 한다.
with t as (
  select concat_ws(E'\n', raw_text, normalized_text,
                   (select string_agg(x #>> '{}', E'\n')
                      from jsonb_path_query(debug_meta, 'strict $.** ? (@.type() == "string")') as q(x)
                     where left(x #>> '{}', 5) <> 'data:')) as txt,
         parsed_fields, user_edited_fields, debug_meta
    from public.ocr_corrections
)
select 'T1 invoices.supplier_phone' as target, count(*)::bigint as n
  from public.invoices  where coalesce(supplier_phone, '') <> ''
union all
select 'T2 suppliers.phone', count(*)
  from public.suppliers where coalesce(phone, '') <> ''
union all
select 'T3 ocr_corrections 개인정보 행', count(*) from t
 where exists (select 1
                   from jsonb_path_query(coalesce(parsed_fields, '{}') || jsonb_build_object('_u', user_edited_fields)
                                         || jsonb_build_object('_d', debug_meta),
                                         'strict $.** ? (@.type() == "object")') as o(v)
                  where coalesce(v ->> 'contact', '') <> '' or coalesce(v ->> 'supplierPhone', '') <> ''
                     or coalesce(v ->> 'phone', '') <> '')
      or txt ~ '(?<![0-9-])(?:\(0[0-9]{1,2}\)\s?|0[0-9]{1,2}[-.]?)[0-9]{3,4}[-.]?[0-9]{4}(?![0-9-])'
      or txt ~ '(?:예\s*금\s*주|수\s*취\s*인)\s*[:：]?\s*[가-힣]{2,4}'
      or txt ~ '(?:계\s*좌|예\s*금(?!\s*주))[^\n:：0-9]{0,10}[:：]?[ \t]*[0-9][0-9 \t-]{8,}'
      or exists (select 1
                   from regexp_matches(txt, '(?<![0-9-])[0-9]{2,6}(?:-[0-9]{2,6}){2,3}(?![0-9-])', 'g') as m(a)
                  where a[1] !~ '^[0-9]{3}-[0-9]{2}-[0-9]{5}$'
                    and length(regexp_replace(a[1], '[^0-9]', '', 'g')) between 10 and 16)
union all
select 'T4 audit_log invoices.supplier_phone', count(*)
  from public.audit_log
 where table_name = 'invoices'
   and (coalesce(old_data ->> 'supplier_phone', '') <> '' or coalesce(new_data ->> 'supplier_phone', '') <> '')
union all
select 'T5 audit_log suppliers.phone', count(*)
  from public.audit_log
 where table_name = 'suppliers'
   and (coalesce(old_data ->> 'phone', '') <> '' or coalesce(new_data ->> 'phone', '') <> '');

-- 결과 B — 보존 지문. 3_verify 의 결과 B 와 **모든 행이 같아야** 한다.
-- 기록해 둔다 (복사해 보관).
with t as (
  select concat_ws(E'\n', raw_text, normalized_text,
                   (select string_agg(x #>> '{}', E'\n')
                      from jsonb_path_query(debug_meta, 'strict $.** ? (@.type() == "string")') as q(x)
                     where left(x #>> '{}', 5) <> 'data:')) as txt
    from public.ocr_corrections
)
select 'F01 rows invoices' as metric, count(*)::text as v from public.invoices
union all select 'F02 rows invoice_items',   count(*)::text from public.invoice_items
union all select 'F03 rows species',         count(*)::text from public.species
union all select 'F04 rows suppliers',       count(*)::text from public.suppliers
union all select 'F05 rows ocr_corrections', count(*)::text from public.ocr_corrections
union all select 'F06 rows audit_log',       count(*)::text from public.audit_log
union all select 'F07 rows attachments',     count(*)::text from public.attachments
union all select 'F08 hash invoices (전화 제외 · version · updated_at 포함)',
  coalesce(md5(string_agg(concat_ws('|', id, invoice_date, supplier, invoice_number, supplier_address,
                                    version, updated_at), E'\n' order by id)), '-')
  from public.invoices
union all select 'F09 hash invoice_items',
  coalesce(md5(string_agg(to_jsonb(i)::text, E'\n' order by i.id)), '-') from public.invoice_items i
union all select 'F10 hash species (판매자 프로필 포함 · 무변경 대상)',
  coalesce(md5(string_agg(to_jsonb(s)::text, E'\n' order by s.id)), '-') from public.species s
union all select 'F11 hash suppliers (전화 제외)',
  coalesce(md5(string_agg(concat_ws('|', id, name, norm_name, region), E'\n' order by id)), '-')
  from public.suppliers
union all select 'F12 hash ocr_corrections 거래 필드',
  coalesce(md5(string_agg(concat_ws('|', id, invoice_id, version, engine_version, uploaded_by, created_at,
        parsed_fields -> 'rows', parsed_fields ->> 'invoiceDate', parsed_fields ->> 'invoiceNumber',
        parsed_fields #>> '{supplier,name}', parsed_fields #>> '{supplier,region}',
        user_edited_fields -> 'items', (user_edited_fields -> 'header') - 'supplierPhone'),
      E'\n' order by id)), '-')
  from public.ocr_corrections
union all select 'F13 hash debug_meta 수치 (model · confidence · passes)',
  coalesce(md5(string_agg(concat_ws('|', id, debug_meta ->> 'model', debug_meta ->> 'confidence',
        debug_meta #> '{raw,passes}', debug_meta #>> '{raw,tesseractConfidence}'), E'\n' order by id)), '-')
  from public.ocr_corrections
union all select 'F14 hash audit_log (전화 키 제외)',
  coalesce(md5(string_agg(concat_ws('|', id, table_name, row_id, action, changed_by, changed_at,
        old_data - 'supplier_phone' - 'phone', new_data - 'supplier_phone' - 'phone'), E'\n' order by id)), '-')
  from public.audit_log
union all select 'F15 text 날짜 개수',
  count(*)::text from t, regexp_matches(t.txt, '(?<![0-9])[0-9]{4}[-./][0-9]{1,2}[-./][0-9]{1,2}(?![0-9])', 'g')
union all select 'F16 text 금액(천단위) 개수',
  count(*)::text from t, regexp_matches(t.txt, '(?<![0-9,])[0-9]{1,3}(?:,[0-9]{3})+(?![0-9])', 'g')
union all select 'F17 text 사업자번호 개수',
  count(*)::text from t, regexp_matches(t.txt, '(?<![0-9-])[0-9]{3}-[0-9]{2}-[0-9]{5}(?![0-9-])', 'g')
union all select 'F18 null 컬럼 (parsed · edited · debug)',
  concat_ws('/', count(*) filter (where parsed_fields is null), count(*) filter (where user_edited_fields is null),
            count(*) filter (where debug_meta is null))
  from public.ocr_corrections;
