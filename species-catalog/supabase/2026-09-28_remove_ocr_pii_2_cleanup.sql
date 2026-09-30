-- =====================================================================
-- 2026-09-28 · 저장된 OCR 개인정보(계좌번호·전화번호·예금주) 제거 — 2/3 CLEANUP (단일 트랜잭션 · 자기 검증)
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

-- 대상 (코드 기준으로 확인한 저장 경로 전부)
--   invoices.supplier_phone · suppliers.phone               → ''
--   ocr_corrections.raw_text / normalized_text              → 개인정보만 토큰 치환
--   ocr_corrections.debug_meta 전체                         → 재귀 정제 (원문 · 저신뢰 줄 등)
--   ocr_corrections.parsed_fields · user_edited_fields      → 모든 위치의 연락처 키 ''
--   audit_log (invoices · suppliers 기록 안의 전화)          → '' (행 · 이벤트는 보존)
-- 대상이 아닌 것
--   species.suppliers[].contact — 사용자 등록 판매자 프로필일 수 있다 (긴급 조치 §6).
--   attachments(원본 이미지) — 이미지 안의 글자는 SQL 로 지울 수 없다.
--
-- 왜 트리거를 끄는가
--   fn_audit() 는 UPDATE 마다 to_jsonb(old) 를 audit_log 에 복사한다. 끄지 않으면
--   **지운 값이 audit_log 에 새로 남는다** (로컬 재현으로 확인). fn_touch_row() 는
--   version 을 올려 캐시된 version 을 든 클라이언트의 다음 저장을 충돌시킨다.
--   비활성화는 이 트랜잭션 안에서만 유효하다 — 실패하면 원상태로 롤백된다.
--
-- 자기 검증 (커밋 전)
--   정리 전후 보존 지문(F01~F18)이 하나라도 다르거나, 제거 대상(T1~T5)이 0 이
--   아니면 RAISE EXCEPTION → 트랜잭션 전체 롤백. 커밋된 정리는 되돌릴 수
--   없으므로, 검증은 커밋 **전에** 한다. 오류 메시지에 어긋난 항목 이름이 나온다.

begin;

create or replace function pg_temp.sanitize_ocr_text(t text)
returns text language plpgsql immutable as $fn$
declare
  v   text := t;
  m   text[];
  tok text;
  nd  int;
begin
  if v is null or v = '' then return v; end if;

  -- 전화 (구분자로 공백 불허 — 금액 나열 오탐 방지 · vision.js:65-76)
  v := regexp_replace(v,
         '(?<![0-9-])(?:\(0[0-9]{1,2}\)\s?|0[0-9]{1,2}[-.]?)[0-9]{3,4}[-.]?[0-9]{4}(?![0-9-])',
         '[PHONE]', 'g');

  -- 라벨 뒤 계좌. 채움 구간 숫자 제외(앞자리 노출 방지) · 줄을 넘지 않음 ·
  -- '예금주' 는 계좌 라벨이 아님. 토큰에 한국어 라벨 단어를 넣지 않는다 —
  -- 넣으면 재실행 시 토큰이 라벨로 읽혀 날짜를 삼킨다 (js/sanitize.js PII_MASK 참조).
  v := regexp_replace(v,
         '((?:계\s*좌|예\s*금(?!\s*주))[^\n:：0-9]{0,10}[:：]?[ \t]*)[0-9][0-9 \t-]{8,}',
         '\1[ACCOUNT]', 'g');

  -- 하이픈 계좌 후보: 10~16자리 · 사업자등록번호(3-2-5) 제외 · 날짜(8자리)는 자릿수로 제외
  for m in select regexp_matches(v, '(?<![0-9-])[0-9]{2,6}(?:-[0-9]{2,6}){2,3}(?![0-9-])', 'g') loop
    tok := m[1];
    nd  := length(regexp_replace(tok, '[^0-9]', '', 'g'));
    if tok !~ '^[0-9]{3}-[0-9]{2}-[0-9]{5}$' and nd between 10 and 16 then
      v := replace(v, tok, '[ACCOUNT]');
    end if;
  end loop;

  -- 예금주 이름 (라벨은 남긴다)
  v := regexp_replace(v,
         '((?:예\s*금\s*주|수\s*취\s*인)\s*[:：]?\s*)[가-힣]{2,4}',
         '\1[HOLDER]', 'g');

  return v;
end
$fn$;

create or replace function pg_temp.sanitize_jsonb(j jsonb, scrub boolean)
returns jsonb language plpgsql immutable as $fn$
declare
  r jsonb;
  k text;
  v jsonb;
begin
  if j is null then return null; end if;
  case jsonb_typeof(j)
    when 'object' then
      r := '{}'::jsonb;
      for k, v in select key, value from jsonb_each(j) loop
        if k in ('contact', 'supplierPhone', 'phone') and jsonb_typeof(v) in ('string', 'null') then
          r := r || jsonb_build_object(k, '');
        else
          r := r || jsonb_build_object(k, pg_temp.sanitize_jsonb(v, scrub));
        end if;
      end loop;
      return r;
    when 'array' then
      select coalesce(jsonb_agg(pg_temp.sanitize_jsonb(e, scrub) order by ord), '[]'::jsonb)
        into r from jsonb_array_elements(j) with ordinality as t(e, ord);
      return r;
    when 'string' then
      if scrub and left(j #>> '{}', 5) <> 'data:' then
        return to_jsonb(pg_temp.sanitize_ocr_text(j #>> '{}'));
      end if;
      return j;
    else
      return j;
  end case;
end
$fn$;

create temp view pii_fp as
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

create temp view pii_targets as
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

create temp table fp_before on commit drop as select * from pii_fp;

alter table public.invoices  disable trigger trg_audit_invoices;
alter table public.invoices  disable trigger trg_touch_invoices;
alter table public.suppliers disable trigger trg_audit_suppliers;

update public.invoices  set supplier_phone = '' where coalesce(supplier_phone, '') <> '';
update public.suppliers set phone          = '' where coalesce(phone, '') <> '';

alter table public.invoices  enable trigger trg_audit_invoices;
alter table public.invoices  enable trigger trg_touch_invoices;
alter table public.suppliers enable trigger trg_audit_suppliers;

-- ocr_corrections — audit 트리거 없음. INSERT-ONLY 는 RLS 정책이며 postgres
-- 역할(테이블 소유자)은 RLS 를 우회한다. parsed_fields · user_edited_fields 는
-- 거래 데이터라 연락처 키만 비우고 문자열은 건드리지 않는다(오탐 방지).
update public.ocr_corrections set
  raw_text           = pg_temp.sanitize_ocr_text(raw_text),
  normalized_text    = pg_temp.sanitize_ocr_text(normalized_text),
  parsed_fields      = coalesce(pg_temp.sanitize_jsonb(parsed_fields, false), parsed_fields),
  user_edited_fields = pg_temp.sanitize_jsonb(user_edited_fields, false),
  debug_meta         = coalesce(pg_temp.sanitize_jsonb(debug_meta, true), debug_meta);

-- audit_log — 키는 남기고 값만 비운다 (감사 이벤트 · 행 보존).
update public.audit_log set
  old_data = case when old_data ? 'supplier_phone'
                  then jsonb_set(old_data, '{supplier_phone}', '""'::jsonb) else old_data end,
  new_data = case when new_data ? 'supplier_phone'
                  then jsonb_set(new_data, '{supplier_phone}', '""'::jsonb) else new_data end
 where table_name = 'invoices'
   and (coalesce(old_data ->> 'supplier_phone', '') <> '' or coalesce(new_data ->> 'supplier_phone', '') <> '');

update public.audit_log set
  old_data = case when old_data ? 'phone'
                  then jsonb_set(old_data, '{phone}', '""'::jsonb) else old_data end,
  new_data = case when new_data ? 'phone'
                  then jsonb_set(new_data, '{phone}', '""'::jsonb) else new_data end
 where table_name = 'suppliers'
   and (coalesce(old_data ->> 'phone', '') <> '' or coalesce(new_data ->> 'phone', '') <> '');

-- ---- 자기 검증: 통과하지 못하면 여기서 중단되고 아무것도 커밋되지 않는다 ----
do $check$
declare
  bad text;
begin
  select string_agg(b.metric, ', ' order by b.metric) into bad
    from fp_before b join pii_fp a using (metric)
   where a.v is distinct from b.v;
  if bad is not null then
    raise exception '보존 지문 불일치 — 롤백: %', bad;
  end if;

  select string_agg(target || '=' || n, ', ' order by target) into bad
    from pii_targets where n <> 0;
  if bad is not null then
    raise exception '개인정보 잔존 — 롤백: %', bad;
  end if;

  raise notice '자기 검증 통과 — 보존 지문 F01~F18 동일 · 제거 대상 T1~T5 = 0';
end
$check$;

commit;
