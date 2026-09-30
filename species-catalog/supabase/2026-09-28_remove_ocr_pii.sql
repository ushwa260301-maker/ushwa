-- =====================================================================
-- 2026-09-28 · 저장된 OCR 개인정보(계좌번호·전화번호·예금주) 제거
-- =====================================================================
--
-- 목적
--   이 조치 이전에 Cloud 에 저장된 연락처·계좌·예금주를 제거한다.
--   이후 신규 저장은 앱(js/sanitize.js)이 저장 직전에 차단한다.
--
-- 실행 방법 (Supabase SQL Editor · postgres 역할)
--   ① [0] PREVIEW 블록만 먼저 실행해 대상 건수를 확인·기록한다.
--   ② 건수가 예상과 맞으면 [1] CLEANUP 블록을 실행한다 (단일 트랜잭션).
--   ③ [2] VERIFY 블록을 실행한다 — 모든 행이 0 이어야 한다.
--   이 파일은 **실제 개인정보 값을 담지 않는다** (패턴으로만 판정).
--
-- 대상 (코드 기준으로 확인한 저장 경로 전부)
--   invoices.supplier_phone                       → ''
--   suppliers.phone                               → ''
--   ocr_corrections.raw_text / normalized_text    → 정제 (값을 토큰으로 치환)
--   ocr_corrections.debug_meta 전체               → 재귀 정제 (원문 · 저신뢰 줄 등)
--   ocr_corrections.parsed_fields · user_edited_fields → 모든 위치의 연락처 키 ''
--   audit_log (invoices · suppliers 기록의 old_data/new_data 안 전화) → ''
--
-- 대상이 아닌 것
--   species.suppliers[].contact 와 그 audit 기록 — 사용자가 수종 편집에서
--   직접 등록한 판매자 프로필일 수 있어 임의 삭제하지 않는다 (긴급 조치 §6).
--   attachments(원본 이미지) — 이미지 안의 글자는 SQL 로 지울 수 없다.
--
-- 왜 트리거를 끄는가
--   triggers.sql 의 fn_audit() 는 UPDATE 마다 to_jsonb(old) 를 audit_log 에
--   기록한다. 끄지 않고 전화번호를 지우면 **지운 값이 audit_log 에 새로
--   복사된다.** fn_touch_row() 는 version 을 올려, 캐시된 version 을 든
--   클라이언트의 다음 저장을 낙관적 잠금 충돌로 만든다 — 값 정리는 거래
--   내용 변경이 아니므로 version 을 올리지 않는다.
--   트리거 비활성화는 트랜잭션 안에서만 유효하다(DDL 트랜잭션) — 실패하면
--   원래 상태로 롤백된다.
--
-- 정제 규칙은 js/sanitize.js 가 정본이다. 아래 함수는 그 규칙을 옮긴 것이다.
-- =====================================================================


-- ---------------------------------------------------------------------
-- [0] PREVIEW — 먼저 이 블록만 실행한다. 값은 출력하지 않고 건수만.
-- ---------------------------------------------------------------------
with t as (
  -- 원문은 컬럼 2곳 + debug_meta 2곳에 저장된다. 한 번에 본다.
  -- debug_meta 는 경로를 나열하지 않고 모든 문자열 잎을 모은다 ('data:' 이미지 제외).
  select concat_ws(E'\n', raw_text, normalized_text,
                   (select string_agg(x #>> '{}', E'\n')
                      from jsonb_path_query(debug_meta, 'strict $.** ? (@.type() == "string")') as q(x)
                     where left(x #>> '{}', 5) <> 'data:')) as txt,
         parsed_fields, user_edited_fields, debug_meta
    from public.ocr_corrections
), pii as (
  -- sanitize.js 와 같은 판정: 전화 · 예금주 · 계좌 후보(10~16자리, 사업자번호 제외)
  select * from t
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
)
select 'invoices.supplier_phone'  as target, count(*) as rows
  from public.invoices  where coalesce(supplier_phone, '') <> ''
union all
select 'suppliers.phone', count(*)
  from public.suppliers where coalesce(phone, '') <> ''
union all
select 'ocr_corrections (개인정보가 실제로 남은 행)', count(*) from pii
union all
select 'audit_log · invoices.supplier_phone', count(*)
  from public.audit_log
 where table_name = 'invoices'
   and (coalesce(old_data ->> 'supplier_phone', '') <> ''
     or coalesce(new_data ->> 'supplier_phone', '') <> '')
union all
select 'audit_log · suppliers.phone', count(*)
  from public.audit_log
 where table_name = 'suppliers'
   and (coalesce(old_data ->> 'phone', '') <> ''
     or coalesce(new_data ->> 'phone', '') <> '');


-- ---------------------------------------------------------------------
-- [1] CLEANUP — 단일 트랜잭션. PREVIEW 건수를 확인한 뒤 실행한다.
-- ---------------------------------------------------------------------
begin;

-- js/sanitize.js sanitizeText() 의 SQL 이식. 세션 임시 함수 — 스키마에 남지 않는다.
-- 순서가 중요하다: 전화를 먼저 토큰으로 바꿔야 전화가 계좌 후보로 다시 잡히지 않는다.
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

-- js/sanitize.js scrubTree() 의 SQL 이식. jsonb 트리를 재귀로 걷는다.
--   연락처 키(contact · supplierPhone · phone) → ""
--   scrub=true 면 나머지 모든 문자열 → sanitize_ocr_text (단 'data:' 이미지 URL 제외)
-- 필드 경로를 나열하지 않는다: debug_meta.raw 에는 text/normalized 외에도
-- lowConfidenceLines[].text(저신뢰 OCR 줄 원문) 등이 있다 (브라우저 E2E 로 발견).
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

alter table public.invoices  disable trigger trg_audit_invoices;
alter table public.invoices  disable trigger trg_touch_invoices;
alter table public.suppliers disable trigger trg_audit_suppliers;

update public.invoices  set supplier_phone = '' where coalesce(supplier_phone, '') <> '';
update public.suppliers set phone          = '' where coalesce(phone, '') <> '';

alter table public.invoices  enable trigger trg_audit_invoices;
alter table public.invoices  enable trigger trg_touch_invoices;
alter table public.suppliers enable trigger trg_audit_suppliers;

-- ocr_corrections — audit 트리거 없음. INSERT-ONLY 는 RLS 정책이며 postgres
-- 역할(테이블 소유자)은 RLS 를 우회한다.
-- JSON 컬럼은 재귀 정제. parsed_fields · user_edited_fields 는 거래 데이터라
-- 연락처 키만 비우고 문자열은 건드리지 않는다(오탐 방지). debug_meta 는 진단
-- 트리라 문자열까지 정제한다. NULL 컬럼은 NULL 그대로 (함수가 NULL 을 돌려준다).
update public.ocr_corrections set
  raw_text           = pg_temp.sanitize_ocr_text(raw_text),
  normalized_text    = pg_temp.sanitize_ocr_text(normalized_text),
  parsed_fields      = coalesce(pg_temp.sanitize_jsonb(parsed_fields, false), parsed_fields),
  user_edited_fields = pg_temp.sanitize_jsonb(user_edited_fields, false),
  debug_meta         = coalesce(pg_temp.sanitize_jsonb(debug_meta, true), debug_meta);

-- audit_log — 과거 기록 안의 전화. 키는 남기고 값만 비운다 (기록 형태 보존).
update public.audit_log set
  old_data = case when old_data ? 'supplier_phone'
                  then jsonb_set(old_data, '{supplier_phone}', '""'::jsonb) else old_data end,
  new_data = case when new_data ? 'supplier_phone'
                  then jsonb_set(new_data, '{supplier_phone}', '""'::jsonb) else new_data end
 where table_name = 'invoices'
   and (coalesce(old_data ->> 'supplier_phone', '') <> ''
     or coalesce(new_data ->> 'supplier_phone', '') <> '');

update public.audit_log set
  old_data = case when old_data ? 'phone'
                  then jsonb_set(old_data, '{phone}', '""'::jsonb) else old_data end,
  new_data = case when new_data ? 'phone'
                  then jsonb_set(new_data, '{phone}', '""'::jsonb) else new_data end
 where table_name = 'suppliers'
   and (coalesce(old_data ->> 'phone', '') <> ''
     or coalesce(new_data ->> 'phone', '') <> '');

commit;


-- ---------------------------------------------------------------------
-- [2] VERIFY — 모든 행의 remaining 이 0 이어야 한다.
-- ---------------------------------------------------------------------
with t as (
  -- 원문은 컬럼 2곳 + debug_meta 2곳에 저장된다. 한 번에 본다.
  -- debug_meta 는 경로를 나열하지 않고 모든 문자열 잎을 모은다 ('data:' 이미지 제외).
  select concat_ws(E'\n', raw_text, normalized_text,
                   (select string_agg(x #>> '{}', E'\n')
                      from jsonb_path_query(debug_meta, 'strict $.** ? (@.type() == "string")') as q(x)
                     where left(x #>> '{}', 5) <> 'data:')) as txt,
         parsed_fields, user_edited_fields, debug_meta
    from public.ocr_corrections
), pii as (
  -- sanitize.js 와 같은 판정: 전화 · 예금주 · 계좌 후보(10~16자리, 사업자번호 제외)
  select * from t
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
)
select 'invoices.supplier_phone' as target, count(*) as remaining
  from public.invoices  where coalesce(supplier_phone, '') <> ''
union all
select 'suppliers.phone', count(*)
  from public.suppliers where coalesce(phone, '') <> ''
union all
select 'ocr_corrections (전화·계좌·예금주 · JSON 필드 포함)', count(*) from pii
union all
select 'audit_log 전화 (invoices · suppliers)', count(*)
  from public.audit_log
 where (table_name = 'invoices'
        and (coalesce(old_data ->> 'supplier_phone', '') <> '' or coalesce(new_data ->> 'supplier_phone', '') <> ''))
    or (table_name = 'suppliers'
        and (coalesce(old_data ->> 'phone', '') <> '' or coalesce(new_data ->> 'phone', '') <> ''));
